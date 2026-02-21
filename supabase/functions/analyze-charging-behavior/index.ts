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

    // Fetch recent transactions (last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: transactions } = await supabase
      .from("transactions")
      .select("id, charge_point_id, id_tag, start_time, stop_time, energy_delivered, cost, status")
      .gte("start_time", since)
      .order("start_time", { ascending: false })
      .limit(500);

    // Fetch charge points for names
    const { data: chargePoints } = await supabase
      .from("charge_points")
      .select("id, name, max_power, status");

    // Fetch RFID tags for user labels
    const { data: tags } = await supabase
      .from("authorized_tags")
      .select("id_tag, label");

    // Build summary for AI
    const tagMap = Object.fromEntries((tags || []).map(t => [t.id_tag, t.label || t.id_tag]));
    const cpMap = Object.fromEntries((chargePoints || []).map(cp => [cp.id, cp.name]));

    const summary = {
      total_transactions: transactions?.length || 0,
      charge_points: chargePoints?.map(cp => ({ name: cp.name, max_power_kw: (cp.max_power || 0) / 1000, status: cp.status })),
      transactions_sample: (transactions || []).slice(0, 100).map(t => ({
        user: tagMap[t.id_tag] || t.id_tag,
        charge_point: cpMap[t.charge_point_id] || t.charge_point_id,
        start: t.start_time,
        stop: t.stop_time,
        energy_kwh: t.energy_delivered ? Number(t.energy_delivered) / 1000 : null,
        cost_eur: t.cost,
        duration_min: t.stop_time ? Math.round((new Date(t.stop_time).getTime() - new Date(t.start_time).getTime()) / 60000) : null,
      })),
    };

    const prompt = `Je bent een expert in laadgedrag-analyse voor elektrische voertuigen. Analyseer de volgende laadtransacties en geef een JSON-response met gedragsmodellen.

DATA:
${JSON.stringify(summary, null, 2)}

Geef een JSON object terug met exact dit formaat (geen markdown, alleen JSON):
{
  "patterns": [
    {
      "title": "Korte titel van het patroon",
      "description": "Beschrijving van het waargenomen gedrag",
      "confidence": 0.85,
      "impact": "high|medium|low",
      "recommendation": "Aanbeveling voor smart charging optimalisatie",
      "icon": "clock|zap|sun|battery|user|trend"
    }
  ],
  "user_profiles": [
    {
      "user": "Gebruiker naam/tag",
      "type": "commuter|fleet|occasional|night_charger",
      "avg_session_kwh": 12.5,
      "preferred_hours": "08:00-17:00",
      "frequency": "dagelijks|wekelijks|sporadisch",
      "predictability": 0.9
    }
  ],
  "peak_hours": [{ "hour": 8, "load_pct": 85 }, { "hour": 17, "load_pct": 92 }],
  "summary": "Korte samenvatting van de belangrijkste bevindingen"
}

Beperk je tot maximaal 5 patterns, 5 user_profiles en 24 peak_hours. Als er weinig data is, geef dan minder resultaten maar wees eerlijk over de beperkte betrouwbaarheid.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Je bent een data-analist gespecialiseerd in EV-laadgedrag. Antwoord altijd in valide JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", errText);
      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "{}";
    
    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      analysis = { patterns: [], user_profiles: [], peak_hours: [], summary: "Analyse kon niet worden verwerkt." };
    }

    return new Response(JSON.stringify(analysis), {
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
