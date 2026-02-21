
CREATE TABLE public.grid_alert_thresholds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric text NOT NULL UNIQUE,
  label text NOT NULL,
  unit text NOT NULL DEFAULT '',
  min_value numeric NOT NULL,
  max_value numeric NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.grid_alert_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read thresholds" ON public.grid_alert_thresholds FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert thresholds" ON public.grid_alert_thresholds FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update thresholds" ON public.grid_alert_thresholds FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete thresholds" ON public.grid_alert_thresholds FOR DELETE USING (true);

-- Seed default values
INSERT INTO public.grid_alert_thresholds (metric, label, unit, min_value, max_value) VALUES
  ('voltage', 'Spanning', 'V', 207, 253),
  ('frequency', 'Frequentie', 'Hz', 49.8, 50.2),
  ('pf', 'Power Factor', '', 0.85, 1);

CREATE TRIGGER update_grid_alert_thresholds_updated_at
  BEFORE UPDATE ON public.grid_alert_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
