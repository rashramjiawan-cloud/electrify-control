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

    // Fetch retention settings
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "meter_data_retention_days",
        "grid_alerts_retention_days",
        "audit_log_retention_days",
      ]);

    if (settingsError) throw settingsError;

    const getRetention = (key: string, fallback: number) => {
      const s = settings?.find((r: any) => r.key === key);
      return s ? parseInt(s.value, 10) : fallback;
    };

    const meterDays = getRetention("meter_data_retention_days", 90);
    const alertDays = getRetention("grid_alerts_retention_days", 180);
    const auditDays = getRetention("audit_log_retention_days", 365);

    const results: Record<string, number> = {};

    // Delete old meter_readings
    const { count: meterCount } = await supabase
      .from("meter_readings")
      .delete({ count: "exact" })
      .lt("timestamp", new Date(Date.now() - meterDays * 86400000).toISOString());
    results.meter_readings_deleted = meterCount ?? 0;

    // Delete old grid_alerts
    const { count: alertCount } = await supabase
      .from("grid_alerts")
      .delete({ count: "exact" })
      .lt("created_at", new Date(Date.now() - alertDays * 86400000).toISOString());
    results.grid_alerts_deleted = alertCount ?? 0;

    // Delete old ocpp_audit_log
    const { count: auditCount } = await supabase
      .from("ocpp_audit_log")
      .delete({ count: "exact" })
      .lt("created_at", new Date(Date.now() - auditDays * 86400000).toISOString());
    results.audit_log_deleted = auditCount ?? 0;

    // Delete old meter_values
    const { count: mvCount } = await supabase
      .from("meter_values")
      .delete({ count: "exact" })
      .lt("timestamp", new Date(Date.now() - meterDays * 86400000).toISOString());
    results.meter_values_deleted = mvCount ?? 0;

    // Delete old heartbeats
    const { count: hbCount } = await supabase
      .from("heartbeats")
      .delete({ count: "exact" })
      .lt("received_at", new Date(Date.now() - meterDays * 86400000).toISOString());
    results.heartbeats_deleted = hbCount ?? 0;

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
