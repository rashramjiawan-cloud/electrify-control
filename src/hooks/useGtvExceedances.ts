import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GtvExceedance {
  id: number;
  direction: string;
  power_kw: number;
  limit_kw: number;
  duration_sec: number;
  meter_id: string | null;
  created_at: string;
}

export function useGtvExceedances(limit = 200) {
  return useQuery({
    queryKey: ['gtv-exceedances', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gtv_exceedances')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as GtvExceedance[];
    },
    refetchInterval: 30_000,
  });
}
