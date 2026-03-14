
CREATE TABLE public.meter_ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES public.energy_meters(id) ON DELETE CASCADE,
  model_type text NOT NULL, -- 'consumption_high', 'consumption_low', 'long_working_cycle', 'long_idle_cycle'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'training', 'ready', 'failed'
  baseline_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  alerts_enabled boolean NOT NULL DEFAULT true,
  trained_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (meter_id, model_type)
);

ALTER TABLE public.meter_ai_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read meter ai models" ON public.meter_ai_models
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert meter ai models" ON public.meter_ai_models
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update meter ai models" ON public.meter_ai_models
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete meter ai models" ON public.meter_ai_models
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_meter_ai_models_updated_at
  BEFORE UPDATE ON public.meter_ai_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
