import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();

  const query = useQuery({
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

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('charge-points-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'charge_points' }, () => {
        queryClient.invalidateQueries({ queryKey: ['charge-points'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

export function useConnectors(chargePointId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['connectors', chargePointId],
    queryFn: async () => {
      let q = supabase.from('connectors').select('*').order('connector_id');
      if (chargePointId) q = q.eq('charge_point_id', chargePointId);
      const { data, error } = await q;
      if (error) throw error;
      return data as DbConnector[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('connectors-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connectors' }, () => {
        queryClient.invalidateQueries({ queryKey: ['connectors'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}
