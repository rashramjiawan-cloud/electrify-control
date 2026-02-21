
-- Table for GTV exceedance history
CREATE TABLE public.gtv_exceedances (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direction text NOT NULL DEFAULT 'import', -- 'import' or 'export'
  power_kw numeric NOT NULL,
  limit_kw numeric NOT NULL,
  duration_sec integer DEFAULT 0,
  meter_id uuid REFERENCES public.energy_meters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gtv_exceedances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read gtv exceedances"
  ON public.gtv_exceedances FOR SELECT USING (true);

CREATE POLICY "Service can insert gtv exceedances"
  ON public.gtv_exceedances FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can delete gtv exceedances"
  ON public.gtv_exceedances FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gtv_exceedances;
