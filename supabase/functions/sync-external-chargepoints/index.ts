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

async function fetchExternalApi(path: string) {
  const baseUrl = Deno.env.get("EXTERNAL_CP_API_URL") || "http://46.62.148.12:8080/v1";
  const apiKey = Deno.env.get("EXTERNAL_CP_API_KEY");

  if (!apiKey) throw new Error("EXTERNAL_CP_API_KEY not configured");

  const url = `${baseUrl}${path}`;
  console.log(`[sync] Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

// Try multiple common endpoint patterns to discover charge points
async function discoverChargePoints(): Promise<unknown> {
  const paths = [
    "/chargepoints",
    "/charge-points",
    "/chargers",
    "/stations",
    "/cp",
    "/evse",
    "",
  ];

  for (const path of paths) {
    try {
      const data = await fetchExternalApi(path);
      console.log(`[sync] Found data at ${path}:`, JSON.stringify(data).substring(0, 500));
      return { path, data };
    } catch (e) {
      console.log(`[sync] ${path} failed: ${(e as Error).message}`);
    }
  }

  throw new Error("Could not find charge points endpoint. Tried: " + paths.join(", "));
}

// Normalize external CP data to our schema
function normalizeChargePoint(cp: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(cp.id || cp.chargePointId || cp.charge_point_id || cp.identity || cp.name),
    name: String(cp.name || cp.label || cp.description || cp.id || "Unknown"),
    model: cp.model || cp.chargePointModel || cp.charge_point_model || null,
    vendor: cp.vendor || cp.chargePointVendor || cp.charge_point_vendor || null,
    serial_number: cp.serialNumber || cp.serial_number || cp.serial || null,
    status: mapStatus(String(cp.status || cp.state || "Unavailable")),
    firmware_version: cp.firmwareVersion || cp.firmware_version || cp.fw || null,
    location: cp.location || cp.address || cp.site || null,
    last_heartbeat: cp.lastHeartbeat || cp.last_heartbeat || cp.lastSeen || cp.last_seen || null,
  };
}

function mapStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("available") || s === "free" || s === "idle") return "Available";
  if (s.includes("charging") || s === "occupied" || s === "busy") return "Charging";
  if (s.includes("fault") || s.includes("error")) return "Faulted";
  if (s.includes("preparing") || s === "connected") return "Preparing";
  if (s.includes("finishing")) return "Finishing";
  if (s.includes("suspended")) return "SuspendedEV";
  return "Unavailable";
}

// Normalize connector data
function normalizeConnector(
  chargePointId: string,
  conn: Record<string, unknown>,
  index: number
): Record<string, unknown> {
  return {
    charge_point_id: chargePointId,
    connector_id: Number(conn.connectorId || conn.connector_id || conn.id || index + 1),
    status: mapStatus(String(conn.status || conn.state || "Available")),
    current_power: Number(conn.currentPower || conn.current_power || conn.power || 0),
    meter_value: Number(conn.meterValue || conn.meter_value || conn.energy || 0),
  };
}

async function syncChargePoints(data: unknown): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let items: Record<string, unknown>[] = [];

  // Handle different response shapes
  if (Array.isArray(data)) {
    items = data;
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    // Try common wrapper keys
    items = (obj.data || obj.chargePoints || obj.charge_points || obj.chargers ||
      obj.stations || obj.items || obj.results || obj.content) as Record<string, unknown>[] || [];
    if (!Array.isArray(items)) {
      // Maybe the object itself is a single CP
      items = [obj];
    }
  }

  console.log(`[sync] Processing ${items.length} charge points`);

  let synced = 0;
  for (const raw of items) {
    try {
      const cp = normalizeChargePoint(raw);
      if (!cp.id) {
        errors.push("Skipped CP without id");
        continue;
      }

      // Upsert charge point
      const { error: cpError } = await supabase
        .from("charge_points")
        .upsert(cp as any, { onConflict: "id" });

      if (cpError) {
        errors.push(`CP ${cp.id}: ${cpError.message}`);
        continue;
      }

      // Sync connectors if present
      const connectors = (raw.connectors || raw.evse || raw.ports) as Record<string, unknown>[] | undefined;
      if (Array.isArray(connectors)) {
        for (let i = 0; i < connectors.length; i++) {
          const conn = normalizeConnector(String(cp.id), connectors[i], i);
          const { error: connError } = await supabase
            .from("connectors")
            .upsert(conn as any, { onConflict: "charge_point_id,connector_id" });
          if (connError) {
            errors.push(`Connector ${cp.id}/${conn.connector_id}: ${connError.message}`);
          }
        }
      }

      synced++;
    } catch (e) {
      errors.push(`Error: ${(e as Error).message}`);
    }
  }

  return { synced, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Allow specifying a custom path via request body
    let endpointPath: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        endpointPath = body.path;
      } catch { /* no body is fine */ }
    }

    let apiData: unknown;

    if (endpointPath) {
      apiData = await fetchExternalApi(endpointPath);
    } else {
      const result = await discoverChargePoints() as { path: string; data: unknown };
      apiData = result.data;
      console.log(`[sync] Using discovered endpoint: ${result.path}`);
    }

    const { synced, errors } = await syncChargePoints(apiData);

    // Log to audit
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
