import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SystemSetting {
  key: string;
  value: string;
  description: string | null;
}

const QUERY_KEY = ['system-settings'];

export function useSystemSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings' as any)
        .select('*');
      if (error) throw error;
      return (data as any[]) as SystemSetting[];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('system_settings' as any)
        .update({ value } as any)
        .eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Instelling opgeslagen');
    },
    onError: (err: any) => {
      toast.error('Fout bij opslaan: ' + err.message);
    },
  });

  const getSetting = (key: string) => query.data?.find((s) => s.key === key);

  return { settings: query.data ?? [], isLoading: query.isLoading, updateSetting, getSetting };
}
