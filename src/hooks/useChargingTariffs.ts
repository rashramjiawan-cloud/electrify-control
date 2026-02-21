import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChargingTariff {
  id: string;
  charge_point_id: string | null;
  name: string;
  price_per_kwh: number;
  start_fee: number;
  idle_fee_per_min: number;
  currency: string;
  is_default: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useChargingTariffs() {
  return useQuery({
    queryKey: ['charging-tariffs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charging_tariffs')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ChargingTariff[];
    },
  });
}

export function useCreateTariff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tariff: Partial<ChargingTariff>) => {
      const { data, error } = await supabase.from('charging_tariffs').insert(tariff).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charging-tariffs'] }),
  });
}

export function useUpdateTariff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChargingTariff>) => {
      const { error } = await supabase.from('charging_tariffs').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charging-tariffs'] }),
  });
}

export function useDeleteTariff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('charging_tariffs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charging-tariffs'] }),
  });
}
