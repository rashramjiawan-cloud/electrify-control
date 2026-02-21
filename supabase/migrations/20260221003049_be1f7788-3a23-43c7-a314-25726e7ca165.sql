
-- Smart Charging profiles table (OCPP 1.6 ChargingProfile)
CREATE TABLE public.charging_profiles (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL DEFAULT 0,
  stack_level INTEGER NOT NULL DEFAULT 0,
  charging_profile_purpose TEXT NOT NULL DEFAULT 'TxDefaultProfile',
  charging_profile_kind TEXT NOT NULL DEFAULT 'Relative',
  recurrency_kind TEXT,
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_to TIMESTAMP WITH TIME ZONE,
  charging_schedule_unit TEXT NOT NULL DEFAULT 'W',
  duration INTEGER,
  start_schedule TIMESTAMP WITH TIME ZONE,
  min_charging_rate NUMERIC,
  schedule_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one profile per stack level per connector per charge point
CREATE UNIQUE INDEX idx_charging_profiles_unique 
  ON public.charging_profiles(charge_point_id, connector_id, stack_level) 
  WHERE active = true;

-- Enable RLS
ALTER TABLE public.charging_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read charging profiles"
  ON public.charging_profiles FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert charging profiles"
  ON public.charging_profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can update charging profiles"
  ON public.charging_profiles FOR UPDATE USING (true);

CREATE POLICY "Authenticated can delete charging profiles"
  ON public.charging_profiles FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_charging_profiles_updated_at
  BEFORE UPDATE ON public.charging_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
