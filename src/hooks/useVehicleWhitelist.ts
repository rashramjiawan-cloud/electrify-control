import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhitelistedVehicle {
  id: string;
  vehicle_id: string;
  label: string | null;
  brand: string | null;
  model: string | null;
  enabled: boolean;
  auto_start: boolean;
  charge_point_ids: string[];
  max_power_kw: number | null;
  created_at: string;
  updated_at: string;
}

export function useVehicleWhitelist() {
  return useQuery({
    queryKey: ['vehicle-whitelist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_whitelist')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WhitelistedVehicle[];
    },
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vehicle: {
      vehicle_id: string;
      label?: string;
      brand?: string;
      model?: string;
      enabled?: boolean;
      auto_start?: boolean;
      charge_point_ids?: string[];
      max_power_kw?: number | null;
    }) => {
      const { data, error } = await supabase.from('vehicle_whitelist').insert(vehicle).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle-whitelist'] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string;
      vehicle_id?: string;
      label?: string;
      brand?: string;
      model?: string;
      enabled?: boolean;
      auto_start?: boolean;
      charge_point_ids?: string[];
      max_power_kw?: number | null;
    }) => {
      const { error } = await supabase.from('vehicle_whitelist').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle-whitelist'] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicle_whitelist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle-whitelist'] }),
  });
}
