-- Add meter_type to energy_meters to distinguish grid/pv/battery meters
ALTER TABLE public.energy_meters ADD COLUMN meter_type text NOT NULL DEFAULT 'grid';