import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, meter_id, host, port, channel } = await req.json();

    // Action: poll — fetch live data from Shelly device via HTTP RPC
    if (action === 'poll') {
      if (!host) {
        return jsonRes({ success: false, error: 'Host (IP) is vereist' }, 400);
      }

      const shellyPort = port || 80;

      // Shelly PRO EM-50 Gen2 RPC: get status of all components
      const statusUrl = `http://${host}:${shellyPort}/rpc/Shelly.GetStatus`;
      console.log(`Polling Shelly at ${statusUrl}`);

      let shellyData: any;
      try {
        const resp = await fetch(statusUrl, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        shellyData = await resp.json();
      } catch (fetchErr) {
        console.error('Failed to reach Shelly device:', fetchErr);
        return jsonRes({
          success: false,
          error: `Kan Shelly niet bereiken op ${host}:${shellyPort}. Controleer IP en netwerk.`,
        }, 502);
      }

      // Parse EM1 data (PRO EM-50 has em1:0 and em1:1)
      const channels: any[] = [];
      for (const ch of [0, 1]) {
        const emKey = `em1:${ch}`;
        const emData = shellyData[emKey];
        if (emData) {
          channels.push({
            channel: ch,
            voltage: emData.voltage ?? null,
            current: emData.current ?? null,
            active_power: emData.act_power ?? null,
            apparent_power: emData.aprt_power ?? null,
            power_factor: emData.pf ?? null,
            frequency: emData.freq ?? null,
          });
        }
      }

      // Also try em1data for total energy
      for (const ch of channels) {
        const dataKey = `em1data:${ch.channel}`;
        const emDataComp = shellyData[dataKey];
        if (emDataComp) {
          ch.total_energy = (emDataComp.total_act_energy ?? 0) / 1000; // Wh → kWh
        }
      }

      // If we have a meter_id, save readings to DB
      if (meter_id) {
        for (const ch of channels) {
          await supabase.from('meter_readings').insert({
            meter_id,
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

        // Update meter's last_reading
        await supabase.from('energy_meters').update({
          last_reading: { channels, raw: shellyData.sys || {} },
          last_poll_at: new Date().toISOString(),
        }).eq('id', meter_id);
      }

      return jsonRes({
        success: true,
        data: {
          channels,
          device_info: {
            id: shellyData.sys?.id,
            mac: shellyData.sys?.mac,
            fw_id: shellyData.sys?.fw_id,
            uptime: shellyData.sys?.uptime,
          },
        },
      });
    }

    // Action: test — verify connection to Shelly device
    if (action === 'test') {
      if (!host) {
        return jsonRes({ success: false, error: 'Host (IP) is vereist' }, 400);
      }

      const shellyPort = port || 80;
      try {
        const resp = await fetch(`http://${host}:${shellyPort}/shelly`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const info = await resp.json();

        return jsonRes({
          success: true,
          data: {
            type: info.type || info.model,
            mac: info.mac,
            fw_id: info.fw_id,
            gen: info.gen,
            name: info.name,
            auth_en: info.auth_en,
          },
        });
      } catch (err) {
        return jsonRes({
          success: false,
          error: `Kan niet verbinden met ${host}:${shellyPort}`,
        }, 502);
      }
    }

    // Action: get_em_data — get historical energy data
    if (action === 'get_em_data') {
      if (!host) {
        return jsonRes({ success: false, error: 'Host (IP) is vereist' }, 400);
      }
      const ch = channel ?? 0;
      const shellyPort = port || 80;
      try {
        const resp = await fetch(
          `http://${host}:${shellyPort}/rpc/EM1Data.GetStatus?id=${ch}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        return jsonRes({ success: true, data });
      } catch (err) {
        return jsonRes({ success: false, error: `Fout bij ophalen data: ${err}` }, 502);
      }
    }

    return jsonRes({ success: false, error: `Onbekende actie: ${action}` }, 400);
  } catch (error) {
    console.error('Shelly meter error:', error);
    return jsonRes(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      500,
    );
  }
});

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
