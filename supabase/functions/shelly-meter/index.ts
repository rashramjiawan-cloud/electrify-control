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

    const { action, meter_id, host, port, channel, auth_user, auth_pass, shelly_device_id, shelly_cloud_server } = await req.json();

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

    // Helper: call Shelly Cloud API via JRPC on port 6022
    const callShellyCloud = async (deviceId: string, method: string, server?: string) => {
      const authKey = Deno.env.get('SHELLY_CLOUD_AUTH_KEY');
      if (!authKey) throw new Error('SHELLY_CLOUD_AUTH_KEY is niet geconfigureerd');

      const cloudServer = server || 'shelly-api-eu.shelly.cloud';
      const url = `https://${cloudServer}:6022/jrpc`;
      console.log(`Shelly Cloud JRPC: ${method} → ${deviceId} via ${url}`);

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          src: 'voltcontrol',
          dst: deviceId,
          method,
          params: {
            auth_key: authKey,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Shelly Cloud JRPC HTTP ${resp.status}: ${text}`);
      }

      const result = await resp.json();
      console.log('Shelly Cloud JRPC response:', JSON.stringify(result).substring(0, 500));

      if (result.error) {
        throw new Error(`Shelly Cloud JRPC error: ${JSON.stringify(result.error)}`);
      }

      return result.result || result;
    };

    // Helper: parse Shelly EM channels from status data (supports EM-50 em1:X and 3EM em:0)
    const parseEM1Channels = (shellyData: any) => {
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
    };

    // Helper: save channels to DB
    const saveChannelsToDB = async (meterId: string, channels: any[], shellyData: any) => {
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
    };

    // Helper: check GTV exceedance and insert record if exceeded
    const checkGtvExceedance = async (meterId: string | null, channels: any[], meterType: string) => {
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

        const sendGtvNotification = async (direction: string, powerKw: number, limitKw: number) => {
          const cooldownAgo = new Date(Date.now() - cooldownMin * 60 * 1000).toISOString();
          const { data: recent } = await supabase
            .from('gtv_exceedances')
            .select('id')
            .eq('direction', direction)
            .gte('created_at', cooldownAgo)
            .order('created_at', { ascending: false })
            .limit(2);

          if (recent && recent.length > 1) {
            console.log(`GTV ${direction} notification skipped (cooldown: ${cooldownMin} min)`);
            return;
          }
          const dirLabel = direction === 'import' ? 'Afname' : 'Teruglevering';
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-alert-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                metric: `gtv_${direction}`,
                label: `GTV ${dirLabel}`,
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
            console.log(`GTV notification sent: ${dirLabel} ${powerKw.toFixed(2)} kW (limiet ${limitKw} kW)`);
          } catch (notifErr) {
            console.error('GTV notification failed:', notifErr);
          }
        };

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
            await sendGtvNotification('import', totalPowerKw, limitKw);
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
            await sendGtvNotification('export', totalPowerKw, limitKw);
          }
        }
      } catch (err) {
        console.error('GTV exceedance check failed:', err);
      }
    };

    // ─── Action: cloud-poll — fetch data via Shelly Cloud JRPC API ───
    if (action === 'cloud-poll') {
      const deviceId = shelly_device_id;
      if (!deviceId) {
        return jsonRes({ success: false, error: 'Shelly Device ID is vereist voor cloud polling' }, 400);
      }

      try {
        const shellyData = await callShellyCloud(deviceId, 'Shelly.GetStatus', shelly_cloud_server);
        const channels = parseEM1Channels(shellyData);

        if (meter_id && channels.length > 0) {
          await saveChannelsToDB(meter_id, channels, shellyData);
          const { data: meterInfo } = await supabase.from('energy_meters').select('meter_type').eq('id', meter_id).single();
          await checkGtvExceedance(meter_id, channels, meterInfo?.meter_type || 'grid');
        }

        return jsonRes({
          success: true,
          source: 'cloud',
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
      } catch (err: any) {
        console.error('Shelly Cloud poll failed:', err);
        return jsonRes({ success: false, error: err.message || 'Cloud poll mislukt' }, 502);
      }
    }

    // ─── Action: cloud-test — verify Shelly Cloud connection ───
    if (action === 'cloud-test') {
      const deviceId = shelly_device_id;
      if (!deviceId) {
        return jsonRes({ success: false, error: 'Shelly Device ID is vereist' }, 400);
      }

      try {
        const shellyData = await callShellyCloud(deviceId, 'Shelly.GetDeviceInfo', shelly_cloud_server);
        return jsonRes({
          success: true,
          source: 'cloud',
          data: {
            id: shellyData.id,
            mac: shellyData.mac,
            model: shellyData.model,
            gen: shellyData.gen,
            fw_id: shellyData.fw_id,
            app: shellyData.app,
          },
        });
      } catch (err: any) {
        return jsonRes({ success: false, error: err.message || 'Cloud verbinding mislukt' }, 502);
      }
    }

    // ─── Action: poll — fetch live data from Shelly device via HTTP RPC (local) ───
    if (action === 'poll') {
      if (!host) {
        return jsonRes({ success: false, error: 'Host is vereist' }, 400);
      }

      const shellyPort = port || 80;
      const baseUrl = buildBaseUrl(host, shellyPort);
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

      const channels = parseEM1Channels(shellyData);

      if (meter_id) {
        await saveChannelsToDB(meter_id, channels, shellyData);
        const { data: meterInfo } = await supabase.from('energy_meters').select('meter_type').eq('id', meter_id).single();
        await checkGtvExceedance(meter_id, channels, meterInfo?.meter_type || 'grid');
      }

      return jsonRes({
        success: true,
        source: 'local',
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

    // ─── Action: test — verify local connection to Shelly device ───
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

    // ─── Action: get_em_data — get historical energy data ───
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

    // ─── Action: poll-all — poll ALL enabled meters (cron) ───
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
          try {
            let shellyData: any;
            let source = 'local';

            // Skip webhook meters — they push data themselves
            if (meter.connection_type === 'webhook') {
              continue;
            }

            // Try cloud first if device_id is configured
            if (meter.shelly_device_id) {
              source = 'cloud';
              shellyData = await callShellyCloud(
                meter.shelly_device_id,
                'Shelly.GetStatus',
                meter.shelly_cloud_server || undefined,
              );
            } else if (meter.host) {
              const shellyPort = meter.port || 80;
              const meterBaseUrl = buildBaseUrl(meter.host, shellyPort);
              const meterHeaders = buildHeaders(meter.auth_user, meter.auth_pass);
              const resp = await fetch(`${meterBaseUrl}/rpc/Shelly.GetStatus`, {
                signal: AbortSignal.timeout(5000),
                headers: meterHeaders,
              });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              shellyData = await resp.json();
            } else {
              continue;
            }

            const channels = parseEM1Channels(shellyData);
            await saveChannelsToDB(meter.id, channels, shellyData);
            await checkGtvExceedance(meter.id, channels, meter.meter_type || 'grid');

            results.push({ meter_id: meter.id, name: meter.name, ok: true, source, channels: channels.length });
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
