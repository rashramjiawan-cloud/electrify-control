import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FirmwareFileMetadata {
  id: string;
  file_path: string;
  label: string | null;
  notes: string | null;
  ai_decode: string | null;
  assigned_charge_point_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useFirmwareFileMetadata(filePath?: string) {
  return useQuery({
    queryKey: ['firmware-file-metadata', filePath],
    queryFn: async () => {
      if (!filePath) return null;
      const { data, error } = await supabase
        .from('firmware_file_metadata')
        .select('*')
        .eq('file_path', filePath)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown) as FirmwareFileMetadata | null;
    },
    enabled: !!filePath,
  });
}

export function useUpsertFirmwareFileMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file_path: string;
      label?: string | null;
      notes?: string | null;
      assigned_charge_point_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('firmware_file_metadata')
        .upsert(
          {
            file_path: params.file_path,
            label: params.label,
            notes: params.notes,
            assigned_charge_point_id: params.assigned_charge_point_id,
          } as any,
          { onConflict: 'file_path' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['firmware-file-metadata', vars.file_path] });
      qc.invalidateQueries({ queryKey: ['firmware-file-metadata'] });
    },
  });
}
