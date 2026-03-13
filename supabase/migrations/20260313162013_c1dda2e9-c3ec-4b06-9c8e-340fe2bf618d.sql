ALTER TABLE public.energy_meters
  ADD COLUMN IF NOT EXISTS shelly_device_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shelly_cloud_server text DEFAULT 'shelly-api-eu.shelly.cloud';