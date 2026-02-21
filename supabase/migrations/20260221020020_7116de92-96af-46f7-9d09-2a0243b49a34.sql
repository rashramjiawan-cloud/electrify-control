
-- System settings table for app-wide configuration
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated can update settings" ON public.system_settings FOR UPDATE USING (true);
CREATE POLICY "Authenticated can insert settings" ON public.system_settings FOR INSERT WITH CHECK (true);

-- Seed default retention setting (90 days)
INSERT INTO public.system_settings (key, value, description) VALUES
  ('meter_data_retention_days', '90', 'Aantal dagen dat meterdata bewaard blijft'),
  ('grid_alerts_retention_days', '180', 'Aantal dagen dat grid alerts bewaard blijven'),
  ('audit_log_retention_days', '365', 'Aantal dagen dat audit logs bewaard blijven');

-- Enable pg_cron and pg_net for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
