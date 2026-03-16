import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ENOVATES_API_KEY = Deno.env.get("ENOVATES_API_KEY");
  if (!ENOVATES_API_KEY) {
    return new Response(JSON.stringify({ error: "ENOVATES_API_KEY is not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ENOVATES_BASE_URL = Deno.env.get("ENOVATES_BASE_URL");
  if (!ENOVATES_BASE_URL) {
    return new Response(JSON.stringify({ error: "ENOVATES_BASE_URL is not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { action, path, method, body } = await req.json();

    // ─── Sync action: fetch chargers and upsert into charge_points ───
    if (action === "sync") {
      const targetUrl = `${ENOVATES_BASE_URL.replace(/\/$/, "")}/chargers`;
      const response = await fetch(targetUrl, {
        headers: {
          "Authorization": `Bearer ${ENOVATES_API_KEY}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Enovates API error [${response.status}]: ${errBody}`);
      }

      const chargers = await response.json();
      const list = Array.isArray(chargers) ? chargers : chargers?.data || chargers?.chargers || [];

      let synced = 0;
      for (const charger of list) {
        // Map Enovates fields to our charge_points schema
        const id = `ENOVATES-${charger.id || charger.serial_number || charger.charger_id || synced}`;
        const record = {
          id,
          name: charger.name || charger.label || id,
          status: mapStatus(charger.status || charger.state || "Unknown"),
          vendor: "Enovates",
          model: charger.model || charger.type || null,
          serial_number: charger.serial_number || charger.serialNumber || null,
          firmware_version: charger.firmware_version || charger.firmwareVersion || null,
          location: charger.location || charger.address || null,
          max_power: charger.max_power || charger.maxPower || charger.rated_power || null,
          last_heartbeat: new Date().toISOString(),
        };

        const { error } = await sb
          .from("charge_points")
          .upsert(record, { onConflict: "id" });

        if (error) {
          console.error(`Failed to upsert ${id}:`, error.message);
        } else {
          synced++;
        }

        // Sync connectors if available
        const connectors = charger.connectors || charger.evses || [];
        for (let i = 0; i < connectors.length; i++) {
          const conn = connectors[i];
          await sb.from("connectors").upsert({
            charge_point_id: id,
            connector_id: conn.connector_id || conn.id || i + 1,
            status: mapStatus(conn.status || conn.state || "Unknown"),
            current_power: conn.power || conn.current_power || null,
          }, { onConflict: "charge_point_id,connector_id" });
        }
      }

      // Audit log
      await sb.from("ocpp_audit_log").insert({
        action: "enovates:sync",
        charge_point_id: "ENOVATES-API",
        status: "success",
        payload: { total_from_api: list.length },
        result: { synced },
      });

      return new Response(JSON.stringify({ success: true, synced, total: list.length }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Generic proxy: forward request to Enovates API ───
    const targetUrl = `${ENOVATES_BASE_URL.replace(/\/$/, "")}/${(path || "").replace(/^\//, "")}`;
    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: {
        "Authorization": `Bearer ${ENOVATES_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    await sb.from("ocpp_audit_log").insert({
      action: `enovates:${action || path || "unknown"}`,
      charge_point_id: "ENOVATES-API",
      status: response.ok ? "success" : "error",
      payload: { path, method: method || "GET", body: body || null },
      result: typeof data === "object" ? data : { raw: data },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Enovates API error [${response.status}]`, details: data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Enovates proxy error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function mapStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("available") || s === "free" || s === "idle") return "Available";
  if (s.includes("charging") || s === "busy" || s === "in_use") return "Charging";
  if (s.includes("fault") || s.includes("error")) return "Faulted";
  if (s.includes("preparing") || s.includes("suspended")) return "SuspendedEV";
  if (s.includes("finishing")) return "Finishing";
  if (s.includes("unavailable") || s.includes("offline")) return "Unavailable";
  return "Available";
}
