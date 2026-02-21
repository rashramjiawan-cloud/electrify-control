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

    const { action, meter_id, host, port, channel, auth_user, auth_pass } = await req.json();

    // Helper: build base URL — use https for hostnames (tunnel), http for IPs
    const buildBaseUrl = (h: string, p: number) => {
      const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(h);
      const protocol = isIp ? 'http' : 'https';
      return isIp ? `${protocol}://${h}:${p}` : `${protocol}://${h}`;
    };

    // Helper: build fetch headers with optional Basic Auth
    const buildHeaders = (user?: string | null, pass?: string | null): Record<string, string> => {
      if (user && pass) {
        const encoded = btoa(`${user}:${pass}`);
        return { 'Authorization': `Basic ${encoded}` };
      }
      return {};
    };

    // Helper: check GTV exceedance and insert record if exceeded
    const checkGtvExceedance = async (meterId: string | null, channels: any[], meterType: string) => {
      // Only check grid meters
      if (meterType !== 'grid') return;
      
      try {
        // Fetch GTV limits from system_settings
        const { data: settings } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['gtv_import_limit', 'gtv_export_limit']);

        if (!settings?.length) return;

        const importLimit = settings.find((s: any) => s.key === 'gtv_import_limit');
        const exportLimit = settings.find((s: any) => s.key === 'gtv_export_limit');

        // Sum active power across all channels (Watts → kW)
        const totalPowerW = channels.reduce((sum: number, ch: any) => sum + (ch.active_power ?? 0), 0);
        const totalPowerKw = Math.abs(totalPowerW) / 1000;

        // Positive power = import (afname), negative = export (teruglevering)
        if (totalPowerW > 0 && importLimit) {
          const limitKw = parseFloat(importLimit.value);
          if (limitKw > 0 && totalPowerKw > limitKw) {
            console.log(`GTV import exceedance: ${totalPowerKw.toFixed(2)} kW > ${limitKw} kW`);
            await supabase.from('gtv_exceedances').insert({
              direction: 'import',
              power_kw: totalPowerKw,
              limit_kw: limitKw,
              meter_id: meterId,
            });
          }
        } else if (totalPowerW < 0 && exportLimit) {
          const limitKw = parseFloat(exportLimit.value);
          if (limitKw > 0 && totalPowerKw > limitKw) {
            console.log(`GTV export exceedance: ${totalPowerKw.toFixed(2)} kW > ${limitKw} kW`);
            await supabase.from('gtv_exceedances').insert({
              direction: 'export',
              power_kw: totalPowerKw,
              limit_kw: limitKw,
              meter_id: meterId,
            });
          }
        }
      } catch (err) {
        console.error('GTV exceedance check failed:', err);
      }
    };

    // Action: poll — fetch live data from Shelly device via HTTP RPC
    if (action === 'poll') {
      if (!host) {
        return jsonRes({ success: false, error: 'Host is vereist' }, 400);
      }

      const shellyPort = port || 80;
      const baseUrl = buildBaseUrl(host, shellyPort);

      // Shelly PRO EM-50 Gen2 RPC: get status of all components
      const statusUrl = `${baseUrl}/rpc/Shelly.GetStatus`;
      console.log(`Polling Shelly at ${statusUrl}`);

      let shellyData: any;
      const headers = buildHeaders(auth_user, auth_pass);
      try {
        const resp = await fetch(statusUrl, { signal: AbortSignal.timeout(5000), headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        shellyData = await resp.json();
      } catch (fetchErr) {
        console.error('Failed to reach Shelly device:', fetchErr);
        return jsonRes({
          success: false,
          error: `Kan Shelly niet bereiken op ${host}:${shellyPort}. Controleer IP en netwerk.`,
        }, 502);
      }

      // Parse EM1 data (PRO EM-50 has em1:0, em1:1, em1:2)
      const channels: any[] = [];
      for (const ch of [0, 1, 2]) {
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

        // Check GTV exceedance
        // Fetch meter_type to know if it's a grid meter
        const { data: meterInfo } = await supabase.from('energy_meters').select('meter_type').eq('id', meter_id).single();
        await checkGtvExceedance(meter_id, channels, meterInfo?.meter_type || 'grid');
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
        return jsonRes({ success: false, error: 'Host is vereist' }, 400);
      }

      const shellyPort = port || 80;
      const baseUrl = buildBaseUrl(host, shellyPort);
      try {
        const testHeaders = buildHeaders(auth_user, auth_pass);
        const resp = await fetch(`${baseUrl}/shelly`, {
          signal: AbortSignal.timeout(5000),
          headers: testHeaders,
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
        return jsonRes({ success: false, error: 'Host is vereist' }, 400);
      }
      const ch = channel ?? 0;
      const shellyPort = port || 80;
      const baseUrl = buildBaseUrl(host, shellyPort);
      try {
        const emHeaders = buildHeaders(auth_user, auth_pass);
        const resp = await fetch(
          `${baseUrl}/rpc/EM1Data.GetStatus?id=${ch}`,
          { signal: AbortSignal.timeout(5000), headers: emHeaders },
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        return jsonRes({ success: true, data });
      } catch (err) {
        return jsonRes({ success: false, error: `Fout bij ophalen data: ${err}` }, 502);
      }
    }

    // Action: poll-all — poll ALL enabled meters in a loop (called by cron every minute)
    if (action === 'poll-all') {
      const { data: meters } = await supabase
        .from('energy_meters')
        .select('*')
        .eq('enabled', true);

      if (!meters?.length) {
        return jsonRes({ success: true, message: 'Geen actieve meters gevonden' });
      }

      const pollOnce = async () => {
        const results: any[] = [];
        for (const meter of meters) {
          if (!meter.host) continue;
          try {
            const shellyPort = meter.port || 80;
            const meterBaseUrl = buildBaseUrl(meter.host, shellyPort);
            const meterHeaders = buildHeaders(meter.auth_user, meter.auth_pass);
            const resp = await fetch(`${meterBaseUrl}/rpc/Shelly.GetStatus`, {
              signal: AbortSignal.timeout(5000),
              headers: meterHeaders,
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const shellyData = await resp.json();

            const channels: any[] = [];
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

            for (const ch of channels) {
              await supabase.from('meter_readings').insert({
                meter_id: meter.id,
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
              last_reading: { channels, raw: shellyData.sys || {} },
              last_poll_at: new Date().toISOString(),
            }).eq('id', meter.id);

            // Check GTV exceedance for grid meters
            await checkGtvExceedance(meter.id, channels, meter.meter_type || 'grid');

            results.push({ meter_id: meter.id, name: meter.name, ok: true, channels: channels.length });
          } catch (err) {
            console.error(`Poll failed for ${meter.name}:`, err);
            results.push({ meter_id: meter.id, name: meter.name, ok: false, error: String(err) });
          }
        }
        return results;
      };

      // Poll 6 times with 10s interval (~60s total, cron fires every minute)
      const allResults: any[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await pollOnce();
        allResults.push({ iteration: i + 1, timestamp: new Date().toISOString(), results: res });
        if (i < 5) {
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      return jsonRes({ success: true, polls: allResults });
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
