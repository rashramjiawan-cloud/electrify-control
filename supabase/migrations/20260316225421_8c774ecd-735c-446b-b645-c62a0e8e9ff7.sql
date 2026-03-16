
ALTER TABLE public.pending_ocpp_commands
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS grid_id uuid,
  ADD COLUMN IF NOT EXISTS allocated_kw numeric;
