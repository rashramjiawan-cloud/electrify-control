
CREATE TABLE public.pending_ocpp_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id text NOT NULL,
  action text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  response jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz DEFAULT NULL
);

ALTER TABLE public.pending_ocpp_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert commands"
  ON public.pending_ocpp_commands FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read commands"
  ON public.pending_ocpp_commands FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update commands"
  ON public.pending_ocpp_commands FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access"
  ON public.pending_ocpp_commands FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_ocpp_commands;
