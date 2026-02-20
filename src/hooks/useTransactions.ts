import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

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
  const queryClient = useQueryClient();

  const query = useQuery({
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
  });

  useEffect(() => {
    const channel = supabase
      .channel('transactions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}
