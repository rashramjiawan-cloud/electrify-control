import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const apiKey = url.searchParams.get('api_key') || req.headers.get('x-api-key');
  const deviceId = url.searchParams.get('device_id');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Validate API key
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'api_key query param is vereist' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: keySetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'ingest_api_key')
    .single();

  if (!keySetting || keySetting.value !== apiKey) {
    return new Response(JSON.stringify({ error: 'Ongeldige API key' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check for WebSocket upgrade
  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Shelly Outbound WebSocket endpoint. Verbind via ws:// of wss:// met ?api_key=...&device_id=...',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Resolve meter by device_id
  let meterId: string | null = null;
  let meterType = 'grid';

  if (deviceId) {
    const { data: meter } = await supabase
      .from('energy_meters')
      .select('id, meter_type')
      .eq('shelly_device_id', deviceId)
      .eq('enabled', true)
      .single();

    if (meter) {
      meterId = meter.id;
      meterType = meter.meter_type || 'grid';
    } else {
      console.log(`No meter found for device_id: ${deviceId}`);
    }
  }

  // Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log(`Shelly WS connected: device=${deviceId || 'unknown'}, meter=${meterId || 'unlinked'}`);
  };

  socket.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      // Shelly Outbound WS sends frames like:
      // { "src": "shellypro3em-...", "dst": "...", "method": "NotifyFullStatus", "params": { ... } }
      // or { "src": "...", "method": "NotifyStatus", "params": { ... } }
      const method = data.method || '';
      const params = data.params || data.status || data;

      // Also try to resolve meter from src field if not already found
      let currentMeterId = meterId;
      let currentMeterType = meterType;
      if (!currentMeterId && data.src) {
        const { data: meter } = await supabase
          .from('energy_meters')
          .select('id, meter_type')
          .eq('shelly_device_id', data.src)
          .eq('enabled', true)
          .single();
        if (meter) {
          currentMeterId = meter.id;
          currentMeterType = meter.meter_type || 'grid';
        }
      }

      if (!currentMeterId) {
        console.log(`WS frame ignored: no meter found for device ${data.src || deviceId}`);
        return;
      }

      // Only process status notifications
      if (method !== 'NotifyFullStatus' && method !== 'NotifyStatus' && !params['em1:0'] && !params['em:0']) {
        return;
      }

      const channels = parseEM1Channels(params);
      if (channels.length === 0) return;

      // Save to DB
      await saveChannelsToDB(supabase, currentMeterId, channels, params);

      // Check GTV exceedance
      if (currentMeterType === 'grid') {
        await checkGtvExceedance(supabase, supabaseUrl, serviceKey, currentMeterId, channels);
      }

      console.log(`WS data saved: meter=${currentMeterId}, channels=${channels.length}`);
    } catch (err) {
      console.error('WS message processing error:', err);
    }
  };

  socket.onclose = () => {
    console.log(`Shelly WS disconnected: device=${deviceId || 'unknown'}`);
  };

  socket.onerror = (err) => {
    console.error('Shelly WS error:', err);
  };

  return response;
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

async function checkGtvExceedance(supabase: any, supabaseUrl: string, serviceKey: string, meterId: string, channels: any[]) {
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
