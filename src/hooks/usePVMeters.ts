import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState, useCallback } from 'react';
import type { MeterReading } from './useEnergyMeters';

export interface PVMeter {
  id: string;
  name: string;
  device_type: string;
  enabled: boolean;
  last_reading: any;
  last_poll_at: string | null;
  meter_type: string;
}

export function usePVMeters() {
  return useQuery({
    queryKey: ['pv-meters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('energy_meters')
        .select('*');
      if (error) throw error;
      return ((data as any[]) as PVMeter[]).filter(m => m.meter_type === 'pv');
    },
  });
}

export function usePVReadings(meterId: string | undefined) {
  return useQuery({
    queryKey: ['pv-readings', meterId],
    enabled: !!meterId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_readings')
        .select('*')
        .eq('meter_id', meterId!)
        .order('timestamp', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as MeterReading[];
    },
  });
}

/** Daily energy total: sum of latest total_energy per channel */
export function usePVDailyYield(meterId: string | undefined) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return useQuery({
    queryKey: ['pv-daily-yield', meterId],
    enabled: !!meterId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // Get readings from today
      const { data, error } = await supabase
        .from('meter_readings')
        .select('channel, total_energy, timestamp')
        .eq('meter_id', meterId!)
        .gte('timestamp', todayStart.toISOString())
        .order('timestamp', { ascending: true });
      if (error) throw error;

      if (!data || data.length === 0) return 0;

      // Per channel: latest total_energy - earliest total_energy
      const byChannel = new Map<number, { first: number; last: number }>();
      for (const r of data) {
        const ch = r.channel ?? 0;
        const energy = r.total_energy ?? 0;
        const existing = byChannel.get(ch);
        if (!existing) {
          byChannel.set(ch, { first: energy, last: energy });
        } else {
          existing.last = energy;
        }
      }

      let totalYield = 0;
      for (const v of byChannel.values()) {
        totalYield += Math.max(0, v.last - v.first);
      }
      // Convert Wh to kWh
      return +(totalYield / 1000).toFixed(2);
    },
  });
}

/** Realtime subscription for PV meter readings */
export function usePVRealtime(meterId: string | undefined, onNewReading: () => void) {
  useEffect(() => {
    if (!meterId) return;

    const channel = supabase
      .channel(`pv-readings-${meterId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meter_readings',
          filter: `meter_id=eq.${meterId}`,
        },
        () => onNewReading()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meterId, onNewReading]);
}
