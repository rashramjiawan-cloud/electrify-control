import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GridAlert {
  id: number;
  meter_id: string;
  channel: number;
  metric: string;
  value: number;
  threshold_min: number;
  threshold_max: number;
  direction: string;
  unit: string;
  acknowledged: boolean;
  created_at: string;
}

export function useGridAlertHistory(limit = 100) {
  return useQuery({
    queryKey: ['grid-alerts', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grid_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as unknown as GridAlert[];
    },
    refetchInterval: 15000,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('grid_alerts')
        .update({ acknowledged: true } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grid-alerts'] }),
  });
}

export function useAcknowledgeAllAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('grid_alerts')
        .update({ acknowledged: true } as any)
        .eq('acknowledged', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grid-alerts'] }),
  });
}

export function useClearAlertHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('grid_alerts')
        .delete()
        .neq('id', 0);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grid-alerts'] }),
  });
}
