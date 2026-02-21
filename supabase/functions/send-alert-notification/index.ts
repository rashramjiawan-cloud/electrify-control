import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AlertPayload {
  metric: string;
  label: string;
  value: number;
  unit: string;
  direction: "low" | "high";
  channel: number;
  meter_id?: string;
  threshold_min: number;
  threshold_max: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const alert: AlertPayload = await req.json();

    // Fetch enabled notification channels
    const { data: channels, error } = await supabase
      .from("notification_channels")
      .select("*")
      .eq("enabled", true);

    if (error) throw error;
    if (!channels?.length) {
      return jsonRes({ success: true, sent: 0, message: "No channels configured" });
    }

    const directionNl = alert.direction === "low" ? "te laag" : "te hoog";
    const subject = `⚠️ ${alert.label} ${directionNl} — Fase ${alert.channel + 1}`;
    const body = `${alert.label} is ${alert.value}${alert.unit ? " " + alert.unit : ""} (bereik: ${alert.threshold_min}–${alert.threshold_max}${alert.unit ? " " + alert.unit : ""})`;

    const results: any[] = [];

    for (const ch of channels) {
      const config = ch.config as Record<string, any>;

      try {
        if (ch.type === "webhook" && config.url) {
          const resp = await fetch(config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "grid_alert",
              title: subject,
              message: body,
              alert,
              timestamp: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(10000),
          });
          results.push({ channel: ch.name, type: "webhook", status: resp.status });
        }

        if (ch.type === "slack" && config.webhook_url) {
          const resp = await fetch(config.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `${subject}\n${body}`,
              blocks: [
                {
                  type: "header",
                  text: { type: "plain_text", text: subject },
                },
                {
                  type: "section",
                  fields: [
                    { type: "mrkdwn", text: `*Metric:*\n${alert.label}` },
                    { type: "mrkdwn", text: `*Waarde:*\n${alert.value}${alert.unit ? " " + alert.unit : ""}` },
                    { type: "mrkdwn", text: `*Bereik:*\n${alert.threshold_min}–${alert.threshold_max}${alert.unit ? " " + alert.unit : ""}` },
                    { type: "mrkdwn", text: `*Fase:*\n${alert.channel + 1}` },
                  ],
                },
              ],
            }),
            signal: AbortSignal.timeout(10000),
          });
          results.push({ channel: ch.name, type: "slack", status: resp.status });
        }

        if (ch.type === "email" && config.to) {
          // Email via Resend if API key is configured
          const resendKey = Deno.env.get("RESEND_API_KEY");
          if (resendKey) {
            const fromAddress = config.from || "alerts@resend.dev";
            const recipients = Array.isArray(config.to) ? config.to : [config.to];
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendKey}`,
              },
              body: JSON.stringify({
                from: `Grid Alerts <${fromAddress}>`,
                to: recipients,
                subject,
                html: `<h2>${subject}</h2><p>${body}</p><p style="color:#888;font-size:12px;">Tijdstip: ${new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</p>`,
              }),
              signal: AbortSignal.timeout(10000),
            });
            const resendData = await resp.json();
            results.push({ channel: ch.name, type: "email", status: resp.status, data: resendData });
          } else {
            results.push({ channel: ch.name, type: "email", status: "skipped", reason: "RESEND_API_KEY not configured" });
          }
        }
      } catch (chErr) {
        console.error(`Failed to notify channel ${ch.name}:`, chErr);
        results.push({ channel: ch.name, type: ch.type, status: "error", error: String(chErr) });
      }
    }

    console.log("Notification results:", results);
    return jsonRes({ success: true, sent: results.length, results });
  } catch (error) {
    console.error("Notification error:", error);
    return jsonRes({ error: error.message }, 500);
  }
});

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
