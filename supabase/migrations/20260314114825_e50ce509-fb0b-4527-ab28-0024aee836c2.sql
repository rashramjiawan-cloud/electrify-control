CREATE TABLE public.meter_ai_model_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.meter_ai_models(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.energy_meters(id) ON DELETE CASCADE,
  model_type text NOT NULL,
  baseline_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  trained_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meter_ai_model_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read model history"
  ON public.meter_ai_model_history FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service can insert model history"
  ON public.meter_ai_model_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete model history"
  ON public.meter_ai_model_history FOR DELETE
  TO authenticated USING (true);

CREATE INDEX idx_model_history_model_id ON public.meter_ai_model_history(model_id);
CREATE INDEX idx_model_history_meter_id ON public.meter_ai_model_history(meter_id);