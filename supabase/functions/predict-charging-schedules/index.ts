import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const applyChargePointId = body?.apply_to_charge_point_id || null;

    // Fetch latest behavior analysis
    const { data: latestAnalysis } = await supabase
      .from("charging_behavior_analyses")
      .select("*")
      .order("analysis_date", { ascending: false })
      .limit(3);

    // Fetch charge points
    const { data: chargePoints } = await supabase
      .from("charge_points")
      .select("id, name, max_power, status");

    // Fetch active profiles
    const { data: activeProfiles } = await supabase
      .from("charging_profiles")
      .select("charge_point_id, charging_profile_purpose, stack_level, schedule_periods, charging_schedule_unit, duration")
      .eq("active", true);

    // Fetch tariffs for cost optimization
    const { data: tariffs } = await supabase
      .from("charging_tariffs")
      .select("name, price_per_kwh, start_fee, idle_fee_per_min, active, is_default")
      .eq("active", true);

    const prompt = `Je bent een expert in EV smart charging optimalisatie. Op basis van de gedragsanalyse en systeemconfiguratie, genereer optimale voorspellende laadschema's.

GEDRAGSANALYSES (laatste ${latestAnalysis?.length || 0} dagen):
${JSON.stringify(latestAnalysis?.map(a => ({
  date: a.analysis_date,
  patterns: a.patterns,
  user_profiles: a.user_profiles,
  peak_hours: a.peak_hours,
  summary: a.summary,
  transaction_count: a.transaction_count,
  total_energy_kwh: a.total_energy_kwh,
})), null, 2)}

LAADPALEN:
${JSON.stringify(chargePoints?.map(cp => ({
  id: cp.id,
  name: cp.name,
  max_power_w: cp.max_power || 0,
  status: cp.status,
})), null, 2)}

HUIDIGE ACTIEVE PROFIELEN:
${JSON.stringify(activeProfiles, null, 2)}

TARIEVEN:
${JSON.stringify(tariffs, null, 2)}

Genereer een JSON object met exact dit formaat (geen markdown, alleen JSON):
{
  "schedules": [
    {
      "name": "Korte naam van het schema",
      "description": "Uitleg waarom dit schema optimaal is",
      "target_charge_point_ids": ["cp-id-1"],
      "reasoning": "Onderbouwing op basis van gedragspatronen",
      "estimated_saving_pct": 15,
      "profile": {
        "connectorId": 0,
        "stackLevel": 0,
        "chargingProfilePurpose": "ChargePointMaxProfile",
        "chargingProfileKind": "Absolute",
        "chargingSchedule": {
          "chargingRateUnit": "W",
          "duration": 86400,
          "chargingSchedulePeriod": [
            { "startPeriod": 0, "limit": 11000 },
            { "startPeriod": 61200, "limit": 3700 },
            { "startPeriod": 75600, "limit": 11000 }
          ]
        }
      },
      "confidence": 0.85,
      "category": "cost_optimization|peak_shaving|solar_alignment|load_balancing"
    }
  ],
  "summary": "Samenvatting van de voorgestelde optimalisaties en verwachte besparingen"
}

Regels:
- Genereer 2-4 schema's gebaseerd op de waargenomen patronen
- Gebruik realistische vermogenswaarden (max van de laadpaal respecteren)
- startPeriod is in seconden vanaf middernacht (0 = 00:00, 3600 = 01:00, etc.)
- Limit is in Watt
- Onderbouw elk schema met specifieke patronen uit de gedragsanalyse
- Schat de besparing realistisch in (kosten, piekvermogen, of netbelasting)
- Als er weinig data is, wees conservatief met schattingen`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Je bent een EV-laadoptimalisatie expert. Antwoord altijd in valide JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits op, voeg credits toe aan je workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "{}";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      result = { schedules: [], summary: "Kon geen schema's genereren." };
    }

    // If apply requested, set the profile via DB insert
    if (applyChargePointId && result.schedules?.length > 0) {
      const schedule = result.schedules.find((s: any) => 
        s.target_charge_point_ids?.includes(applyChargePointId)
      ) || result.schedules[0];

      if (schedule?.profile) {
        const { error: insertError } = await supabase
          .from("charging_profiles")
          .insert({
            charge_point_id: applyChargePointId,
            connector_id: schedule.profile.connectorId || 0,
            stack_level: schedule.profile.stackLevel || 0,
            charging_profile_purpose: schedule.profile.chargingProfilePurpose || "ChargePointMaxProfile",
            charging_profile_kind: schedule.profile.chargingProfileKind || "Absolute",
            charging_schedule_unit: schedule.profile.chargingSchedule?.chargingRateUnit || "W",
            duration: schedule.profile.chargingSchedule?.duration || 86400,
            schedule_periods: schedule.profile.chargingSchedule?.chargingSchedulePeriod || [],
            active: true,
          });

        if (insertError) {
          console.error("Failed to insert profile:", insertError);
          result.apply_error = insertError.message;
        } else {
          result.applied = true;
          result.applied_schedule = schedule.name;
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
