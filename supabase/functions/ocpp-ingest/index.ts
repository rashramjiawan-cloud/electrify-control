import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Validate API key from x-api-key header or query param
async function validateApiKey(req: Request): Promise<boolean> {
  const apiKey =
    req.headers.get("x-api-key") ||
    new URL(req.url).searchParams.get("api_key");

  if (!apiKey) return false;

  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "ingest_api_key")
    .maybeSingle();

  return data?.value === apiKey;
}

interface IngestEvent {
  event: string;
  chargePointId: string;
  connectorId?: number;
  timestamp?: string;
  data?: Record<string, unknown>;
}

// ── Event handlers ───────────────────────────────────────────

async function handleBoot(e: IngestEvent) {
  const d = e.data || {};
  await supabase.from("charge_points").upsert(
    {
      id: e.chargePointId,
      name: (d.model as string) || e.chargePointId,
      model: d.model as string,
      vendor: d.vendor as string,
      serial_number: d.serialNumber as string,
      firmware_version: d.firmwareVersion as string,
      status: "Available",
      last_heartbeat: e.timestamp || new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  return { status: "Accepted" };
}

async function handleHeartbeat(e: IngestEvent) {
  const ts = e.timestamp || new Date().toISOString();
  await supabase
    .from("charge_points")
    .update({ last_heartbeat: ts })
    .eq("id", e.chargePointId);
  await supabase
    .from("heartbeats")
    .insert({ charge_point_id: e.chargePointId });
  return { status: "ok" };
}

async function handleStatusNotification(e: IngestEvent) {
  const d = e.data || {};
  const connectorId = e.connectorId ?? 0;
  const status = d.status as string;

  await supabase.from("status_notifications").insert({
    charge_point_id: e.chargePointId,
    connector_id: connectorId,
    status,
    error_code: (d.errorCode as string) || "NoError",
    info: d.info as string,
    vendor_error_code: d.vendorErrorCode as string,
    timestamp: e.timestamp || new Date().toISOString(),
  });

  if (connectorId === 0) {
    await supabase
      .from("charge_points")
      .update({ status })
      .eq("id", e.chargePointId);
  } else {
    await supabase.from("connectors").upsert(
      { charge_point_id: e.chargePointId, connector_id: connectorId, status },
      { onConflict: "charge_point_id,connector_id" }
    );
  }
  return { status: "ok" };
}

async function handleStartTransaction(e: IngestEvent) {
  const d = e.data || {};
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      charge_point_id: e.chargePointId,
      connector_id: e.connectorId ?? 1,
      id_tag: (d.idTag as string) || "UNKNOWN",
      meter_start: (d.meterStart as number) || 0,
      start_time: e.timestamp || new Date().toISOString(),
      status: "Active",
    })
    .select("id")
    .single();

  if (error) console.error("StartTransaction error:", error);

  // Update connector + charge point
  await supabase.from("connectors").upsert(
    {
      charge_point_id: e.chargePointId,
      connector_id: e.connectorId ?? 1,
      status: "Charging",
      current_power: 0,
    },
    { onConflict: "charge_point_id,connector_id" }
  );
  await supabase
    .from("charge_points")
    .update({ status: "Charging" })
    .eq("id", e.chargePointId);

  return { transactionId: data?.id || 0, status: "Accepted" };
}

async function handleStopTransaction(e: IngestEvent) {
  const d = e.data || {};
  const transactionId = d.transactionId as number;
  const meterStop = (d.meterStop as number) || 0;

  const { data: tx } = await supabase
    .from("transactions")
    .select("meter_start")
    .eq("id", transactionId)
    .single();

  const energyDelivered = tx
    ? (meterStop - (tx.meter_start as number)) / 1000
    : 0;

  await supabase
    .from("transactions")
    .update({
      stop_time: e.timestamp || new Date().toISOString(),
      meter_stop: meterStop,
      energy_delivered: energyDelivered,
      status: "Completed",
    })
    .eq("id", transactionId);

  // Update connector
  if (e.connectorId) {
    await supabase.from("connectors").upsert(
      {
        charge_point_id: e.chargePointId,
        connector_id: e.connectorId,
        status: "Available",
        current_power: 0,
      },
      { onConflict: "charge_point_id,connector_id" }
    );
  }

  return { status: "Accepted", energyDelivered };
}

async function handleMeterValues(e: IngestEvent) {
  const d = e.data || {};
  const values = (d.values as Array<{
    measurand?: string;
    value: number;
    unit?: string;
  }>) || [];

  for (const v of values) {
    await supabase.from("meter_values").insert({
      charge_point_id: e.chargePointId,
      connector_id: e.connectorId ?? 1,
      transaction_id: d.transactionId as number | undefined,
      measurand: v.measurand || "Energy.Active.Import.Register",
      value: v.value,
      unit: v.unit || "Wh",
      timestamp: e.timestamp || new Date().toISOString(),
    });

    // Update connector power
    if (
      v.measurand === "Power.Active.Import" ||
      v.measurand === "Power.Active.Import.Register"
    ) {
      const powerKw = v.unit === "W" ? v.value / 1000 : v.value;
      await supabase.from("connectors").upsert(
        {
          charge_point_id: e.chargePointId,
          connector_id: e.connectorId ?? 1,
          current_power: powerKw,
          status: "Charging",
        },
        { onConflict: "charge_point_id,connector_id" }
      );
    }
  }
  return { status: "ok", count: values.length };
}

// Bulk events support
async function processBatch(events: IngestEvent[]) {
  const results: Array<{ event: string; chargePointId: string; result: unknown }> = [];
  for (const e of events) {
    const result = await processEvent(e);
    results.push({ event: e.event, chargePointId: e.chargePointId, result });
  }
  return results;
}

async function processEvent(e: IngestEvent) {
  switch (e.event) {
    case "BootNotification":
      return handleBoot(e);
    case "Heartbeat":
      return handleHeartbeat(e);
    case "StatusNotification":
      return handleStatusNotification(e);
    case "StartTransaction":
      return handleStartTransaction(e);
    case "StopTransaction":
      return handleStopTransaction(e);
    case "MeterValues":
      return handleMeterValues(e);
    default:
      // Log unknown events to audit log
      await supabase.from("ocpp_audit_log").insert({
        charge_point_id: e.chargePointId,
        action: e.event,
        payload: e.data || {},
        status: "Received",
      });
      return { status: "ok", note: "Event logged" };
  }
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Use POST to send events",
        docs: {
          singleEvent: {
            event: "BootNotification | Heartbeat | StatusNotification | StartTransaction | StopTransaction | MeterValues",
            chargePointId: "CP-001",
            connectorId: 1,
            timestamp: "2025-01-01T00:00:00Z",
            data: {},
          },
          batchEvents: {
            events: [
              { event: "Heartbeat", chargePointId: "CP-001" },
              { event: "StatusNotification", chargePointId: "CP-002", data: { status: "Available" } },
            ],
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate API key
  const authorized = await validateApiKey(req);
  if (!authorized) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Provide a valid x-api-key header." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    // Batch mode: { events: [...] }
    if (Array.isArray(body.events)) {
      const results = await processBatch(body.events);
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single event
    if (!body.event || !body.chargePointId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: event, chargePointId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await processEvent(body as IngestEvent);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ocpp-ingest] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
