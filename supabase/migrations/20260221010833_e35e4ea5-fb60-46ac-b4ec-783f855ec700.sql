
-- Table for energy meter devices (Shelly, etc.)
CREATE TABLE public.energy_meters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT 'Shelly PRO EM-50',
  device_type text NOT NULL DEFAULT 'shelly_pro_em_50',
  connection_type text NOT NULL DEFAULT 'tcp_ip', -- 'tcp_ip' or 'rs485'
  host text, -- IP address for TCP/IP
  port integer DEFAULT 80, -- HTTP port for Shelly
  modbus_address integer DEFAULT 1, -- Modbus slave address for RS485
  poll_interval_sec integer DEFAULT 10,
  enabled boolean NOT NULL DEFAULT true,
  last_reading jsonb DEFAULT '{}'::jsonb,
  last_poll_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.energy_meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read meters" ON public.energy_meters FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert meters" ON public.energy_meters FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update meters" ON public.energy_meters FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete meters" ON public.energy_meters FOR DELETE USING (true);

-- Table for meter readings history
CREATE TABLE public.meter_readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meter_id uuid NOT NULL REFERENCES public.energy_meters(id) ON DELETE CASCADE,
  channel integer NOT NULL DEFAULT 0,
  voltage numeric,
  current numeric,
  active_power numeric,
  apparent_power numeric,
  power_factor numeric,
  frequency numeric,
  total_energy numeric, -- total kWh
  timestamp timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read readings" ON public.meter_readings FOR SELECT USING (true);
CREATE POLICY "Service can insert readings" ON public.meter_readings FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can delete readings" ON public.meter_readings FOR DELETE USING (true);

-- Index for efficient time-series queries
CREATE INDEX idx_meter_readings_meter_ts ON public.meter_readings (meter_id, timestamp DESC);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.energy_meters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_readings;
