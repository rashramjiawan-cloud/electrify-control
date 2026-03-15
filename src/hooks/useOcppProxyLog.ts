import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProxyLogEntry {
  id: number;
  backend_id: string;
  backend_name: string;
  charge_point_id: string;
  direction: string;
  action: string | null;
  message_type: string | null;
  status: string;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
}

export function useOcppProxyLog(filters?: {
  backendId?: string;
  chargePointId?: string;
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ocpp-proxy-log', filters],
    queryFn: async () => {
      let q = supabase
        .from('ocpp_proxy_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 100);
      if (filters?.backendId) q = q.eq('backend_id', filters.backendId);
      if (filters?.chargePointId) q = q.eq('charge_point_id', filters.chargePointId);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown) as ProxyLogEntry[];
    },
    refetchInterval: 10_000,
  });
}
