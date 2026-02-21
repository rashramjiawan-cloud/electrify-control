
CREATE TABLE public.charging_behavior_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_date date NOT NULL DEFAULT CURRENT_DATE,
  patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  peak_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  transaction_count integer DEFAULT 0,
  total_energy_kwh numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_charging_behavior_date ON public.charging_behavior_analyses (analysis_date);

ALTER TABLE public.charging_behavior_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read analyses" ON public.charging_behavior_analyses FOR SELECT USING (true);
CREATE POLICY "Service can insert analyses" ON public.charging_behavior_analyses FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can delete analyses" ON public.charging_behavior_analyses FOR DELETE USING (true);
