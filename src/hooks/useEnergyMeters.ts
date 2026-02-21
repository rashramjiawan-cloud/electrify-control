import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EnergyMeter {
  id: string;
  name: string;
  device_type: string;
  connection_type: string;
  host: string | null;
  port: number;
  modbus_address: number;
  poll_interval_sec: number;
  enabled: boolean;
  last_reading: any;
  last_poll_at: string | null;
  auth_user: string | null;
  auth_pass: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeterReading {
  id: number;
  meter_id: string;
  channel: number;
  voltage: number | null;
  current: number | null;
  active_power: number | null;
  apparent_power: number | null;
  power_factor: number | null;
  frequency: number | null;
  total_energy: number | null;
  timestamp: string;
}

export function useEnergyMeters() {
  return useQuery({
    queryKey: ['energy-meters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('energy_meters')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EnergyMeter[];
    },
  });
}

export function useCreateMeter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meter: Partial<EnergyMeter>) => {
      const { data, error } = await supabase.from('energy_meters').insert(meter).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['energy-meters'] }),
  });
}

export function useUpdateMeter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<EnergyMeter>) => {
      const { error } = await supabase.from('energy_meters').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['energy-meters'] }),
  });
}

export function useDeleteMeter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('energy_meters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['energy-meters'] }),
  });
}

export function useMeterReadings(meterId: string | undefined, limit = 60) {
  return useQuery({
    queryKey: ['meter-readings', meterId, limit],
    enabled: !!meterId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_readings')
        .select('*')
        .eq('meter_id', meterId!)
        .order('timestamp', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as MeterReading[];
    },
  });
}

export function usePollMeter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ meter_id, host, port, auth_user, auth_pass }: { meter_id?: string; host: string; port?: number; auth_user?: string; auth_pass?: string }) => {
      const { data, error } = await supabase.functions.invoke('shelly-meter', {
        body: { action: 'poll', meter_id, host, port, auth_user, auth_pass },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['energy-meters'] });
      qc.invalidateQueries({ queryKey: ['meter-readings'] });
    },
  });
}

export function useTestMeterConnection() {
  return useMutation({
    mutationFn: async ({ host, port, auth_user, auth_pass }: { host: string; port?: number; auth_user?: string; auth_pass?: string }) => {
      const { data, error } = await supabase.functions.invoke('shelly-meter', {
        body: { action: 'test', host, port, auth_user, auth_pass },
      });
      if (error) throw error;
      return data;
    },
  });
}
