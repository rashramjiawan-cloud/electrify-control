
CREATE TABLE public.vehicle_whitelist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  label TEXT,
  brand TEXT,
  model TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_start BOOLEAN NOT NULL DEFAULT true,
  charge_point_ids TEXT[] DEFAULT '{}'::text[],
  max_power_kw NUMERIC DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id)
);

ALTER TABLE public.vehicle_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read vehicles" ON public.vehicle_whitelist FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert vehicles" ON public.vehicle_whitelist FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update vehicles" ON public.vehicle_whitelist FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete vehicles" ON public.vehicle_whitelist FOR DELETE USING (true);

CREATE TRIGGER update_vehicle_whitelist_updated_at
  BEFORE UPDATE ON public.vehicle_whitelist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
