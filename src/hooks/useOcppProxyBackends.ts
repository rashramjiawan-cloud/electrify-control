import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OcppProxyBackend {
  id: string;
  name: string;
  backend_type: string;
  url: string;
  enabled: boolean;
  ocpp_subprotocol: string | null;
  auth_header: string | null;
  allow_commands: boolean;
  command_api_key: string | null;
  charge_point_filter: string[];
  connection_status: string;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export function useOcppProxyBackends() {
  return useQuery({
    queryKey: ['ocpp-proxy-backends'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ocpp_proxy_backends' as any)
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown) as OcppProxyBackend[];
    },
    refetchInterval: 30_000,
  });
}

export function useCreateProxyBackend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Partial<OcppProxyBackend>) => {
      const { error } = await supabase
        .from('ocpp_proxy_backends' as any)
        .insert(params as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ocpp-proxy-backends'] });
      toast.success('Proxy backend aangemaakt');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}

export function useUpdateProxyBackend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: Partial<OcppProxyBackend> & { id: string }) => {
      const { error } = await supabase
        .from('ocpp_proxy_backends' as any)
        .update(params as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ocpp-proxy-backends'] });
      toast.success('Proxy backend bijgewerkt');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}

export function useDeleteProxyBackend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ocpp_proxy_backends' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ocpp-proxy-backends'] });
      toast.success('Proxy backend verwijderd');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}
