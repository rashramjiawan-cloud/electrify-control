
-- Charge Points tabel
CREATE TABLE public.charge_points (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  vendor TEXT,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'Unavailable',
  firmware_version TEXT,
  location TEXT,
  max_power NUMERIC DEFAULT 0,
  energy_delivered NUMERIC DEFAULT 0,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Connectors tabel
CREATE TABLE public.connectors (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available',
  current_power NUMERIC DEFAULT 0,
  meter_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(charge_point_id, connector_id)
);

-- Transactions tabel
CREATE TABLE public.transactions (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id),
  connector_id INTEGER NOT NULL,
  id_tag TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  stop_time TIMESTAMPTZ,
  meter_start NUMERIC NOT NULL DEFAULT 0,
  meter_stop NUMERIC,
  energy_delivered NUMERIC DEFAULT 0,
  cost NUMERIC,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meter Values tabel
CREATE TABLE public.meter_values (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id),
  connector_id INTEGER NOT NULL,
  transaction_id INTEGER REFERENCES public.transactions(id),
  measurand TEXT NOT NULL DEFAULT 'Energy.Active.Import.Register',
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Wh',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Heartbeats log
CREATE TABLE public.heartbeats (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status notifications log
CREATE TABLE public.status_notifications (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id),
  connector_id INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_code TEXT DEFAULT 'NoError',
  info TEXT,
  vendor_error_code TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.charge_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_notifications ENABLE ROW LEVEL SECURITY;

-- Public read policies (backoffice dashboard needs to read all data)
CREATE POLICY "Allow public read charge_points" ON public.charge_points FOR SELECT USING (true);
CREATE POLICY "Allow public read connectors" ON public.connectors FOR SELECT USING (true);
CREATE POLICY "Allow public read transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read meter_values" ON public.meter_values FOR SELECT USING (true);
CREATE POLICY "Allow public read heartbeats" ON public.heartbeats FOR SELECT USING (true);
CREATE POLICY "Allow public read status_notifications" ON public.status_notifications FOR SELECT USING (true);

-- Service role insert/update policies (edge functions use service role)
CREATE POLICY "Allow service insert charge_points" ON public.charge_points FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update charge_points" ON public.charge_points FOR UPDATE USING (true);
CREATE POLICY "Allow service insert connectors" ON public.connectors FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update connectors" ON public.connectors FOR UPDATE USING (true);
CREATE POLICY "Allow service insert transactions" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update transactions" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "Allow service insert meter_values" ON public.meter_values FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert heartbeats" ON public.heartbeats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert status_notifications" ON public.status_notifications FOR INSERT WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_charge_points_updated_at BEFORE UPDATE ON public.charge_points FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_connectors_updated_at BEFORE UPDATE ON public.connectors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for charge_points and connectors
ALTER PUBLICATION supabase_realtime ADD TABLE public.charge_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.connectors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
