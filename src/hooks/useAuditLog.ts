import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useAuditLog = (limit = 50) => {
  return useQuery({
    queryKey: ['ocpp-audit-log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ocpp_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });
};
