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

  // Check authorization
  const authResult = await checkTagAuthorized(idTag, cpId);
  if (authResult.status !== "Accepted") {
    return {
      transactionId: 0,
      idTagInfo: authResult,
    };
  }

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

async function getTariffForChargePoint(cpId: string) {
  // First try charge-point-specific tariff
  const { data: specificTariff } = await supabase
    .from("charging_tariffs")
    .select("*")
    .eq("charge_point_id", cpId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (specificTariff) return specificTariff;

  // Fall back to default tariff
  const { data: defaultTariff } = await supabase
    .from("charging_tariffs")
    .select("*")
    .is("charge_point_id", null)
    .eq("is_default", true)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (defaultTariff) return defaultTariff;

  // Fall back to any active tariff without CP restriction
  const { data: anyTariff } = await supabase
    .from("charging_tariffs")
    .select("*")
    .is("charge_point_id", null)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  return anyTariff;
}

async function handleStopTransaction(cpId: string, payload: Record<string, unknown>) {
  const transactionId = payload.transactionId as number;
  const meterStop = payload.meterStop as number;
  const timestamp = payload.timestamp as string;

  // Get transaction to calculate energy
  const { data: tx } = await supabase
    .from("transactions")
    .select("meter_start, start_time")
    .eq("id", transactionId)
    .single();

  const energyDelivered = tx ? (meterStop - (tx.meter_start as number)) / 1000 : 0; // Wh to kWh

  // Calculate cost using tariff
  let cost = 0;
  const tariff = await getTariffForChargePoint(cpId);
  if (tariff) {
    cost = energyDelivered * (tariff.price_per_kwh as number);
    cost += (tariff.start_fee as number) || 0;

    // Calculate idle fee if applicable
    if ((tariff.idle_fee_per_min as number) > 0 && tx?.start_time) {
      const stopTime = timestamp ? new Date(timestamp) : new Date();
      const startTime = new Date(tx.start_time as string);
      const durationMin = (stopTime.getTime() - startTime.getTime()) / 60000;
      // Only charge idle fee beyond reasonable charging time (assume 1 kW min charging speed)
      const estimatedChargingMin = energyDelivered * 60; // rough estimate
      const idleMin = Math.max(0, durationMin - estimatedChargingMin);
      cost += idleMin * (tariff.idle_fee_per_min as number);
    }

    cost = Math.round(cost * 100) / 100; // Round to 2 decimals
  }

  await supabase
    .from("transactions")
    .update({
      stop_time: timestamp || new Date().toISOString(),
      meter_stop: meterStop,
      energy_delivered: energyDelivered,
      cost,
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

async function checkTagAuthorized(idTag: string, cpId: string): Promise<{ status: string }> {
  // Look up the tag in authorized_tags table
  const { data: tag, error } = await supabase
    .from("authorized_tags")
    .select("*")
    .eq("id_tag", idTag)
    .maybeSingle();

  if (error) {
    console.error("Authorization lookup error:", error);
    return { status: "Accepted" }; // Fail-open if DB error
  }

  // If no tags exist in the table at all, allow all (authorization not configured yet)
  const { count } = await supabase
    .from("authorized_tags")
    .select("*", { count: "exact", head: true });

  if (count === 0) {
    return { status: "Accepted" };
  }

  if (!tag) {
    return { status: "Invalid" };
  }

  if (!tag.enabled) {
    return { status: "Blocked" };
  }

  // Check expiry
  if (tag.expiry_date && new Date(tag.expiry_date) < new Date()) {
    return { status: "Expired" };
  }

  // Check charge point restriction
  if (tag.charge_point_ids && tag.charge_point_ids.length > 0) {
    if (!tag.charge_point_ids.includes(cpId)) {
      return { status: "Invalid" };
    }
  }

  return { status: "Accepted" };
}

async function handleAuthorize(cpId: string, payload: Record<string, unknown>) {
  const idTag = payload.idTag as string;
  const authResult = await checkTagAuthorized(idTag, cpId);
  return { idTagInfo: authResult };
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

async function handleChangeConfiguration(cpId: string, payload: Record<string, unknown>) {
  const key = payload.key as string;
  const value = payload.value as string;

  if (!key) {
    return { status: "Rejected" };
  }

  // Check if key exists and is not readonly
  const { data: existing, error: fetchErr } = await supabase
    .from("charge_point_config")
    .select("key, readonly")
    .eq("charge_point_id", cpId)
    .eq("key", key)
    .maybeSingle();

  if (fetchErr) {
    console.error("ChangeConfiguration fetch error:", fetchErr);
    return { status: "Rejected" };
  }

  if (!existing) {
    return { status: "NotSupported" };
  }

  if (existing.readonly) {
    return { status: "Rejected" };
  }

  const { error: updateErr } = await supabase
    .from("charge_point_config")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("charge_point_id", cpId)
    .eq("key", key);

  if (updateErr) {
    console.error("ChangeConfiguration update error:", updateErr);
    return { status: "Rejected" };
  }

  return { status: "Accepted" };
}

// CSMS → CP commands
async function handleReset(cpId: string, payload: Record<string, unknown>) {
  const type = payload.type as string;

  if (type !== "Hard" && type !== "Soft") {
    return { status: "Rejected" };
  }

  if (type === "Hard") {
    // Hard reset: stop all active transactions, reset all connectors
    const { data: activeTxs } = await supabase
      .from("transactions")
      .select("id")
      .eq("charge_point_id", cpId)
      .eq("status", "Active");

    if (activeTxs && activeTxs.length > 0) {
      for (const tx of activeTxs) {
        await supabase
          .from("transactions")
          .update({ stop_time: new Date().toISOString(), status: "Completed" })
          .eq("id", tx.id);
      }
    }

    // Reset all connectors
    await supabase
      .from("connectors")
      .update({ status: "Available", current_power: 0 })
      .eq("charge_point_id", cpId);
  }

  // Update charge point status
  await supabase
    .from("charge_points")
    .update({ status: "Available", last_heartbeat: new Date().toISOString() })
    .eq("id", cpId);

  return { status: "Accepted" };
}

async function handleTriggerMessage(cpId: string, payload: Record<string, unknown>) {
  const requestedMessage = payload.requestedMessage as string;
  const connectorId = (payload.connectorId as number) || 0;

  const supportedMessages = [
    "BootNotification",
    "DiagnosticsStatusNotification",
    "FirmwareStatusNotification",
    "Heartbeat",
    "MeterValues",
    "StatusNotification",
  ];

  if (!supportedMessages.includes(requestedMessage)) {
    return { status: "NotImplemented" };
  }

  switch (requestedMessage) {
    case "Heartbeat":
      await handleHeartbeat(cpId);
      break;
    case "StatusNotification": {
      const { data: connector } = connectorId > 0
        ? await supabase.from("connectors").select("status").eq("charge_point_id", cpId).eq("connector_id", connectorId).maybeSingle()
        : await supabase.from("charge_points").select("status").eq("id", cpId).maybeSingle();
      const currentStatus = connector?.status || "Available";
      await supabase.from("status_notifications").insert({
        charge_point_id: cpId,
        connector_id: connectorId,
        status: currentStatus,
        error_code: "NoError",
        info: "Triggered via TriggerMessage",
      });
      break;
    }
    case "MeterValues": {
      const targetConnector = connectorId > 0 ? connectorId : 1;
      const { data: conn } = await supabase
        .from("connectors")
        .select("current_power, meter_value")
        .eq("charge_point_id", cpId)
        .eq("connector_id", targetConnector)
        .maybeSingle();
      if (conn) {
        await supabase.from("meter_values").insert({
          charge_point_id: cpId,
          connector_id: targetConnector,
          measurand: "Energy.Active.Import.Register",
          value: conn.meter_value || 0,
          unit: "Wh",
          timestamp: new Date().toISOString(),
        });
        if (conn.current_power) {
          await supabase.from("meter_values").insert({
            charge_point_id: cpId,
            connector_id: targetConnector,
            measurand: "Power.Active.Import",
            value: conn.current_power * 1000,
            unit: "W",
            timestamp: new Date().toISOString(),
          });
        }
      }
      break;
    }
    case "BootNotification": {
      const { data: cp } = await supabase.from("charge_points").select("model, vendor, serial_number, firmware_version").eq("id", cpId).maybeSingle();
      if (cp) {
        await handleBootNotification(cpId, {
          chargePointModel: cp.model,
          chargePointVendor: cp.vendor,
          chargePointSerialNumber: cp.serial_number,
          firmwareVersion: cp.firmware_version,
        });
      }
      break;
    }
    default:
      break;
  }

  return { status: "Accepted" };
}

async function handleUnlockConnector(cpId: string, payload: Record<string, unknown>) {
  const connectorId = (payload.connectorId as number) || 1;

  if (connectorId <= 0) {
    return { status: "Rejected" };
  }

  // Check if connector exists
  const { data: conn } = await supabase
    .from("connectors")
    .select("status")
    .eq("charge_point_id", cpId)
    .eq("connector_id", connectorId)
    .maybeSingle();

  if (!conn) {
    return { status: "NotSupported" };
  }

  // Stop any active transaction on this connector
  const { data: activeTxs } = await supabase
    .from("transactions")
    .select("id")
    .eq("charge_point_id", cpId)
    .eq("connector_id", connectorId)
    .eq("status", "Active");

  if (activeTxs && activeTxs.length > 0) {
    for (const tx of activeTxs) {
      await supabase
        .from("transactions")
        .update({ stop_time: new Date().toISOString(), status: "Completed" })
        .eq("id", tx.id);
    }
  }

  // Set connector to Available
  await supabase
    .from("connectors")
    .update({ status: "Available", current_power: 0 })
    .eq("charge_point_id", cpId)
    .eq("connector_id", connectorId);

  // Check if CP should go back to Available
  const { data: chargingConns } = await supabase
    .from("connectors")
    .select("connector_id")
    .eq("charge_point_id", cpId)
    .eq("status", "Charging");

  if (!chargingConns || chargingConns.length === 0) {
    await supabase
      .from("charge_points")
      .update({ status: "Available" })
      .eq("id", cpId);
  }

  return { status: "Unlocked" };
}

// ── Smart Charging ──────────────────────────────────────────────────

async function handleSetChargingProfile(cpId: string, payload: Record<string, unknown>) {
  const connectorId = (payload.connectorId as number) ?? 0;
  const csChargingProfiles = payload.csChargingProfiles as Record<string, unknown> | undefined;

  if (!csChargingProfiles) {
    return { status: "Rejected" };
  }

  const purpose = (csChargingProfiles.chargingProfilePurpose as string) || "TxDefaultProfile";
  const kind = (csChargingProfiles.chargingProfileKind as string) || "Relative";
  const stackLevel = (csChargingProfiles.stackLevel as number) || 0;
  const recurrencyKind = csChargingProfiles.recurrencyKind as string | undefined;
  const validFrom = csChargingProfiles.validFrom as string | undefined;
  const validTo = csChargingProfiles.validTo as string | undefined;

  const schedule = csChargingProfiles.chargingSchedule as Record<string, unknown> | undefined;
  const unit = (schedule?.chargingRateUnit as string) || "W";
  const duration = schedule?.duration as number | undefined;
  const startSchedule = schedule?.startSchedule as string | undefined;
  const minRate = schedule?.minChargingRate as number | undefined;
  const periods = (schedule?.chargingSchedulePeriod as unknown[]) || [];

  // Deactivate existing profile at same stack level / connector
  await supabase
    .from("charging_profiles")
    .update({ active: false })
    .eq("charge_point_id", cpId)
    .eq("connector_id", connectorId)
    .eq("stack_level", stackLevel)
    .eq("active", true);

  const { error } = await supabase.from("charging_profiles").insert({
    charge_point_id: cpId,
    connector_id: connectorId,
    stack_level: stackLevel,
    charging_profile_purpose: purpose,
    charging_profile_kind: kind,
    recurrency_kind: recurrencyKind,
    valid_from: validFrom,
    valid_to: validTo,
    charging_schedule_unit: unit,
    duration,
    start_schedule: startSchedule,
    min_charging_rate: minRate,
    schedule_periods: periods,
    active: true,
  });

  if (error) {
    console.error("SetChargingProfile error:", error);
    return { status: "Rejected" };
  }

  return { status: "Accepted" };
}

async function handleGetCompositeSchedule(cpId: string, payload: Record<string, unknown>) {
  const connectorId = (payload.connectorId as number) ?? 0;
  const duration = (payload.duration as number) || 86400;
  const chargingRateUnit = (payload.chargingRateUnit as string) || "W";

  // Get all active profiles for this connector, ordered by stack level (highest priority first)
  const { data: profiles, error } = await supabase
    .from("charging_profiles")
    .select("*")
    .eq("charge_point_id", cpId)
    .eq("active", true)
    .or(`connector_id.eq.${connectorId},connector_id.eq.0`)
    .order("stack_level", { ascending: false });

  if (error || !profiles || profiles.length === 0) {
    return { status: "Rejected" };
  }

  // Use highest-priority profile to compose schedule
  const topProfile = profiles[0];
  const periods = topProfile.schedule_periods as Array<{ startPeriod: number; limit: number; numberPhases?: number }>;

  return {
    status: "Accepted",
    connectorId,
    scheduleStart: topProfile.start_schedule || new Date().toISOString(),
    chargingSchedule: {
      duration,
      chargingRateUnit: topProfile.charging_schedule_unit || chargingRateUnit,
      chargingSchedulePeriod: periods,
      minChargingRate: topProfile.min_charging_rate,
    },
  };
}

async function handleClearChargingProfile(cpId: string, payload: Record<string, unknown>) {
  const id = payload.id as number | undefined;
  const connectorId = payload.connectorId as number | undefined;
  const purpose = payload.chargingProfilePurpose as string | undefined;
  const stackLevel = payload.stackLevel as number | undefined;

  let query = supabase
    .from("charging_profiles")
    .update({ active: false })
    .eq("charge_point_id", cpId)
    .eq("active", true);

  if (id != null) query = query.eq("id", id);
  if (connectorId != null) query = query.eq("connector_id", connectorId);
  if (purpose) query = query.eq("charging_profile_purpose", purpose);
  if (stackLevel != null) query = query.eq("stack_level", stackLevel);

  const { error, count } = await query;

  if (error) {
    console.error("ClearChargingProfile error:", error);
    return { status: "Unknown" };
  }

  return { status: count && count > 0 ? "Accepted" : "Unknown" };
}

// ── Firmware Management ─────────────────────────────────────────────

async function handleUpdateFirmware(cpId: string, payload: Record<string, unknown>) {
  const location = payload.location as string;
  const retrieveDate = payload.retrieveDate as string;
  const retries = (payload.retries as number) || 0;
  const retryInterval = (payload.retryInterval as number) || 0;

  if (!location) {
    return { status: "Rejected" };
  }

  // Create firmware update record
  const { error } = await supabase.from("firmware_updates").insert({
    charge_point_id: cpId,
    type: "Firmware",
    location,
    status: "Pending",
    retrieve_date: retrieveDate || new Date().toISOString(),
    retries,
    retry_interval: retryInterval,
  });

  if (error) {
    console.error("UpdateFirmware insert error:", error);
    return { status: "Rejected" };
  }

  return {};
}

async function handleFirmwareStatusNotification(cpId: string, payload: Record<string, unknown>) {
  const status = payload.status as string;

  // Update the most recent firmware update record
  const { data: latest } = await supabase
    .from("firmware_updates")
    .select("id")
    .eq("charge_point_id", cpId)
    .eq("type", "Firmware")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) {
    await supabase
      .from("firmware_updates")
      .update({ status })
      .eq("id", latest.id);
  }

  // If installed, update charge point firmware_version if available in recent boot
  if (status === "Installed") {
    await supabase
      .from("charge_points")
      .update({ status: "Available" })
      .eq("id", cpId);
  }

  return {};
}

async function handleGetDiagnostics(cpId: string, payload: Record<string, unknown>) {
  const location = payload.location as string;
  const startTime = payload.startTime as string | undefined;
  const stopTime = payload.stopTime as string | undefined;
  const retries = (payload.retries as number) || 0;
  const retryInterval = (payload.retryInterval as number) || 0;

  if (!location) {
    return { status: "Rejected" };
  }

  // Create diagnostics record
  const { error } = await supabase.from("firmware_updates").insert({
    charge_point_id: cpId,
    type: "Diagnostics",
    location,
    status: "Uploading",
    retries,
    retry_interval: retryInterval,
  });

  if (error) {
    console.error("GetDiagnostics insert error:", error);
    return {};
  }

  // Return a generated filename
  const fileName = `diag_${cpId}_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  return { fileName };
}

async function handleDiagnosticsStatusNotification(cpId: string, payload: Record<string, unknown>) {
  const status = payload.status as string;

  // Update the most recent diagnostics record
  const { data: latest } = await supabase
    .from("firmware_updates")
    .select("id")
    .eq("charge_point_id", cpId)
    .eq("type", "Diagnostics")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) {
    await supabase
      .from("firmware_updates")
      .update({ status })
      .eq("id", latest.id);
  }

  return {};
}

// ── Reservations ────────────────────────────────────────────────────

async function handleReserveNow(cpId: string, payload: Record<string, unknown>) {
  const connectorId = (payload.connectorId as number) ?? 0;
  const expiryDate = payload.expiryDate as string;
  const idTag = payload.idTag as string;
  const reservationId = payload.reservationId as number | undefined;
  const parentIdTag = payload.parentIdTag as string | undefined;

  if (!idTag || !expiryDate) {
    return { status: "Rejected" };
  }

  // Check if connector is available
  if (connectorId > 0) {
    const { data: conn } = await supabase
      .from("connectors")
      .select("status")
      .eq("charge_point_id", cpId)
      .eq("connector_id", connectorId)
      .maybeSingle();

    if (conn && conn.status !== "Available") {
      return { status: "Occupied" };
    }
  }

  // Check for existing active reservation on this connector
  const { data: existing } = await supabase
    .from("reservations")
    .select("id")
    .eq("charge_point_id", cpId)
    .eq("connector_id", connectorId)
    .eq("status", "Reserved")
    .maybeSingle();

  if (existing) {
    return { status: "Occupied" };
  }

  // Check tag authorization
  const authResult = await checkTagAuthorized(idTag, cpId);
  if (authResult.status !== "Accepted") {
    return { status: "Rejected" };
  }

  // Create reservation
  const { error } = await supabase.from("reservations").insert({
    charge_point_id: cpId,
    connector_id: connectorId,
    id_tag: idTag,
    expiry_date: expiryDate,
    status: "Reserved",
    parent_id_tag: parentIdTag,
  });

  if (error) {
    console.error("ReserveNow insert error:", error);
    return { status: "Rejected" };
  }

  // Update connector status to Reserved
  if (connectorId > 0) {
    await supabase
      .from("connectors")
      .upsert(
        { charge_point_id: cpId, connector_id: connectorId, status: "Reserved" },
        { onConflict: "charge_point_id,connector_id" }
      );
  }

  return { status: "Accepted" };
}

async function handleCancelReservation(cpId: string, payload: Record<string, unknown>) {
  const reservationId = payload.reservationId as number;

  if (!reservationId) {
    return { status: "Rejected" };
  }

  const { data: reservation, error: fetchErr } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", reservationId)
    .eq("charge_point_id", cpId)
    .eq("status", "Reserved")
    .maybeSingle();

  if (fetchErr || !reservation) {
    return { status: "Rejected" };
  }

  // Cancel the reservation
  await supabase
    .from("reservations")
    .update({ status: "Cancelled" })
    .eq("id", reservationId);

  // Reset connector status back to Available
  if (reservation.connector_id > 0) {
    await supabase
      .from("connectors")
      .update({ status: "Available" })
      .eq("charge_point_id", cpId)
      .eq("connector_id", reservation.connector_id);
  }

  return { status: "Accepted" };
}

async function handleRemoteStartTransaction(cpId: string, payload: Record<string, unknown>) {
  const connectorId = (payload.connectorId as number) || 1;
  const idTag = payload.idTag as string;

  if (!idTag) {
    return { status: "Rejected", reason: "idTag is required" };
  }

  // Check authorization
  const authResult = await checkTagAuthorized(idTag, cpId);
  if (authResult.status !== "Accepted") {
    return { status: "Rejected", reason: `Tag ${authResult.status}` };
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

    // Actions that should be audit-logged (CSMS commands)
    const auditedActions = new Set([
      "RemoteStartTransaction", "RemoteStopTransaction",
      "ChangeConfiguration", "Reset", "TriggerMessage", "GetConfiguration",
      "UnlockConnector", "SetChargingProfile", "ClearChargingProfile", "GetCompositeSchedule",
      "UpdateFirmware", "GetDiagnostics", "ReserveNow", "CancelReservation",
    ]);

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
      case "ChangeConfiguration":
        response = await handleChangeConfiguration(chargePointId, payload);
        break;
      case "Reset":
        response = await handleReset(chargePointId, payload);
        break;
      case "TriggerMessage":
        response = await handleTriggerMessage(chargePointId, payload);
        break;
      case "UnlockConnector":
        response = await handleUnlockConnector(chargePointId, payload);
        break;
      case "SetChargingProfile":
        response = await handleSetChargingProfile(chargePointId, payload);
        break;
      case "GetCompositeSchedule":
        response = await handleGetCompositeSchedule(chargePointId, payload);
        break;
      case "ClearChargingProfile":
        response = await handleClearChargingProfile(chargePointId, payload);
        break;
      case "UpdateFirmware":
        response = await handleUpdateFirmware(chargePointId, payload);
        break;
      case "FirmwareStatusNotification":
        response = await handleFirmwareStatusNotification(chargePointId, payload);
        break;
      case "GetDiagnostics":
        response = await handleGetDiagnostics(chargePointId, payload);
        break;
      case "DiagnosticsStatusNotification":
        response = await handleDiagnosticsStatusNotification(chargePointId, payload);
        break;
      case "ReserveNow":
        response = await handleReserveNow(chargePointId, payload);
        break;
      case "CancelReservation":
        response = await handleCancelReservation(chargePointId, payload);
        break;
      default:
        response = { error: `Unknown action: ${action}` };
    }

    // Write audit log for CSMS commands
    if (auditedActions.has(action)) {
      const resultStatus = (response as Record<string, unknown>).status as string || "Unknown";
      await supabase.from("ocpp_audit_log").insert({
        charge_point_id: chargePointId,
        action,
        payload: payload || {},
        result: response,
        status: resultStatus,
      });
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
