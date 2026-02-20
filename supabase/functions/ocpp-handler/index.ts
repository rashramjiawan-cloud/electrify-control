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

// OCPP 1.6J Message Types
const CALL = 2;
const CALLRESULT = 3;
const CALLERROR = 4;

interface OcppMessage {
  chargePointId: string;
  messageTypeId: number;
  uniqueId: string;
  action: string;
  payload: Record<string, unknown>;
}

async function handleBootNotification(cpId: string, payload: Record<string, unknown>) {
  const { error } = await supabase
    .from("charge_points")
    .upsert({
      id: cpId,
      name: (payload.chargePointModel as string) || cpId,
      model: payload.chargePointModel as string,
      vendor: payload.chargePointVendor as string,
      serial_number: payload.chargePointSerialNumber as string,
      firmware_version: payload.firmwareVersion as string,
      status: "Available",
      last_heartbeat: new Date().toISOString(),
    }, { onConflict: "id" });

  if (error) console.error("BootNotification upsert error:", error);

  return {
    status: "Accepted",
    currentTime: new Date().toISOString(),
    interval: 300,
  };
}

async function handleHeartbeat(cpId: string) {
  await supabase
    .from("charge_points")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("id", cpId);

  await supabase
    .from("heartbeats")
    .insert({ charge_point_id: cpId });

  return { currentTime: new Date().toISOString() };
}

async function handleStatusNotification(cpId: string, payload: Record<string, unknown>) {
  const connectorId = payload.connectorId as number;
  const status = payload.status as string;
  const errorCode = (payload.errorCode as string) || "NoError";

  // Log the notification
  await supabase.from("status_notifications").insert({
    charge_point_id: cpId,
    connector_id: connectorId,
    status,
    error_code: errorCode,
    info: payload.info as string,
    vendor_error_code: payload.vendorErrorCode as string,
  });

  // Update charge point status if connector 0 (whole CP)
  if (connectorId === 0) {
    await supabase
      .from("charge_points")
      .update({ status })
      .eq("id", cpId);
  } else {
    // Upsert connector status
    await supabase
      .from("connectors")
      .upsert(
        { charge_point_id: cpId, connector_id: connectorId, status },
        { onConflict: "charge_point_id,connector_id" }
      );
  }

  return {};
}

async function handleStartTransaction(cpId: string, payload: Record<string, unknown>) {
  const connectorId = payload.connectorId as number;
  const idTag = payload.idTag as string;
  const meterStart = payload.meterStart as number;
  const timestamp = payload.timestamp as string;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      charge_point_id: cpId,
      connector_id: connectorId,
      id_tag: idTag,
      meter_start: meterStart,
      start_time: timestamp || new Date().toISOString(),
      status: "Active",
    })
    .select("id")
    .single();

  if (error) console.error("StartTransaction error:", error);

  // Update connector status
  await supabase
    .from("connectors")
    .upsert(
      { charge_point_id: cpId, connector_id: connectorId, status: "Charging", current_power: 0 },
      { onConflict: "charge_point_id,connector_id" }
    );

  // Update charge point status
  await supabase
    .from("charge_points")
    .update({ status: "Charging" })
    .eq("id", cpId);

  return {
    transactionId: data?.id || 0,
    idTagInfo: { status: "Accepted" },
  };
}

async function handleStopTransaction(cpId: string, payload: Record<string, unknown>) {
  const transactionId = payload.transactionId as number;
  const meterStop = payload.meterStop as number;
  const timestamp = payload.timestamp as string;

  // Get transaction to calculate energy
  const { data: tx } = await supabase
    .from("transactions")
    .select("meter_start")
    .eq("id", transactionId)
    .single();

  const energyDelivered = tx ? (meterStop - (tx.meter_start as number)) / 1000 : 0; // Wh to kWh

  await supabase
    .from("transactions")
    .update({
      stop_time: timestamp || new Date().toISOString(),
      meter_stop: meterStop,
      energy_delivered: energyDelivered,
      status: "Completed",
    })
    .eq("id", transactionId);

  // Update charge point energy delivered
  if (energyDelivered > 0) {
    const { data: cpData } = await supabase
      .from("charge_points")
      .select("energy_delivered")
      .eq("id", cpId)
      .single();
    if (cpData) {
      await supabase
        .from("charge_points")
        .update({ energy_delivered: (cpData.energy_delivered as number) + energyDelivered })
        .eq("id", cpId);
    }
  }

  return { idTagInfo: { status: "Accepted" } };
}

async function handleMeterValues(cpId: string, payload: Record<string, unknown>) {
  const connectorId = payload.connectorId as number;
  const transactionId = payload.transactionId as number | undefined;
  const meterValue = payload.meterValue as Array<{
    timestamp: string;
    sampledValue: Array<{ value: string; measurand?: string; unit?: string }>;
  }>;

  if (meterValue && meterValue.length > 0) {
    for (const mv of meterValue) {
      for (const sv of mv.sampledValue) {
        await supabase.from("meter_values").insert({
          charge_point_id: cpId,
          connector_id: connectorId,
          transaction_id: transactionId,
          measurand: sv.measurand || "Energy.Active.Import.Register",
          value: parseFloat(sv.value),
          unit: sv.unit || "Wh",
          timestamp: mv.timestamp,
        });

        // Update connector power if it's a power measurand
        if (sv.measurand === "Power.Active.Import" || !sv.measurand) {
          const powerValue = parseFloat(sv.value);
          const powerKw = sv.unit === "W" ? powerValue / 1000 : powerValue;
          await supabase
            .from("connectors")
            .upsert(
              { charge_point_id: cpId, connector_id: connectorId, current_power: powerKw, status: "Charging" },
              { onConflict: "charge_point_id,connector_id" }
            );
        }

        // Update connector meter value
        if (sv.measurand === "Energy.Active.Import.Register" || !sv.measurand) {
          await supabase
            .from("connectors")
            .upsert(
              { charge_point_id: cpId, connector_id: connectorId, meter_value: parseFloat(sv.value) },
              { onConflict: "charge_point_id,connector_id" }
            );
        }
      }
    }
  }

  return {};
}

