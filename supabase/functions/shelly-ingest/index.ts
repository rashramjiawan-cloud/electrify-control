import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Authenticate via x-api-key header or query param
    const apiKey = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('api_key');
    if (!apiKey) {
      return jsonRes({ success: false, error: 'x-api-key header of ?api_key= is vereist' }, 401);
    }

    const { data: keySetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ingest_api_key')
      .single();

    if (!keySetting || keySetting.value !== apiKey) {
      return jsonRes({ success: false, error: 'Ongeldige API key' }, 403);
    }

    const body = await req.json();

    // Support two payload formats:
    // 1. Shelly outbound webhook: { device_id, status: { em1:0: {...}, ... } }
    // 2. Direct status push: { meter_id, channels: [...] } or raw Shelly status JSON

    let meterId: string | null = null;
    let channels: any[] = [];
    let rawData: any = {};

    if (body.device_id && body.status) {
      // Format 1: Shelly outbound webhook format
      // Find meter by shelly_device_id
      const { data: meter } = await supabase
        .from('energy_meters')
        .select('id, meter_type')
        .eq('shelly_device_id', body.device_id)
        .eq('enabled', true)
        .single();

      if (!meter) {
        // Try to match by name or create auto
        console.log(`No meter found for device_id: ${body.device_id}`);
        return jsonRes({ success: false, error: `Geen meter gevonden voor device_id: ${body.device_id}` }, 404);
      }

      meterId = meter.id;
      channels = parseEM1Channels(body.status);
      rawData = body.status;

      // Save and check GTV
      if (channels.length > 0) {
        await saveChannelsToDB(supabase, meterId, channels, rawData);
        await checkGtvExceedance(supabase, supabaseUrl, serviceKey, meterId, channels, meter.meter_type || 'grid');
      }

    } else if (body.meter_id && body.channels) {
      // Format 2: Pre-parsed channels
      meterId = body.meter_id;
      channels = body.channels;

      const { data: meter } = await supabase
        .from('energy_meters')
        .select('meter_type')
        .eq('id', meterId)
        .single();

      if (channels.length > 0) {
        await saveChannelsToDB(supabase, meterId!, channels, body);
        await checkGtvExceedance(supabase, supabaseUrl, serviceKey, meterId!, channels, meter?.meter_type || 'grid');
      }

    } else if (body['em1:0'] || body['em1:1'] || body['em1:2']) {
      // Format 3: Raw Shelly GetStatus JSON — need meter_id from query or header
      const qMeterId = new URL(req.url).searchParams.get('meter_id') || req.headers.get('x-meter-id');
      if (!qMeterId) {
        return jsonRes({ success: false, error: 'meter_id query param of x-meter-id header is vereist bij raw Shelly data' }, 400);
      }

      meterId = qMeterId;
      channels = parseEM1Channels(body);
      rawData = body;

      const { data: meter } = await supabase
        .from('energy_meters')
        .select('meter_type')
        .eq('id', meterId)
        .single();

      if (channels.length > 0) {
        await saveChannelsToDB(supabase, meterId, channels, rawData);
        await checkGtvExceedance(supabase, supabaseUrl, serviceKey, meterId, channels, meter?.meter_type || 'grid');
      }

    } else {
      return jsonRes({ success: false, error: 'Onbekend payload formaat. Verwacht: { device_id, status } of { meter_id, channels }' }, 400);
    }

    return jsonRes({
      success: true,
      meter_id: meterId,
      channels_saved: channels.length,
    });

  } catch (error) {
    console.error('Shelly ingest error:', error);
    return jsonRes(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500,
    );
  }
});

// ─── Helpers ───

