import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EnergyMeter } from '@/hooks/useEnergyMeters';

interface LocalPollResult {
  channels: {
    channel: number;
    voltage: number | null;
    current: number | null;
    active_power: number | null;
    apparent_power: number | null;
    power_factor: number | null;
    frequency: number | null;
    total_energy: number | null;
  }[];
  device_info?: { id?: string; mac?: string; uptime?: number };
}

export function useLocalPoll() {
  const qc = useQueryClient();
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollOnce = useCallback(async (meter: EnergyMeter): Promise<LocalPollResult | null> => {
    if (!meter.host) {
      setError('Geen IP-adres geconfigureerd');
      return null;
    }

    const port = meter.port || 80;
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(meter.host);
    const baseUrl = isIp ? `http://${meter.host}:${port}` : `https://${meter.host}`;
    const url = `${baseUrl}/rpc/Shelly.GetStatus`;

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      const channels: LocalPollResult['channels'] = [];
      for (const ch of [0, 1]) {
        const emData = data[`em1:${ch}`];
        if (emData) {
          const chData: any = {
            channel: ch,
            voltage: emData.voltage ?? null,
            current: emData.current ?? null,
            active_power: emData.act_power ?? null,
            apparent_power: emData.aprt_power ?? null,
            power_factor: emData.pf ?? null,
            frequency: emData.freq ?? null,
            total_energy: null,
          };
          const emDataComp = data[`em1data:${ch}`];
          if (emDataComp) {
            chData.total_energy = (emDataComp.total_act_energy ?? 0) / 1000;
          }
          channels.push(chData);
        }
      }

      // Save readings to DB
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

      // Update meter last_reading
      await supabase.from('energy_meters').update({
        last_reading: { channels, raw: data.sys || {} },
        last_poll_at: new Date().toISOString(),
      }).eq('id', meter.id);

      qc.invalidateQueries({ queryKey: ['energy-meters'] });
      qc.invalidateQueries({ queryKey: ['meter-readings'] });

      setError(null);
      return {
        channels,
        device_info: {
          id: data.sys?.id,
          mac: data.sys?.mac,
          uptime: data.sys?.uptime,
        },
      };
    } catch (err: any) {
      const msg = err?.name === 'TimeoutError'
        ? `Timeout: Shelly niet bereikbaar op ${meter.host}:${port}`
        : `Fout: ${err?.message || 'Kan Shelly niet bereiken'}`;
      setError(msg);
      return null;
    }
  }, [qc]);

  return { pollOnce, polling, setPolling, error };
}

/**
 * Auto-poll a meter locally from the browser at a given interval.
 */
export function useLocalAutoPoll(meter: EnergyMeter | undefined, intervalMs = 10000) {
  const { pollOnce, error } = useLocalPoll();
  const [active, setActive] = useState(false);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => setActive(false), []);
  const toggle = useCallback(() => setActive(a => !a), []);

  useEffect(() => {
    if (!active || !meter) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    const doPoll = async () => {
      const res = await pollOnce(meter);
      if (res) setLastPoll(new Date());
    };

    // Poll immediately, then at interval
    doPoll();
    intervalRef.current = setInterval(doPoll, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, meter, intervalMs, pollOnce]);

  return { active, start, stop, toggle, lastPoll, error };
}
