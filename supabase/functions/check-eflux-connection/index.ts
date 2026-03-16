import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHARGE_POINT_ID = "EVB-P2447137";
const MAX_HEARTBEAT_AGE_SEC = 120; // Heartbeat mag max 2 min oud zijn
const MAX_PROXY_LOG_AGE_SEC = 300; // Proxy log mag max 5 min oud zijn

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const now = new Date();
    const checks: Record<string, unknown> = {};

    // 1. Check: Is de lader online? (recent heartbeat)
    const heartbeatCutoff = new Date(now.getTime() - MAX_HEARTBEAT_AGE_SEC * 1000).toISOString();
    const { data: heartbeats } = await supabase
      .from("heartbeats")
      .select("received_at")
      .eq("charge_point_id", CHARGE_POINT_ID)
      .gte("received_at", heartbeatCutoff)
      .order("received_at", { ascending: false })
      .limit(1);

    const chargerOnline = heartbeats && heartbeats.length > 0;
    checks.charger_online = chargerOnline;
    checks.last_heartbeat = heartbeats?.[0]?.received_at || null;

    // 2. Check: Is er een E-flux proxy backend geconfigureerd en enabled?
    const { data: backends } = await supabase
      .from("ocpp_proxy_backends")
      .select("*")
      .eq("enabled", true);

    const efluxBackend = backends?.find(
      (b: any) => b.name.toLowerCase().includes("flux") || b.url.toLowerCase().includes("flux")
    );

    checks.eflux_backend_configured = !!efluxBackend;
    checks.eflux_backend_status = efluxBackend?.connection_status || "not_found";
    checks.eflux_backend_last_error = efluxBackend?.last_error || null;

    // 3. Check: Zijn er recente succesvolle proxy forwards naar E-flux?
    let proxyActive = false;
    if (efluxBackend) {
      const proxyCutoff = new Date(now.getTime() - MAX_PROXY_LOG_AGE_SEC * 1000).toISOString();
      const { data: proxyLogs } = await supabase
        .from("ocpp_proxy_log")
        .select("created_at, status, action")
        .eq("backend_id", efluxBackend.id)
        .eq("charge_point_id", CHARGE_POINT_ID)
        .eq("status", "success")
        .gte("created_at", proxyCutoff)
        .order("created_at", { ascending: false })
        .limit(1);

      proxyActive = proxyLogs && proxyLogs.length > 0;
      checks.proxy_active = proxyActive;
      checks.last_proxy_forward = proxyLogs?.[0]?.created_at || null;

      // Also check for recent errors
      const { data: errorLogs } = await supabase
        .from("ocpp_proxy_log")
        .select("created_at, error_message")
        .eq("backend_id", efluxBackend.id)
        .eq("charge_point_id", CHARGE_POINT_ID)
        .eq("status", "error")
        .order("created_at", { ascending: false })
        .limit(3);

      checks.recent_errors = errorLogs || [];
    }

    // 4. Determine overall status
    let status: "ok" | "warning" | "critical";
    let message: string;

    if (!chargerOnline) {
      status = "critical";
      message = `EVBox ${CHARGE_POINT_ID} is offline — geen heartbeat in de laatste ${MAX_HEARTBEAT_AGE_SEC}s`;
    } else if (!efluxBackend) {
      status = "critical";
      message = "Geen E-flux proxy backend geconfigureerd";
    } else if (!proxyActive) {
      status = "warning";
      message = `Lader online maar geen succesvolle proxy forward naar E-flux in de laatste ${MAX_PROXY_LOG_AGE_SEC}s`;
    } else {
      status = "ok";
      message = "EVBox verbonden en E-flux proxy actief";
    }

    checks.status = status;
    checks.message = message;
    checks.checked_at = now.toISOString();

    console.log(`[CHECK-EFLUX] ${status}: ${message}`);

    // 5. Log result to ocpp_audit_log
    await supabase.from("ocpp_audit_log").insert({
      charge_point_id: CHARGE_POINT_ID,
      action: "EfluxConnectionCheck",
      status: status === "ok" ? "Accepted" : "Faulted",
      payload: checks,
      result: { status, message },
    });

    // 6. Send notification if not OK
    if (status !== "ok") {
      console.log(`[CHECK-EFLUX] Sending alert notification...`);

      // Fetch enabled notification channels
      const { data: channels } = await supabase
        .from("notification_channels")
        .select("*")
        .eq("enabled", true);

      if (channels && channels.length > 0) {
        const subject = `⚠️ E-flux Connectie: ${status === "critical" ? "KRITIEK" : "WAARSCHUWING"}`;
        const body = message;

        for (const ch of channels) {
          const config = ch.config as Record<string, any>;
          try {
            if (ch.type === "webhook" && config.url) {
              await fetch(config.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  event: "eflux_connection_check",
                  title: subject,
                  message: body,
                  status,
                  checks,
                  timestamp: now.toISOString(),
                }),
                signal: AbortSignal.timeout(10000),
              });
            }

            if (ch.type === "slack" && config.webhook_url) {
              const emoji = status === "critical" ? "🔴" : "🟡";
              await fetch(config.webhook_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: `${emoji} ${subject}\n${body}`,
                }),
                signal: AbortSignal.timeout(10000),
              });
            }

            if (ch.type === "email" && config.to) {
              const resendKey = Deno.env.get("RESEND_API_KEY");
              if (resendKey) {
                const recipients = Array.isArray(config.to) ? config.to : [config.to];
                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${resendKey}`,
                  },
                  body: JSON.stringify({
                    from: `VoltControl Alerts <${config.from || "alerts@resend.dev"}>`,
                    to: recipients,
                    subject,
                    html: `<h2>${subject}</h2><p>${body}</p><pre>${JSON.stringify(checks, null, 2)}</pre>`,
                  }),
                  signal: AbortSignal.timeout(10000),
                });
              }
            }
          } catch (notifErr) {
            console.error(`[CHECK-EFLUX] Notification error (${ch.name}):`, notifErr);
          }
        }
      }
    }

    return new Response(JSON.stringify(checks), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[CHECK-EFLUX] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
