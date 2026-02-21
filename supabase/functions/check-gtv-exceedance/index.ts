import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Fetch all enabled virtual grids
    const { data: grids, error: gridErr } = await supabase
      .from("virtual_grids")
      .select("id, name, gtv_limit_kw")
      .eq("enabled", true);

    if (gridErr) throw gridErr;
    if (!grids?.length) {
      return jsonRes({ checked: 0, message: "No enabled grids" });
    }

    const results: any[] = [];

    for (const grid of grids) {
      // 2. Fetch enabled members
      const { data: members } = await supabase
        .from("virtual_grid_members")
        .select("id, member_id, member_type, member_name, max_power_kw")
        .eq("grid_id", grid.id)
        .eq("enabled", true);

      if (!members?.length) continue;

      // 3. Get latest power for each member
      let totalPowerKw = 0;

      // Meter-based members (energy_meter, solar)
      const meterMembers = members.filter(
        (m) => m.member_type === "energy_meter" || m.member_type === "solar"
      );
      for (const m of meterMembers) {
        const { data: reading } = await supabase
          .from("meter_readings")
          .select("active_power")
          .eq("meter_id", m.member_id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reading?.active_power != null) {
          totalPowerKw += Math.abs(reading.active_power) / 1000; // W → kW
        }
      }

      // Charge point members
      const cpMembers = members.filter((m) => m.member_type === "charge_point");
      for (const m of cpMembers) {
        const { data: mv } = await supabase
          .from("meter_values")
          .select("value, unit")
          .eq("charge_point_id", m.member_id)
          .eq("measurand", "Power.Active.Import")
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (mv) {
          totalPowerKw += mv.unit === "W" ? mv.value / 1000 : mv.value;
        }
      }

      totalPowerKw = Math.round(totalPowerKw * 100) / 100;

      // 4. Check exceedance
      if (totalPowerKw > grid.gtv_limit_kw) {
        // Rate-limit: don't insert if there's a recent exceedance (within 5 min)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from("gtv_exceedances")
          .select("id")
          .gte("created_at", fiveMinAgo)
          .limit(1);

        if (recent?.length) {
          results.push({
            grid: grid.name,
            power_kw: totalPowerKw,
            limit_kw: grid.gtv_limit_kw,
            action: "rate_limited",
          });
          continue;
        }

        // Insert exceedance record
        await supabase.from("gtv_exceedances").insert({
          power_kw: totalPowerKw,
          limit_kw: grid.gtv_limit_kw,
          direction: "import",
          meter_id: meterMembers[0]?.member_id || null,
        });

        // Send alert notification
        const alertPayload = {
          metric: "gtv_power",
          label: `GTV Overschrijding — ${grid.name}`,
          value: totalPowerKw,
          unit: "kW",
          direction: "high" as const,
          channel: 0,
          threshold_min: 0,
          threshold_max: grid.gtv_limit_kw,
        };

        try {
          await fetch(`${supabaseUrl}/functions/v1/send-alert-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(alertPayload),
          });
        } catch (notifyErr) {
          console.error("Failed to send notification:", notifyErr);
        }

        results.push({
          grid: grid.name,
          power_kw: totalPowerKw,
          limit_kw: grid.gtv_limit_kw,
          action: "exceedance_recorded",
        });
      } else {
        results.push({
          grid: grid.name,
          power_kw: totalPowerKw,
          limit_kw: grid.gtv_limit_kw,
          action: "ok",
        });
      }
    }

    console.log("GTV check results:", JSON.stringify(results));
    return jsonRes({ checked: grids.length, results });
  } catch (err) {
    console.error("GTV check error:", err);
    return jsonRes({ error: String(err) }, 500);
  }
});

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
