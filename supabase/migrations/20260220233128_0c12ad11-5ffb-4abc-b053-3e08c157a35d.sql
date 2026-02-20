-- Table to store OCPP configuration keys per charge point
CREATE TABLE public.charge_point_config (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  readonly BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(charge_point_id, key)
);

ALTER TABLE public.charge_point_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read config"
ON public.charge_point_config FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can manage config"
ON public.charge_point_config FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to config"
ON public.charge_point_config FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger to seed default config for new charge points
CREATE OR REPLACE FUNCTION public.seed_default_config()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.charge_point_config (charge_point_id, key, value, readonly) VALUES
    (NEW.id, 'HeartbeatInterval', '300', false),
    (NEW.id, 'ConnectionTimeOut', '60', false),
    (NEW.id, 'MeterValueSampleInterval', '60', false),
    (NEW.id, 'MeterValuesSampledData', 'Energy.Active.Import.Register,Power.Active.Import', false),
    (NEW.id, 'ClockAlignedDataInterval', '900', false),
    (NEW.id, 'NumberOfConnectors', '1', true),
    (NEW.id, 'AuthorizeRemoteTxRequests', 'true', false),
    (NEW.id, 'LocalPreAuthorize', 'false', false),
    (NEW.id, 'StopTransactionOnInvalidId', 'true', false),
    (NEW.id, 'StopTransactionOnEVSideDisconnect', 'true', false),
    (NEW.id, 'UnlockConnectorOnEVSideDisconnect', 'true', false),
    (NEW.id, 'ResetRetries', '3', false),
    (NEW.id, 'TransactionMessageAttempts', '3', false),
    (NEW.id, 'TransactionMessageRetryInterval', '30', false),
    (NEW.id, 'SupportedFeatureProfiles', 'Core,FirmwareManagement,LocalAuthListManagement,RemoteTrigger,SmartCharging', true),
    (NEW.id, 'ChargePointModel', COALESCE(NEW.model, 'Unknown'), true),
    (NEW.id, 'ChargePointVendor', COALESCE(NEW.vendor, 'Unknown'), true)
  ON CONFLICT (charge_point_id, key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER seed_config_on_charge_point
AFTER INSERT ON public.charge_points
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_config();

-- Seed config for existing charge points
INSERT INTO public.charge_point_config (charge_point_id, key, value, readonly)
SELECT cp.id, v.key, v.value, v.readonly
FROM public.charge_points cp,
LATERAL (VALUES
  ('HeartbeatInterval', '300', false),
  ('ConnectionTimeOut', '60', false),
  ('MeterValueSampleInterval', '60', false),
  ('MeterValuesSampledData', 'Energy.Active.Import.Register,Power.Active.Import', false),
  ('ClockAlignedDataInterval', '900', false),
  ('NumberOfConnectors', '1', true),
  ('AuthorizeRemoteTxRequests', 'true', false),
  ('LocalPreAuthorize', 'false', false),
  ('StopTransactionOnInvalidId', 'true', false),
  ('StopTransactionOnEVSideDisconnect', 'true', false),
  ('UnlockConnectorOnEVSideDisconnect', 'true', false),
  ('ResetRetries', '3', false),
  ('TransactionMessageAttempts', '3', false),
  ('TransactionMessageRetryInterval', '30', false),
  ('SupportedFeatureProfiles', 'Core,FirmwareManagement,LocalAuthListManagement,RemoteTrigger,SmartCharging', true),
  ('ChargePointModel', COALESCE(cp.model, 'Unknown'), true),
  ('ChargePointVendor', COALESCE(cp.vendor, 'Unknown'), true)
) AS v(key, value, readonly)
ON CONFLICT (charge_point_id, key) DO NOTHING;