
-- Table to store historical load balance results
CREATE TABLE public.load_balance_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grid_id uuid NOT NULL REFERENCES public.virtual_grids(id) ON DELETE CASCADE,
  grid_name text NOT NULL,
  strategy text NOT NULL,
  total_available_kw numeric NOT NULL DEFAULT 0,
  gtv_limit_kw numeric NOT NULL DEFAULT 0,
  total_allocated_kw numeric NOT NULL DEFAULT 0,
  allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookups by grid and time
CREATE INDEX idx_load_balance_logs_grid_time ON public.load_balance_logs (grid_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.load_balance_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read logs
CREATE POLICY "Authenticated can read load balance logs"
  ON public.load_balance_logs FOR SELECT USING (true);

-- Service role can insert logs (from edge function)
CREATE POLICY "Service can insert load balance logs"
  ON public.load_balance_logs FOR INSERT WITH CHECK (true);

-- Service role can delete logs (for cleanup)
CREATE POLICY "Service can delete load balance logs"
  ON public.load_balance_logs FOR DELETE USING (true);
