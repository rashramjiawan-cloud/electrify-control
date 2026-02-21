import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GridAlertThreshold {
  id: string;
  metric: string;
  label: string;
  unit: string;
  min_value: number;
  max_value: number;
  enabled: boolean;
}

const QUERY_KEY = ['grid-alert-thresholds'];

export function useGridAlertThresholds() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grid_alert_thresholds' as any)
        .select('*')
        .order('metric');
      if (error) throw error;
      return (data as any[]) as GridAlertThreshold[];
    },
  });

  const updateThreshold = useMutation({
    mutationFn: async (threshold: Partial<GridAlertThreshold> & { id: string }) => {
      const { id, ...updates } = threshold;
      const { error } = await supabase
        .from('grid_alert_thresholds' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Drempelwaarde opgeslagen');
    },
    onError: (err: any) => {
      toast.error('Fout bij opslaan: ' + err.message);
    },
  });

  return { thresholds: query.data ?? [], isLoading: query.isLoading, updateThreshold };
}
