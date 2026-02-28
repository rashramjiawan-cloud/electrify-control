import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  customer_id: string | null;
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
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
  });
}

export function useUpdateChargePointCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chargePointId, customerId }: { chargePointId: string; customerId: string | null }) => {
      const { error } = await supabase
        .from('charge_points')
        .update({ customer_id: customerId } as any)
        .eq('id', chargePointId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charge-points'] });
      toast.success('Klant bijgewerkt');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}
