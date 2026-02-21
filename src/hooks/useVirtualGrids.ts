import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VirtualGrid {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  gtv_limit_kw: number;
  balancing_strategy: string;
  enabled: boolean;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface VirtualGridMember {
  id: string;
  grid_id: string;
  member_type: 'battery' | 'energy_meter' | 'charge_point' | 'solar';
  member_id: string;
  member_name: string | null;
  priority: number;
  max_power_kw: number;
  enabled: boolean;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const useVirtualGrids = () =>
  useQuery({
    queryKey: ['virtual_grids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('virtual_grids')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as VirtualGrid[];
    },
  });

export const useVirtualGridMembers = (gridId?: string) =>
  useQuery({
    queryKey: ['virtual_grid_members', gridId],
    enabled: !!gridId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('virtual_grid_members')
        .select('*')
        .eq('grid_id', gridId!)
        .order('priority', { ascending: true });
      if (error) throw error;
      return data as VirtualGridMember[];
    },
  });

export const useCreateVirtualGrid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grid: Partial<VirtualGrid>) => {
      const { data, error } = await supabase.from('virtual_grids').insert(grid as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['virtual_grids'] }),
  });
};

export const useUpdateVirtualGrid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<VirtualGrid> & { id: string }) => {
      const { data, error } = await supabase.from('virtual_grids').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['virtual_grids'] }),
  });
};

export const useDeleteVirtualGrid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('virtual_grids').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['virtual_grids'] }),
  });
};

export const useAddGridMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (member: Partial<VirtualGridMember>) => {
      const { data, error } = await supabase.from('virtual_grid_members').insert(member as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['virtual_grid_members', vars.grid_id] }),
  });
};

export const useRemoveGridMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, gridId }: { id: string; gridId: string }) => {
      const { error } = await supabase.from('virtual_grid_members').delete().eq('id', id);
      if (error) throw error;
      return gridId;
    },
    onSuccess: (gridId) => qc.invalidateQueries({ queryKey: ['virtual_grid_members', gridId] }),
  });
};
