import { useMemo } from 'react';
import { useEnergyMeters, useMeterReadings } from './useEnergyMeters';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EnergyFlow {
  type: 'grid' | 'pv' | 'battery';
  label: string;
  totalPowerKw: number;
  meters: {
    id: string;
    name: string;
    powerKw: number;
    isLive: boolean;
  }[];
}

/**
 * Fetch latest readings for ALL enabled meters (not just one).
 * Groups power by meter_type for a complete energy flow overview.
 */
export function useEnergyFlows() {
  const { data: meters, isLoading: metersLoading } = useEnergyMeters();

  const enabledMeters = useMemo(
    () => meters?.filter(m => m.enabled) ?? [],
    [meters]
  );

  const meterIds = useMemo(
    () => enabledMeters.map(m => m.id),
    [enabledMeters]
  );

  // Fetch latest readings for all enabled meters at once
  const { data: allReadings, isLoading: readingsLoading } = useQuery({
    queryKey: ['energy-flow-readings', meterIds],
    enabled: meterIds.length > 0,
    refetchInterval: 10_000,
    queryFn: async () => {
      // For each meter, get the latest reading (across all channels)
      const { data, error } = await supabase
        .from('meter_readings')
        .select('*')
        .in('meter_id', meterIds)
        .order('timestamp', { ascending: false })
        .limit(meterIds.length * 3); // 3 channels per meter max
      if (error) throw error;
      return data;
    },
  });

  const flows = useMemo<EnergyFlow[]>(() => {
    if (!enabledMeters.length) return [];

    const TYPES: Array<{ type: 'grid' | 'pv' | 'battery'; label: string }> = [
      { type: 'grid', label: 'Grid (net)' },
      { type: 'pv', label: 'Zonne-energie' },
      { type: 'battery', label: 'Batterij' },
    ];

    return TYPES.map(({ type, label }) => {
      const metersOfType = enabledMeters.filter(m => m.meter_type === type);

      const meterFlows = metersOfType.map(meter => {
        // Find latest readings for this meter
        const meterReadings = allReadings?.filter(r => r.meter_id === meter.id) ?? [];
        // Sum power across channels (latest reading per channel)
        const seenChannels = new Set<number>();
        let totalPower = 0;
        let hasData = false;
        for (const r of meterReadings) {
          const ch = r.channel ?? 0;
          if (seenChannels.has(ch)) continue;
          seenChannels.add(ch);
          if (r.active_power != null) {
            totalPower += r.active_power;
            hasData = true;
          }
        }

        return {
          id: meter.id,
          name: meter.name,
          powerKw: hasData ? +(totalPower / 1000).toFixed(2) : 0,
          isLive: hasData,
        };
      });

      return {
        type,
        label,
        totalPowerKw: +(meterFlows.reduce((s, m) => s + m.powerKw, 0)).toFixed(2),
        meters: meterFlows,
      };
    });
  }, [enabledMeters, allReadings]);

  const isLoading = metersLoading || readingsLoading;
  const hasAnyLive = flows.some(f => f.meters.some(m => m.isLive));

  return { flows, isLoading, hasAnyLive };
}
