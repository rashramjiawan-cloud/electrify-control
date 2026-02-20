
CREATE TABLE public.ocpp_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  charge_point_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'Accepted',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ocpp_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit log"
  ON public.ocpp_audit_log FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert audit log"
  ON public.ocpp_audit_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_audit_log_cp ON public.ocpp_audit_log (charge_point_id);
CREATE INDEX idx_audit_log_action ON public.ocpp_audit_log (action);
CREATE INDEX idx_audit_log_created ON public.ocpp_audit_log (created_at DESC);
