import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuthorizedTag {
  id: string;
  id_tag: string;
  label: string | null;
  enabled: boolean;
  expiry_date: string | null;
  charge_point_ids: string[];
  created_at: string;
  updated_at: string;
}

export function useAuthorizedTags() {
  return useQuery({
    queryKey: ['authorized-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('authorized_tags')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AuthorizedTag[];
    },
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tag: { id_tag: string; label?: string; enabled?: boolean; expiry_date?: string | null; charge_point_ids?: string[] }) => {
      const { data, error } = await supabase.from('authorized_tags').insert(tag).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['authorized-tags'] }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; id_tag?: string; label?: string; enabled?: boolean; expiry_date?: string | null; charge_point_ids?: string[] }) => {
      const { error } = await supabase.from('authorized_tags').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['authorized-tags'] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('authorized_tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['authorized-tags'] }),
  });
}
