import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all ready models with alerts enabled
    const { data: models, error: modelsErr } = await supabase
      .from("meter_ai_models")
      .select("*")
      .eq("status", "ready")
      .eq("alerts_enabled", true);

    if (modelsErr) throw modelsErr;
    if (!models || models.length === 0) {
      return new Response(JSON.stringify({ message: "No active models to evaluate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group models by meter_id
    const meterModels = new Map<string, typeof models>();
    for (const m of models) {
      const list = meterModels.get(m.meter_id) ?? [];
      list.push(m);
      meterModels.set(m.meter_id, list);
    }

    const alerts: any[] = [];
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    for (const [meterId, meterModelList] of meterModels) {
      // Fetch recent readings (last 5 minutes)
      const { data: readings, error: readErr } = await supabase
        .from("meter_readings")
        .select("channel, active_power, timestamp")
        .eq("meter_id", meterId)
        .gte("timestamp", fiveMinAgo.toISOString())
        .order("timestamp", { ascending: true })
        .limit(500);

      if (readErr || !readings || readings.length === 0) continue;

      // Aggregate total power per timestamp
      const byTimestamp = new Map<string, number>();
      for (const r of readings) {
        byTimestamp.set(r.timestamp, (byTimestamp.get(r.timestamp) ?? 0) + (r.active_power ?? 0));
      }

      const powers = Array.from(byTimestamp.values());
      const timestamps = Array.from(byTimestamp.keys()).sort();
      if (powers.length === 0) continue;

      const currentAvgPower = powers.reduce((s, v) => s + v, 0) / powers.length;

      for (const model of meterModelList) {
        const baseline = model.baseline_data as Record<string, any>;
        if (!baseline) continue;

        let triggered = false;
        let alertValue = 0;
        let alertMetric = "";
        let alertDirection = "";
        let thresholdMin = 0;
        let thresholdMax = 0;

        switch (model.model_type) {
          case "consumption_high": {
            const threshold = baseline.threshold;
            if (threshold != null && currentAvgPower > threshold) {
              triggered = true;
              alertValue = +currentAvgPower.toFixed(1);
              alertMetric = "ai_consumption_high";
              alertDirection = "above";
              thresholdMin = baseline.mean ?? 0;
              thresholdMax = threshold;
            }
            break;
          }
          case "consumption_low": {
            const threshold = baseline.threshold;
            if (threshold != null && currentAvgPower < threshold) {
              triggered = true;
              alertValue = +currentAvgPower.toFixed(1);
              alertMetric = "ai_consumption_low";
              alertDirection = "below";
              thresholdMin = threshold;
              thresholdMax = baseline.mean ?? 0;
            }
            break;
          }
          case "long_working_cycle": {
            const thresholdMin_ = baseline.thresholdMin;
            if (thresholdMin_ != null && timestamps.length >= 2) {
              // Check if current working cycle exceeds threshold
              const idleThreshold = Math.abs(baseline.mean ?? 0) * 0.1;
              let cycleStartIdx = 0;
              // Find the last transition to working
              for (let i = timestamps.length - 1; i >= 1; i--) {
                if (Math.abs(powers[i]) <= idleThreshold) {
                  cycleStartIdx = i + 1;
                  break;
                }
              }
              if (cycleStartIdx < timestamps.length) {
                const cycleDurMin = (new Date(timestamps[timestamps.length - 1]).getTime() - new Date(timestamps[cycleStartIdx]).getTime()) / 60000;
                if (cycleDurMin > thresholdMin_) {
                  triggered = true;
                  alertValue = +cycleDurMin.toFixed(1);
                  alertMetric = "ai_long_working_cycle";
                  alertDirection = "above";
                  thresholdMin = baseline.avgCycleMin ?? 0;
                  thresholdMax = thresholdMin_;
                }
              }
            }
            break;
          }
          case "long_idle_cycle": {
            const thresholdMin_ = baseline.thresholdMin;
            if (thresholdMin_ != null && timestamps.length >= 2) {
              const idleThreshold = Math.abs(baseline.mean ?? 0) * 0.1;
              let cycleStartIdx = 0;
              for (let i = timestamps.length - 1; i >= 1; i--) {
                if (Math.abs(powers[i]) > idleThreshold) {
                  cycleStartIdx = i + 1;
                  break;
                }
              }
              if (cycleStartIdx < timestamps.length) {
                const cycleDurMin = (new Date(timestamps[timestamps.length - 1]).getTime() - new Date(timestamps[cycleStartIdx]).getTime()) / 60000;
                if (cycleDurMin > thresholdMin_) {
                  triggered = true;
                  alertValue = +cycleDurMin.toFixed(1);
                  alertMetric = "ai_long_idle_cycle";
                  alertDirection = "above";
                  thresholdMin = baseline.avgCycleMin ?? 0;
                  thresholdMax = thresholdMin_;
                }
              }
            }
            break;
          }
        }

        if (triggered) {
          // Deduplicate: check if an alert for this metric+meter already exists in the last 30 min
          const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
          const { data: existing } = await supabase
            .from("grid_alerts")
            .select("id")
            .eq("meter_id", meterId)
            .eq("metric", alertMetric)
            .gte("created_at", thirtyMinAgo.toISOString())
            .limit(1);

          if (!existing || existing.length === 0) {
            const unit = alertMetric.includes("cycle") ? "min" : "W";
            alerts.push({
              meter_id: meterId,
              metric: alertMetric,
              value: alertValue,
              threshold_min: thresholdMin,
              threshold_max: thresholdMax,
              direction: alertDirection,
              unit,
              channel: 0,
            });
          }
        }
      }
    }

    // Batch insert alerts
    if (alerts.length > 0) {
      const { error: insertErr } = await supabase
        .from("grid_alerts")
        .insert(alerts);
      if (insertErr) throw insertErr;
    }

    console.log(`Evaluated ${models.length} models, generated ${alerts.length} alerts`);

    return new Response(
      JSON.stringify({ evaluated: models.length, alertsGenerated: alerts.length, alerts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("evaluate-meter-models error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
