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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);
    const { meterId, modelType } = await req.json();

    if (!meterId || !modelType) {
      return new Response(JSON.stringify({ error: "meterId and modelType required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark model as training
    const { data: model, error: upsertErr } = await supabase
      .from("meter_ai_models")
      .upsert(
        { meter_id: meterId, model_type: modelType, status: "training", baseline_data: {} },
        { onConflict: "meter_id,model_type" }
      )
      .select()
      .single();

    if (upsertErr) throw upsertErr;

    // Fetch last 7 days of readings for this meter
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const { data: readings, error: readErr } = await supabase
      .from("meter_readings")
      .select("channel, active_power, voltage, current, timestamp")
      .eq("meter_id", meterId)
      .gte("timestamp", since.toISOString())
      .order("timestamp", { ascending: true })
      .limit(1000);

    if (readErr) throw readErr;

    if (!readings || readings.length < 10) {
      await supabase
        .from("meter_ai_models")
        .update({ status: "failed", baseline_data: { error: "Onvoldoende data (min. 10 metingen nodig)" } })
        .eq("id", model.id);

      return new Response(
        JSON.stringify({ error: "Insufficient data", minReadings: 10, actual: readings?.length ?? 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sum active_power across all channels per timestamp
    const byTimestamp = new Map<string, number>();
    for (const r of readings) {
      byTimestamp.set(r.timestamp, (byTimestamp.get(r.timestamp) ?? 0) + (r.active_power ?? 0));
    }

    const powers = Array.from(byTimestamp.values());
    const timestamps = Array.from(byTimestamp.keys()).sort();

    // Compute statistical baselines
    const mean = powers.reduce((s, v) => s + v, 0) / powers.length;
    const variance = powers.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / powers.length;
    const stdDev = Math.sqrt(variance);
    const sorted = [...powers].sort((a, b) => a - b);
    const p5 = sorted[Math.floor(sorted.length * 0.05)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const minPower = sorted[0];
    const maxPower = sorted[sorted.length - 1];

    // Compute hourly averages
    const hourlyBuckets: { [hour: number]: number[] } = {};
    for (const [ts, power] of byTimestamp) {
      const hour = new Date(ts).getHours();
      if (!hourlyBuckets[hour]) hourlyBuckets[hour] = [];
      hourlyBuckets[hour].push(power);
    }
    const hourlyAvg: { [hour: number]: number } = {};
    for (const [hour, vals] of Object.entries(hourlyBuckets)) {
      hourlyAvg[Number(hour)] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }

    // Compute working/idle cycle durations
    const idleThreshold = Math.abs(mean) * 0.1; // 10% of mean = idle
    let cycles: { type: "working" | "idle"; durationMin: number }[] = [];
    let currentType: "working" | "idle" = Math.abs(powers[0]) > idleThreshold ? "working" : "idle";
    let cycleStart = 0;

    for (let i = 1; i < timestamps.length; i++) {
      const isWorking = Math.abs(powers[i]) > idleThreshold;
      const newType = isWorking ? "working" : "idle";
      if (newType !== currentType) {
        const durMin = (new Date(timestamps[i]).getTime() - new Date(timestamps[cycleStart]).getTime()) / 60000;
        cycles.push({ type: currentType, durationMin: durMin });
        currentType = newType;
        cycleStart = i;
      }
    }
    // Final cycle
    if (timestamps.length > 1) {
      const durMin = (new Date(timestamps[timestamps.length - 1]).getTime() - new Date(timestamps[cycleStart]).getTime()) / 60000;
      cycles.push({ type: currentType, durationMin: durMin });
    }

    const workingCycles = cycles.filter(c => c.type === "working").map(c => c.durationMin);
    const idleCycles = cycles.filter(c => c.type === "idle").map(c => c.durationMin);

    const avgWorkingCycle = workingCycles.length ? workingCycles.reduce((s, v) => s + v, 0) / workingCycles.length : 0;
    const avgIdleCycle = idleCycles.length ? idleCycles.reduce((s, v) => s + v, 0) / idleCycles.length : 0;

    // Build model-specific thresholds
    let baseline: Record<string, any> = {
      dataPoints: powers.length,
      periodDays: 7,
      mean: +mean.toFixed(1),
      stdDev: +stdDev.toFixed(1),
      p5: +p5.toFixed(1),
      p95: +p95.toFixed(1),
      min: +minPower.toFixed(1),
      max: +maxPower.toFixed(1),
      hourlyAvg,
    };

    switch (modelType) {
      case "consumption_high":
        baseline.threshold = +(mean + 2 * stdDev).toFixed(1);
        baseline.description = "Triggered when total power exceeds mean + 2σ";
        break;
      case "consumption_low":
        baseline.threshold = +(mean - 2 * stdDev).toFixed(1);
        baseline.description = "Triggered when total power drops below mean - 2σ";
        break;
      case "long_working_cycle":
        baseline.avgCycleMin = +avgWorkingCycle.toFixed(1);
        baseline.thresholdMin = +(avgWorkingCycle * 2).toFixed(1);
        baseline.description = "Triggered when working cycle exceeds 2x average duration";
        break;
      case "long_idle_cycle":
        baseline.avgCycleMin = +avgIdleCycle.toFixed(1);
        baseline.thresholdMin = +(avgIdleCycle * 2).toFixed(1);
        baseline.description = "Triggered when idle cycle exceeds 2x average duration";
        break;
    }

    // Use AI to generate a summary if available
    let aiSummary: string | null = null;
    if (lovableApiKey) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: "You are an energy monitoring AI. Analyze the baseline data and provide a brief 2-3 sentence Dutch summary of the device's energy profile and what the model will detect. Be concise and technical.",
              },
              {
                role: "user",
                content: `Model type: ${modelType}\nBaseline: ${JSON.stringify(baseline)}\nWorking cycles: ${workingCycles.length}, Idle cycles: ${idleCycles.length}`,
              },
            ],
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          aiSummary = aiData.choices?.[0]?.message?.content ?? null;
        }
      } catch (e) {
        console.error("AI summary failed:", e);
      }
    }

    if (aiSummary) baseline.aiSummary = aiSummary;

    // Save trained model
    const trainedAt = new Date().toISOString();
    await supabase
      .from("meter_ai_models")
      .update({ status: "ready", baseline_data: baseline, trained_at: trainedAt })
      .eq("id", model.id);

    // Save history snapshot
    await supabase
      .from("meter_ai_model_history")
      .insert({
        model_id: model.id,
        meter_id: meterId,
        model_type: modelType,
        baseline_data: baseline,
        trained_at: trainedAt,
      });

    return new Response(JSON.stringify({ success: true, baseline }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("train-meter-model error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
