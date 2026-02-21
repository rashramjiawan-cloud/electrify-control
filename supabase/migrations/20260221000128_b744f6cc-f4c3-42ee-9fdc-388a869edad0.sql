-- Charging tariffs table
CREATE TABLE public.charging_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id text REFERENCES public.charge_points(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Standaard',
  price_per_kwh numeric NOT NULL DEFAULT 0.30,
  start_fee numeric NOT NULL DEFAULT 0,
  idle_fee_per_min numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.charging_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tariffs"
ON public.charging_tariffs FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert tariffs"
ON public.charging_tariffs FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can update tariffs"
ON public.charging_tariffs FOR UPDATE USING (true);

CREATE POLICY "Authenticated can delete tariffs"
ON public.charging_tariffs FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.charging_tariffs;

-- Trigger for updated_at
CREATE TRIGGER update_charging_tariffs_updated_at
BEFORE UPDATE ON public.charging_tariffs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert a default tariff
INSERT INTO public.charging_tariffs (name, price_per_kwh, start_fee, is_default, active)
VALUES ('Standaard tarief', 0.30, 0, true, true);