
-- Add optional HTTP Basic Auth credentials for Shelly devices behind a tunnel/proxy
ALTER TABLE public.energy_meters
  ADD COLUMN auth_user text DEFAULT NULL,
  ADD COLUMN auth_pass text DEFAULT NULL;

-- Add a comment for clarity
COMMENT ON COLUMN public.energy_meters.auth_user IS 'Optional HTTP Basic Auth username for tunnel access';
COMMENT ON COLUMN public.energy_meters.auth_pass IS 'Optional HTTP Basic Auth password for tunnel access';
