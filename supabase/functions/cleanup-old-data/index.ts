import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check for dry_run mode (preview only, no deletes)
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch { /* no body or invalid json, proceed normally */ }

    // Fetch retention settings
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "meter_data_retention_days",
        "grid_alerts_retention_days",
        "audit_log_retention_days",
        "load_balance_logs_retention_days",
        "device_health_retention_days",
      ]);

    if (settingsError) throw settingsError;

    const getRetention = (key: string, fallback: number) => {
      const s = settings?.find((r: any) => r.key === key);
      return s ? parseInt(s.value, 10) : fallback;
    };

    const meterDays = getRetention("meter_data_retention_days", 90);
    const alertDays = getRetention("grid_alerts_retention_days", 180);
    const auditDays = getRetention("audit_log_retention_days", 365);
    const lbDays = getRetention("load_balance_logs_retention_days", 30);

    const meterCutoff = new Date(Date.now() - meterDays * 86400000).toISOString();
    const alertCutoff = new Date(Date.now() - alertDays * 86400000).toISOString();
    const auditCutoff = new Date(Date.now() - auditDays * 86400000).toISOString();
    const lbCutoff = new Date(Date.now() - lbDays * 86400000).toISOString();

    if (dryRun) {
      // Count only, no deletes
      const [mr, ga, al, mv, hb, lb] = await Promise.all([
        supabase.from("meter_readings").select("id", { count: "exact", head: true }).lt("timestamp", meterCutoff),
        supabase.from("grid_alerts").select("id", { count: "exact", head: true }).lt("created_at", alertCutoff),
        supabase.from("ocpp_audit_log").select("id", { count: "exact", head: true }).lt("created_at", auditCutoff),
        supabase.from("meter_values").select("id", { count: "exact", head: true }).lt("timestamp", meterCutoff),
        supabase.from("heartbeats").select("id", { count: "exact", head: true }).lt("received_at", meterCutoff),
        supabase.from("load_balance_logs").select("id", { count: "exact", head: true }).lt("created_at", lbCutoff),
      ]);

      return new Response(JSON.stringify({
        dry_run: true,
        meter_readings: mr.count ?? 0,
        grid_alerts: ga.count ?? 0,
        audit_log: al.count ?? 0,
        meter_values: mv.count ?? 0,
        heartbeats: hb.count ?? 0,
        load_balance_logs: lb.count ?? 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, number> = {};

    const { count: meterCount } = await supabase
      .from("meter_readings")
      .delete({ count: "exact" })
      .lt("timestamp", meterCutoff);
    results.meter_readings_deleted = meterCount ?? 0;

    const { count: alertCount } = await supabase
      .from("grid_alerts")
      .delete({ count: "exact" })
      .lt("created_at", alertCutoff);
    results.grid_alerts_deleted = alertCount ?? 0;

    const { count: auditCount } = await supabase
      .from("ocpp_audit_log")
      .delete({ count: "exact" })
      .lt("created_at", auditCutoff);
    results.audit_log_deleted = auditCount ?? 0;

    const { count: mvCount } = await supabase
      .from("meter_values")
      .delete({ count: "exact" })
      .lt("timestamp", meterCutoff);
    results.meter_values_deleted = mvCount ?? 0;

    const { count: hbCount } = await supabase
      .from("heartbeats")
      .delete({ count: "exact" })
      .lt("received_at", meterCutoff);
    results.heartbeats_deleted = hbCount ?? 0;

    const { count: lbCount } = await supabase
      .from("load_balance_logs")
      .delete({ count: "exact" })
      .lt("created_at", lbCutoff);
    results.load_balance_logs_deleted = lbCount ?? 0;

    console.log("Cleanup completed:", results);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
