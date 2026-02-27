import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MqttConfiguration {
  id: string;
  asset_type: string;
  asset_id: string;
  asset_name: string | null;
  enabled: boolean;
  broker_host: string;
  broker_port: number;
  use_tls: boolean;
  username: string | null;
  password: string | null;
  client_id: string | null;
  subscribe_topics: string[];
  publish_topics: string[];
  qos: number;
  keep_alive_sec: number;
  last_connected_at: string | null;
  connection_status: string;
  created_at: string;
  updated_at: string;
}

export type MqttConfigInsert = Omit<MqttConfiguration, 'id' | 'created_at' | 'updated_at' | 'last_connected_at' | 'connection_status'>;

export function useMqttConfigurations(assetType?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['mqtt_configurations', assetType],
    queryFn: async () => {
      let q = supabase.from('mqtt_configurations' as any).select('*');
      if (assetType) q = q.eq('asset_type', assetType);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MqttConfiguration[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (config: Partial<MqttConfiguration> & { asset_type: string; asset_id: string }) => {
      const { data, error } = await (supabase.from('mqtt_configurations' as any) as any)
        .upsert(config, { onConflict: 'asset_type,asset_id' })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as MqttConfiguration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mqtt_configurations'] });
      toast.success('MQTT configuratie opgeslagen');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('mqtt_configurations' as any) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mqtt_configurations'] });
      toast.success('MQTT configuratie verwijderd');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { ...query, upsert, remove };
}

export function useMqttConfigForAsset(assetType: string, assetId: string) {
  return useQuery({
    queryKey: ['mqtt_configurations', assetType, assetId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('mqtt_configurations' as any) as any)
        .select('*')
        .eq('asset_type', assetType)
        .eq('asset_id', assetId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as MqttConfiguration | null;
    },
  });
}
