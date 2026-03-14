
CREATE TABLE public.meter_device_health (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meter_id uuid NOT NULL REFERENCES public.energy_meters(id) ON DELETE CASCADE,
  temperature numeric,
  wifi_rssi integer,
  wifi_ssid text,
  wifi_ip text,
  uptime integer,
  firmware_version text,
  mac text,
  phase_faults jsonb DEFAULT '[]'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meter_device_health_meter_time ON public.meter_device_health(meter_id, recorded_at DESC);

ALTER TABLE public.meter_device_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read device health" ON public.meter_device_health
  FOR SELECT TO public USING (true);

CREATE POLICY "Service can insert device health" ON public.meter_device_health
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Service can delete device health" ON public.meter_device_health
  FOR DELETE TO public USING (true);
