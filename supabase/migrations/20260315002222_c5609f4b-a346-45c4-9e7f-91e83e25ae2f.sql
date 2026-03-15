
CREATE TABLE public.ocpp_proxy_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  backend_id uuid REFERENCES public.ocpp_proxy_backends(id) ON DELETE CASCADE NOT NULL,
  backend_name text NOT NULL,
  charge_point_id text NOT NULL,
  direction text NOT NULL DEFAULT 'upstream',  -- 'upstream' (CP→backend) | 'downstream' (backend→CP) | 'response' (CSMS response→backend)
  action text DEFAULT NULL,  -- OCPP action name if applicable
  message_type text DEFAULT NULL,  -- 'CALL' | 'CALLRESULT' | 'CALLERROR'
  status text NOT NULL DEFAULT 'success',  -- 'success' | 'error'
  error_message text DEFAULT NULL,
  latency_ms integer DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ocpp_proxy_log ENABLE ROW LEVEL SECURITY;

-- Admins can read and manage logs
CREATE POLICY "Admins can manage proxy logs"
  ON public.ocpp_proxy_log FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Service role for edge functions to insert
CREATE POLICY "Service role full access proxy logs"
  ON public.ocpp_proxy_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public insert for edge functions (no JWT)
CREATE POLICY "Allow service insert proxy logs"
  ON public.ocpp_proxy_log FOR INSERT
  TO public
  WITH CHECK (true);

-- Index for efficient querying
CREATE INDEX idx_proxy_log_created_at ON public.ocpp_proxy_log (created_at DESC);
CREATE INDEX idx_proxy_log_backend_id ON public.ocpp_proxy_log (backend_id);
CREATE INDEX idx_proxy_log_charge_point ON public.ocpp_proxy_log (charge_point_id);
