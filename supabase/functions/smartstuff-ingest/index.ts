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

// Validate API key (same system_settings key as ocpp-ingest)
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

// Find or auto-create a SmartStuff energy meter
async function findOrCreateMeter(
  meterId?: string
): Promise<string | null> {
  if (meterId) {
    const { data } = await supabase
      .from("energy_meters")
      .select("id")
      .eq("id", meterId)
      .maybeSingle();
    if (data) return data.id;
  }

  // Look for existing smartstuff meter
  const { data: existing } = await supabase
    .from("energy_meters")
    .select("id")
    .eq("device_type", "smartstuff_ultra_x2")
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Auto-create one
  const { data: created, error } = await supabase
    .from("energy_meters")
    .insert({
      name: "SmartStuff Ultra X2",
      device_type: "smartstuff_ultra_x2",
      connection_type: "mqtt_http",
      meter_type: "grid",
      enabled: true,
      poll_interval_sec: 10,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Auto-create meter error:", error);
    return null;
  }
  return created.id;
}

// ── DSMR JSON parsing ────────────────────────────────────────
// SmartStuff Ultra X2 publishes DSMR telegrams as JSON via MQTT.
// Common fields (from DSMR-API firmware):
//   power_delivered_l1, power_delivered_l2, power_delivered_l3 (kW)
//   power_returned_l1, power_returned_l2, power_returned_l3 (kW)
//   voltage_l1, voltage_l2, voltage_l3 (V)
//   current_l1, current_l2, current_l3 (A)
//   energy_delivered_tariff1, energy_delivered_tariff2 (kWh)
//   gas_delivered (m³)
//   power_delivered, power_returned (total kW)

interface DsmrPayload {
  // Per-phase power in kW
  power_delivered_l1?: number;
  power_delivered_l2?: number;
  power_delivered_l3?: number;
  power_returned_l1?: number;
  power_returned_l2?: number;
  power_returned_l3?: number;
  // Per-phase voltage & current
  voltage_l1?: number;
  voltage_l2?: number;
  voltage_l3?: number;
  current_l1?: number;
  current_l2?: number;
  current_l3?: number;
  // Totals
  power_delivered?: number;
  power_returned?: number;
  energy_delivered_tariff1?: number;
  energy_delivered_tariff2?: number;
  energy_returned_tariff1?: number;
  energy_returned_tariff2?: number;
  // Timestamp
  timestamp?: string;
  // Allow extra fields
  [key: string]: unknown;
}

function parseDsmrToReadings(
  meterId: string,
  payload: DsmrPayload,
  ts: string
) {
  const readings: Array<{
    meter_id: string;
    channel: number;
    voltage: number | null;
    current: number | null;
    active_power: number | null;
    power_factor: number | null;
    frequency: number | null;
    total_energy: number | null;
    timestamp: string;
  }> = [];

  // Phase mapping: channel 0 = L1, 1 = L2, 2 = L3
  const phases = [
    {
      channel: 0,
      power_del: payload.power_delivered_l1,
      power_ret: payload.power_returned_l1,
      voltage: payload.voltage_l1,
      current: payload.current_l1,
    },
    {
      channel: 1,
      power_del: payload.power_delivered_l2,
      power_ret: payload.power_returned_l2,
      voltage: payload.voltage_l2,
      current: payload.current_l2,
    },
    {
      channel: 2,
      power_del: payload.power_delivered_l3,
      power_ret: payload.power_returned_l3,
      voltage: payload.voltage_l3,
      current: payload.current_l3,
    },
  ];

  for (const phase of phases) {
    // Skip phases with no data at all
    if (
      phase.power_del == null &&
      phase.power_ret == null &&
      phase.voltage == null &&
      phase.current == null
    ) {
      continue;
    }

    // Net power in Watts (delivered - returned), DSMR values are in kW
    const deliveredW = (phase.power_del ?? 0) * 1000;
    const returnedW = (phase.power_ret ?? 0) * 1000;
    const netPowerW = deliveredW - returnedW;

    readings.push({
      meter_id: meterId,
      channel: phase.channel,
      voltage: phase.voltage ?? null,
      current: phase.current ?? null,
      active_power: netPowerW,
      power_factor: null,
      frequency: null,
      total_energy: null,
      timestamp: ts,
    });
  }

  // If we have total energy, add to channel 0
  const totalEnergyKwh =
    (payload.energy_delivered_tariff1 ?? 0) +
    (payload.energy_delivered_tariff2 ?? 0);

  if (totalEnergyKwh > 0 && readings.length > 0) {
    readings[0].total_energy = totalEnergyKwh;
  }

  return readings;
}

// ── Update last_reading on the meter ─────────────────────────
async function updateMeterLastReading(
  meterId: string,
  payload: DsmrPayload,
  ts: string
) {
  const totalDelivered =
    (payload.power_delivered_l1 ?? 0) +
    (payload.power_delivered_l2 ?? 0) +
    (payload.power_delivered_l3 ?? 0);
  const totalReturned =
    (payload.power_returned_l1 ?? 0) +
    (payload.power_returned_l2 ?? 0) +
    (payload.power_returned_l3 ?? 0);

  await supabase
    .from("energy_meters")
    .update({
      last_reading: {
        total_power_kw: +(totalDelivered - totalReturned).toFixed(3),
        power_delivered_kw: +totalDelivered.toFixed(3),
        power_returned_kw: +totalReturned.toFixed(3),
        voltage_l1: payload.voltage_l1,
        voltage_l2: payload.voltage_l2,
        voltage_l3: payload.voltage_l3,
        energy_delivered_kwh:
          (payload.energy_delivered_tariff1 ?? 0) +
          (payload.energy_delivered_tariff2 ?? 0),
        energy_returned_kwh:
          (payload.energy_returned_tariff1 ?? 0) +
          (payload.energy_returned_tariff2 ?? 0),
      },
      last_poll_at: ts,
    } as any)
    .eq("id", meterId);
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        info: "SmartStuff Ultra X2 DSMR Ingest API",
        usage: {
          method: "POST",
          headers: { "x-api-key": "<your ingest api key>" },
          body: {
            meter_id: "(optional) UUID of energy_meter",
            timestamp: "(optional) ISO 8601",
            power_delivered_l1: 0.5,
            power_delivered_l2: 0.3,
            power_delivered_l3: 0.1,
            power_returned_l1: 0,
            power_returned_l2: 0,
            power_returned_l3: 0,
            voltage_l1: 230.5,
            voltage_l2: 231.2,
            voltage_l3: 229.8,
            current_l1: 2.1,
            current_l2: 1.3,
            current_l3: 0.4,
            energy_delivered_tariff1: 12345.678,
            energy_delivered_tariff2: 6789.012,
          },
        },
        mqtt_forwarder:
          "Configure your MQTT broker to forward SmartStuff topics to this endpoint via a simple HTTP bridge script.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Validate API key
  const authorized = await validateApiKey(req);
  if (!authorized) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized. Provide a valid x-api-key header.",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body: DsmrPayload & { meter_id?: string } = await req.json();
    const ts = (body.timestamp as string) || new Date().toISOString();

    // Find or create meter
    const meterId = await findOrCreateMeter(body.meter_id as string);
    if (!meterId) {
      return new Response(
        JSON.stringify({ error: "Could not resolve energy meter" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse DSMR payload into meter_readings rows
    const readings = parseDsmrToReadings(meterId, body, ts);

    if (readings.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          note: "No phase data found in payload",
          meter_id: meterId,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert readings
    const { error: insertError } = await supabase
      .from("meter_readings")
      .insert(readings);

    if (insertError) {
      console.error("Insert readings error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update meter summary
    await updateMeterLastReading(meterId, body, ts);

    return new Response(
      JSON.stringify({
        ok: true,
        meter_id: meterId,
        readings_inserted: readings.length,
        timestamp: ts,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[smartstuff-ingest] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
