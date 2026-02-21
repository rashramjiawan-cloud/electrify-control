import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NotificationChannel {
  id: string;
  type: 'webhook' | 'slack' | 'email';
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['notification-channels'];

export function useNotificationChannels() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_channels' as any)
        .select('*')
        .order('created_at');
      if (error) throw error;
      return (data as any[]) as NotificationChannel[];
    },
  });

  const createChannel = useMutation({
    mutationFn: async (channel: Omit<NotificationChannel, 'id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('notification_channels' as any)
        .insert(channel as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Notificatiekanaal toegevoegd');
    },
    onError: (err: any) => toast.error('Fout: ' + err.message),
  });

  const updateChannel = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<NotificationChannel> & { id: string }) => {
      const { error } = await supabase
        .from('notification_channels' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Kanaal bijgewerkt');
    },
    onError: (err: any) => toast.error('Fout: ' + err.message),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_channels' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Kanaal verwijderd');
    },
    onError: (err: any) => toast.error('Fout: ' + err.message),
  });

  return {
    channels: query.data ?? [],
    isLoading: query.isLoading,
    createChannel,
    updateChannel,
    deleteChannel,
  };
}
