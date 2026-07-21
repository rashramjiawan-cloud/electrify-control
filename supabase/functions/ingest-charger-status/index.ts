import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const INGEST_KEY = Deno.env.get("CHARGER_STATUS_INGEST_KEY");

interface ChargerInput {
  id: string;
  status?: string;
  vendor?: string | null;
  model?: string | null;
  serial_number?: string | null;
  firmware_version?: string | null;
  last_heartbeat?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = req.headers.get("x-api-key");
  if (!INGEST_KEY || apiKey !== INGEST_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { chargers?: ChargerInput[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const chargers = Array.isArray(body?.chargers) ? body.chargers : [];
  if (chargers.length === 0) {
    return new Response(JSON.stringify({ ok: true, updated: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const c of chargers) {
    const id = String(c?.id ?? "").trim();
    if (!id) {
      errors.push("Missing id");
      continue;
    }

    const patch: Record<string, unknown> = { updated_at: now };
    if (c.status !== undefined) patch.status = c.status;
    if (c.vendor !== undefined) patch.vendor = c.vendor;
    if (c.model !== undefined) patch.model = c.model;
    if (c.serial_number !== undefined) patch.serial_number = c.serial_number;
    if (c.firmware_version !== undefined) patch.firmware_version = c.firmware_version;
    if (c.last_heartbeat !== undefined) patch.last_heartbeat = c.last_heartbeat;

    // Try update first (preserves customer_id and name untouched).
    const { data: updRows, error: updErr } = await supabase
      .from("charge_points")
      .update(patch)
      .eq("id", id)
      .select("id");

    if (updErr) {
      errors.push(`${id}: ${updErr.message}`);
      continue;
    }

    if (updRows && updRows.length > 0) {
      updated++;
      continue;
    }

    // Row does not exist: insert new one. name defaults to id; customer_id left null.
    const { error: insErr } = await supabase.from("charge_points").insert({
      id,
      name: id,
      ...patch,
    });

    if (insErr) {
      errors.push(`${id}: ${insErr.message}`);
      continue;
    }
    updated++;
  }

  return new Response(
    JSON.stringify({ ok: true, updated, ...(errors.length ? { errors } : {}) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
