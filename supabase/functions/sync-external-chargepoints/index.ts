import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function fetchChargers(): Promise<unknown[]> {
  const baseUrl = Deno.env.get("EXTERNAL_CP_API_URL") || "http://46.62.148.12:8080/v1";
  const apiKey = Deno.env.get("EXTERNAL_CP_API_KEY");
  if (!apiKey) throw new Error("EXTERNAL_CP_API_KEY not configured");

  const res = await fetch(`${baseUrl}/chargers`, {
    headers: { "X-API-Key": apiKey, "Accept": "application/json" },
  });

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data || data.chargers || [];
}

function mapStatus(s: string): string {
  const l = s.toLowerCase();
  if (l === "available" || l === "free" || l === "idle") return "Available";
  if (l === "charging" || l === "occupied") return "Charging";
  if (l.includes("fault") || l.includes("error")) return "Faulted";
  if (l === "preparing" || l === "connected") return "Preparing";
  if (l === "finishing") return "Finishing";
  if (l.includes("suspended")) return "SuspendedEV";
  return "Unavailable";
}

async function syncAll(): Promise<{ synced: number; errors: string[] }> {
  const chargers = await fetchChargers();
  console.log(`[sync] Processing ${chargers.length} chargers`);

  const errors: string[] = [];
  let synced = 0;

  for (const raw of chargers as Record<string, unknown>[]) {
    try {
      const cpId = String(raw.cp_id || raw.id || raw.chargePointId);
      if (!cpId) { errors.push("Skipped: no id"); continue; }

      // Determine overall status from connectors or online flag
      const connectors = raw.connectors as Array<Record<string, unknown>> | undefined;
      let cpStatus = raw.online === true ? "Available" : "Unavailable";
      if (connectors?.some(c => String(c.status).toLowerCase() === "charging")) cpStatus = "Charging";
      else if (connectors?.some(c => String(c.status).toLowerCase() === "faulted")) cpStatus = "Faulted";

      const { error: cpErr } = await supabase.from("charge_points").upsert({
        id: cpId,
        name: String(raw.name || raw.cp_id || cpId),
        model: raw.model || null,
        vendor: raw.vendor || null,
        serial_number: raw.serial_number || raw.serial || null,
        status: cpStatus,
        firmware_version: raw.firmware || raw.firmwareVersion || null,
        last_heartbeat: raw.last_heartbeat || raw.lastHeartbeat || null,
      }, { onConflict: "id" });

      if (cpErr) { errors.push(`${cpId}: ${cpErr.message}`); continue; }

      // Sync connectors
      if (Array.isArray(connectors)) {
        for (const c of connectors) {
          const connId = Number(c.id || c.connectorId || 1);
          const { error: cErr } = await supabase.from("connectors").upsert({
            charge_point_id: cpId,
            connector_id: connId,
            status: mapStatus(String(c.status || "Available")),
          }, { onConflict: "charge_point_id,connector_id" });
          if (cErr) errors.push(`${cpId}/${connId}: ${cErr.message}`);
        }
      }

      synced++;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  return { synced, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { synced, errors } = await syncAll();

    await supabase.from("ocpp_audit_log").insert({
      charge_point_id: "SYSTEM",
      action: "ExternalSync",
      payload: { synced, errors: errors.length },
      status: errors.length > 0 ? "PartialSuccess" : "Success",
    });

    return new Response(
      JSON.stringify({ ok: true, synced, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[sync] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
