import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DbChargePoint {
  id: string;
  name: string;
  model: string | null;
  vendor: string | null;
  serial_number: string | null;
  status: string;
  firmware_version: string | null;
  location: string | null;
  max_power: number;
  energy_delivered: number;
  last_heartbeat: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbConnector {
  id: number;
  charge_point_id: string;
  connector_id: number;
  status: string;
  current_power: number;
  meter_value: number;
  created_at: string;
  updated_at: string;
}

export function useChargePoints() {
  return useQuery({
    queryKey: ['charge-points'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charge_points')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as DbChargePoint[];
    },
  });
}

export function useConnectors(chargePointId?: string) {
  return useQuery({
    queryKey: ['connectors', chargePointId],
    queryFn: async () => {
      let q = supabase.from('connectors').select('*').order('connector_id');
      if (chargePointId) q = q.eq('charge_point_id', chargePointId);
      const { data, error } = await q;
      if (error) throw error;
      return data as DbConnector[];
    },
  });
}
