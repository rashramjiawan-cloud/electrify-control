import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MeterAiModel {
  id: string;
  meter_id: string;
  model_type: string;
  status: string;
  baseline_data: Record<string, any>;
  alerts_enabled: boolean;
  trained_at: string | null;
  created_at: string;
  updated_at: string;
}

const MODEL_TYPES = [
  'consumption_high',
  'consumption_low',
  'long_working_cycle',
  'long_idle_cycle',
] as const;

export type ModelType = (typeof MODEL_TYPES)[number];

export function useMeterAiModels(meterId?: string) {
  const queryClient = useQueryClient();

  const { data: models, isLoading } = useQuery({
    queryKey: ['meter-ai-models', meterId],
    enabled: !!meterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_ai_models')
        .select('*')
        .eq('meter_id', meterId!);
      if (error) throw error;
      return (data ?? []) as MeterAiModel[];
    },
  });

  const trainModel = useMutation({
    mutationFn: async ({ meterId, modelType }: { meterId: string; modelType: string }) => {
      const { data, error } = await supabase.functions.invoke('train-meter-model', {
        body: { meterId, modelType },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-ai-models', meterId] });
      toast.success('AI model succesvol getraind');
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['meter-ai-models', meterId] });
      toast.error(`Training mislukt: ${err.message || 'Onbekende fout'}`);
    },
  });

  const toggleAlerts = useMutation({
    mutationFn: async ({ modelId, enabled }: { modelId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('meter_ai_models')
        .update({ alerts_enabled: enabled })
        .eq('id', modelId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-ai-models', meterId] });
    },
  });

  const deleteModel = useMutation({
    mutationFn: async (modelId: string) => {
      const { error } = await supabase
        .from('meter_ai_models')
        .delete()
        .eq('id', modelId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-ai-models', meterId] });
      toast.success('AI model verwijderd');
    },
  });

  const readyCount = models?.filter(m => m.status === 'ready').length ?? 0;
  const totalSlots = 10;

  return {
    models: models ?? [],
    isLoading,
    readyCount,
    totalSlots,
    MODEL_TYPES,
    trainModel,
    toggleAlerts,
    deleteModel,
  };
}
