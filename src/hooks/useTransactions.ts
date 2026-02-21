import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DbTransaction {
  id: number;
  charge_point_id: string;
  connector_id: number;
  id_tag: string;
  start_time: string;
  stop_time: string | null;
  meter_start: number;
  meter_stop: number | null;
  energy_delivered: number;
  cost: number | null;
  status: string;
  created_at: string;
}

export function useTransactions(limit = 20) {
  return useQuery({
    queryKey: ['transactions', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as DbTransaction[];
    },
    refetchInterval: 30_000,
  });
}
