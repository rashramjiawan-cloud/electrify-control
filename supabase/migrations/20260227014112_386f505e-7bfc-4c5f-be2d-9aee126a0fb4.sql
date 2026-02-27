
CREATE TABLE public.mqtt_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_type text NOT NULL, -- 'charge_point', 'energy_meter', 'battery', 'pv_inverter'
  asset_id text NOT NULL,
  asset_name text,
  enabled boolean NOT NULL DEFAULT false,
  broker_host text NOT NULL DEFAULT '',
  broker_port integer NOT NULL DEFAULT 1883,
  use_tls boolean NOT NULL DEFAULT false,
  username text,
  password text,
  client_id text,
  subscribe_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  publish_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  qos integer NOT NULL DEFAULT 1,
  keep_alive_sec integer NOT NULL DEFAULT 60,
  last_connected_at timestamp with time zone,
  connection_status text NOT NULL DEFAULT 'disconnected',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.mqtt_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read mqtt configs" ON public.mqtt_configurations FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert mqtt configs" ON public.mqtt_configurations FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update mqtt configs" ON public.mqtt_configurations FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete mqtt configs" ON public.mqtt_configurations FOR DELETE USING (true);

CREATE UNIQUE INDEX mqtt_configurations_asset_unique ON public.mqtt_configurations (asset_type, asset_id);

CREATE TRIGGER update_mqtt_configurations_updated_at
  BEFORE UPDATE ON public.mqtt_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
