import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LoadBalanceLog {
  id: string;
  grid_id: string;
  grid_name: string;
  strategy: string;
  total_available_kw: number;
  gtv_limit_kw: number;
  total_allocated_kw: number;
  allocations: any[];
  created_at: string;
}

export const useLoadBalanceLogs = (gridId?: string, limit = 20) =>
  useQuery({
    queryKey: ['load_balance_logs', gridId, limit],
    queryFn: async () => {
      let query = supabase
        .from('load_balance_logs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (gridId) {
        query = query.eq('grid_id', gridId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as LoadBalanceLog[];
    },
  });