function parseEM1Channels(shellyData: any) {
  const channels: any[] = [];

  // Format 1: Shelly PRO EM-50 → em1:0, em1:1, em1:2
  for (const ch of [0, 1, 2]) {
    const emKey = `em1:${ch}`;
    const emData = shellyData[emKey];
    if (emData) {
      const chData: any = {
        channel: ch,
        voltage: emData.voltage ?? null,
        current: emData.current ?? null,
        active_power: emData.act_power ?? null,
        apparent_power: emData.aprt_power ?? null,
        power_factor: emData.pf ?? null,
        frequency: emData.freq ?? null,
      };
      const dataKey = `em1data:${ch}`;
      if (shellyData[dataKey]) {
        chData.total_energy = (shellyData[dataKey].total_act_energy ?? 0) / 1000;
      }
      channels.push(chData);
    }
  }

  // Format 2: Shelly PRO 3EM → em:0 with a_/b_/c_ prefixed fields
  if (channels.length === 0 && shellyData['em:0']) {
    const em = shellyData['em:0'];
    const emData = shellyData['emdata:0'];
    const phases = ['a', 'b', 'c'];
    for (let ch = 0; ch < phases.length; ch++) {
      const p = phases[ch];
      const voltage = em[`${p}_voltage`] ?? null;
      const current = em[`${p}_current`] ?? null;
      const activePower = em[`${p}_act_power`] ?? null;
      const apparentPower = em[`${p}_aprt_power`] ?? null;
      const pf = em[`${p}_pf`] ?? null;
      const freq = em[`${p}_freq`] ?? em.c_freq ?? null;
      // Only add if at least voltage or power is present
      if (voltage !== null || activePower !== null) {
        const chData: any = {
          channel: ch,
          voltage,
          current,
          active_power: activePower,
          apparent_power: apparentPower,
          power_factor: pf,
          frequency: freq,
        };
        if (emData) {
          chData.total_energy = (emData[`${p}_total_act_energy`] ?? 0) / 1000;
        }
        channels.push(chData);
      }
    }
  }

  return channels;
}

async function saveChannelsToDB(supabase: any, meterId: string, channels: any[], shellyData: any) {
  for (const ch of channels) {
    await supabase.from('meter_readings').insert({
      meter_id: meterId,
      channel: ch.channel,
      voltage: ch.voltage,
      current: ch.current,
      active_power: ch.active_power,
      apparent_power: ch.apparent_power,
      power_factor: ch.power_factor,
      frequency: ch.frequency,
      total_energy: ch.total_energy,
    });
  }
  await supabase.from('energy_meters').update({
    last_reading: { channels, raw: shellyData.sys || shellyData.wifi || {} },
    last_poll_at: new Date().toISOString(),
  }).eq('id', meterId);
}

async function checkGtvExceedance(supabase: any, supabaseUrl: string, serviceKey: string, meterId: string, channels: any[], meterType: string) {
  if (meterType !== 'grid') return;

  try {
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['gtv_import_limit', 'gtv_export_limit', 'gtv_notification_cooldown_min']);

    if (!settings?.length) return;

    const importLimit = settings.find((s: any) => s.key === 'gtv_import_limit');
    const exportLimit = settings.find((s: any) => s.key === 'gtv_export_limit');
    const cooldownSetting = settings.find((s: any) => s.key === 'gtv_notification_cooldown_min');
    const cooldownMin = cooldownSetting ? parseInt(cooldownSetting.value, 10) || 15 : 15;

    const totalPowerW = channels.reduce((sum: number, ch: any) => sum + (ch.active_power ?? 0), 0);
    const totalPowerKw = Math.abs(totalPowerW) / 1000;

    const insertAndNotify = async (direction: string, powerKw: number, limitKw: number) => {
      await supabase.from('gtv_exceedances').insert({
        direction,
        power_kw: powerKw,
        limit_kw: limitKw,
        meter_id: meterId,
      });

      const cooldownAgo = new Date(Date.now() - cooldownMin * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('gtv_exceedances')
        .select('id')
        .eq('direction', direction)
        .gte('created_at', cooldownAgo)
        .limit(2);

      if (recent && recent.length > 1) return;

      try {
        await fetch(`${supabaseUrl}/functions/v1/send-alert-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            metric: `gtv_${direction}`,
            label: `GTV ${direction === 'import' ? 'Afname' : 'Teruglevering'}`,
            value: parseFloat(powerKw.toFixed(2)),
            unit: 'kW',
            direction: 'high',
            channel: 0,
            meter_id: meterId,
            threshold_min: 0,
            threshold_max: limitKw,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        console.error('GTV notification failed:', err);
      }
    };

    if (totalPowerW > 0 && importLimit) {
      const limitKw = parseFloat(importLimit.value);
      if (limitKw > 0 && totalPowerKw > limitKw) {
        await insertAndNotify('import', totalPowerKw, limitKw);
      }
    } else if (totalPowerW < 0 && exportLimit) {
      const limitKw = parseFloat(exportLimit.value);
      if (limitKw > 0 && totalPowerKw > limitKw) {
        await insertAndNotify('export', totalPowerKw, limitKw);
      }
    }
  } catch (err) {
    console.error('GTV exceedance check failed:', err);
  }
}

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
