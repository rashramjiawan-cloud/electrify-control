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
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('grid-load-balancer', {
        body: {
          mode: 'logs',
          grid_id: gridId,
          limit,
        },
      });

      if (error) {
        console.warn('[load-balance-logs] invoke error:', error);
        return [] as LoadBalanceLog[];
      }

      return ((data as { logs?: LoadBalanceLog[] } | null)?.logs ?? []) as LoadBalanceLog[];
    },
  });