async function handleAuthorize(_cpId: string, payload: Record<string, unknown>) {
  const _idTag = payload.idTag as string;
  return { idTagInfo: { status: "Accepted" } };
}

async function handleGetConfiguration(cpId: string, payload: Record<string, unknown>) {
  const requestedKeys = payload.key as string[] | undefined;

  let query = supabase
    .from("charge_point_config")
    .select("key, value, readonly")
    .eq("charge_point_id", cpId);

  if (requestedKeys && requestedKeys.length > 0) {
    query = query.in("key", requestedKeys);
  }

  const { data, error } = await query;

  if (error) {
    console.error("GetConfiguration error:", error);
    return { configurationKey: [], unknownKey: [] };
  }

  const knownKeys = data || [];
  const unknownKey: string[] = [];

  if (requestedKeys && requestedKeys.length > 0) {
    const foundKeys = new Set(knownKeys.map(k => k.key));
    for (const rk of requestedKeys) {
      if (!foundKeys.has(rk)) unknownKey.push(rk);
    }
  }

  return {
    configurationKey: knownKeys.map(k => ({
      key: k.key,
      readonly: k.readonly,
      value: k.value,
    })),
    unknownKey,
  };
}

// CSMS → CP commands
async function handleRemoteStartTransaction(cpId: string, payload: Record<string, unknown>) {
  const connectorId = (payload.connectorId as number) || 1;
  const idTag = payload.idTag as string;

  if (!idTag) {
    return { status: "Rejected", reason: "idTag is required" };
  }

  // Create transaction
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      charge_point_id: cpId,
      connector_id: connectorId,
      id_tag: idTag,
      meter_start: 0,
      start_time: new Date().toISOString(),
      status: "Active",
    })
    .select("id")
    .single();

  if (error) {
    console.error("RemoteStartTransaction error:", error);
    return { status: "Rejected", reason: error.message };
  }

  // Update connector & charge point status
  await supabase
    .from("connectors")
    .upsert(
      { charge_point_id: cpId, connector_id: connectorId, status: "Charging", current_power: 0 },
      { onConflict: "charge_point_id,connector_id" }
    );

  await supabase
    .from("charge_points")
    .update({ status: "Charging" })
    .eq("id", cpId);

  return { status: "Accepted", transactionId: data?.id };
}

async function handleRemoteStopTransaction(cpId: string, payload: Record<string, unknown>) {
  const transactionId = payload.transactionId as number;

  if (!transactionId) {
    return { status: "Rejected", reason: "transactionId is required" };
  }

  // Get transaction
  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("status", "Active")
    .single();

  if (txError || !tx) {
    return { status: "Rejected", reason: "Active transaction not found" };
  }

  // Stop the transaction
  await supabase
    .from("transactions")
    .update({
      stop_time: new Date().toISOString(),
      status: "Completed",
    })
    .eq("id", transactionId);

  // Update connector status
  await supabase
    .from("connectors")
    .upsert(
      { charge_point_id: cpId, connector_id: tx.connector_id as number, status: "Available", current_power: 0 },
      { onConflict: "charge_point_id,connector_id" }
    );

  // Check if any other active transactions on this CP
  const { data: activeTx } = await supabase
    .from("transactions")
    .select("id")
    .eq("charge_point_id", cpId)
    .eq("status", "Active");

  if (!activeTx || activeTx.length === 0) {
    await supabase
      .from("charge_points")
      .update({ status: "Available" })
      .eq("id", cpId);
  }

  return { status: "Accepted" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: OcppMessage = await req.json();
    const { chargePointId, action, payload } = body;

    if (!chargePointId || !action) {
      return new Response(
        JSON.stringify({ error: "chargePointId and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let response: Record<string, unknown>;

    switch (action) {
      case "BootNotification":
        response = await handleBootNotification(chargePointId, payload);
        break;
      case "Heartbeat":
        response = await handleHeartbeat(chargePointId);
        break;
      case "StatusNotification":
        response = await handleStatusNotification(chargePointId, payload);
        break;
      case "StartTransaction":
        response = await handleStartTransaction(chargePointId, payload);
        break;
      case "StopTransaction":
        response = await handleStopTransaction(chargePointId, payload);
        break;
      case "MeterValues":
        response = await handleMeterValues(chargePointId, payload);
        break;
      case "Authorize":
        response = await handleAuthorize(chargePointId, payload);
        break;
      case "GetConfiguration":
        response = await handleGetConfiguration(chargePointId, payload);
        break;
      case "RemoteStartTransaction":
        response = await handleRemoteStartTransaction(chargePointId, payload);
        break;
      case "RemoteStopTransaction":
        response = await handleRemoteStopTransaction(chargePointId, payload);
        break;
      default:
        response = { error: `Unknown action: ${action}` };
    }

    // Return OCPP CallResult format
    const ocppResponse = [CALLRESULT, body.uniqueId || "0", response];

    return new Response(JSON.stringify(ocppResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OCPP handler error:", error);
    const errorResponse = [CALLERROR, "0", "InternalError", (error as Error).message, {}];
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
