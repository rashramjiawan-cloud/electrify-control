import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useMyModulePermissions() {
  const { user, isAdmin } = useAuth();

  return useQuery({
    queryKey: ['my-module-permissions', user?.id],
    enabled: !!user && !isAdmin, // admins see everything
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_module_permissions')
        .select('module_path, enabled')
        .eq('user_id', user!.id);
      if (error) throw error;
      // Build a map of disabled modules
      const disabled = new Set<string>();
      for (const row of data || []) {
        if (!row.enabled) disabled.add(row.module_path);
      }
      return disabled;
    },
    staleTime: 30_000,
  });
}
