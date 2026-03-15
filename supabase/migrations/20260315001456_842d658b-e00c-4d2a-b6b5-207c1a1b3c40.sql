
-- OCPP Proxy Backends: stores downstream destinations for fan-out
CREATE TABLE public.ocpp_proxy_backends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  backend_type text NOT NULL DEFAULT 'ocpp_ws',  -- 'ocpp_ws' | 'http_webhook'
  url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  -- For OCPP WS backends
  ocpp_subprotocol text DEFAULT 'ocpp1.6',
  -- For HTTP webhook backends  
  auth_header text DEFAULT NULL,
  -- Bidirectional: allow this backend to send commands
  allow_commands boolean NOT NULL DEFAULT false,
  command_api_key text DEFAULT encode(gen_random_bytes(24), 'hex'),
  -- Filtering
  charge_point_filter text[] DEFAULT '{}',  -- empty = all charge points
  -- Status tracking
  connection_status text NOT NULL DEFAULT 'disconnected',
  last_connected_at timestamptz DEFAULT NULL,
  last_error text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ocpp_proxy_backends ENABLE ROW LEVEL SECURITY;

-- Only admins can manage proxy backends
CREATE POLICY "Admins can manage proxy backends"
  ON public.ocpp_proxy_backends FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Service role full access (for edge functions)
CREATE POLICY "Service role full access proxy backends"
  ON public.ocpp_proxy_backends FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
