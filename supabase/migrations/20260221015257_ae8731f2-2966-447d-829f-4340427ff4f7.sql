
CREATE TABLE public.grid_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meter_id uuid REFERENCES public.energy_meters(id) ON DELETE CASCADE,
  channel integer NOT NULL DEFAULT 0,
  metric text NOT NULL,
  value numeric NOT NULL,
  threshold_min numeric NOT NULL,
  threshold_max numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('low', 'high')),
  unit text NOT NULL DEFAULT '',
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grid_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read grid alerts"
  ON public.grid_alerts FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert grid alerts"
  ON public.grid_alerts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated can update grid alerts"
  ON public.grid_alerts FOR UPDATE
  USING (true);

CREATE POLICY "Authenticated can delete grid alerts"
  ON public.grid_alerts FOR DELETE
  USING (true);

CREATE INDEX idx_grid_alerts_created_at ON public.grid_alerts(created_at DESC);
CREATE INDEX idx_grid_alerts_meter_id ON public.grid_alerts(meter_id);
