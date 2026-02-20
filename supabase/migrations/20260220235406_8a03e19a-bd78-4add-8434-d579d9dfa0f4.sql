-- Allow authenticated users to delete charge points
CREATE POLICY "Allow authenticated delete charge_points"
ON public.charge_points
FOR DELETE
USING (true);

-- Allow authenticated users to delete related connectors
CREATE POLICY "Allow service delete connectors"
ON public.connectors
FOR DELETE
USING (true);

-- Allow delete on charge_point_config
CREATE POLICY "Allow service delete config"
ON public.charge_point_config
FOR DELETE
USING (true);

-- Allow delete on heartbeats
CREATE POLICY "Allow service delete heartbeats"
ON public.heartbeats
FOR DELETE
USING (true);

-- Allow delete on meter_values
CREATE POLICY "Allow service delete meter_values"
ON public.meter_values
FOR DELETE
USING (true);

-- Allow delete on status_notifications
CREATE POLICY "Allow service delete status_notifications"
ON public.status_notifications
FOR DELETE
USING (true);

-- Allow delete on transactions
CREATE POLICY "Allow service delete transactions"
ON public.transactions
FOR DELETE
USING (true);

-- Allow delete on ocpp_audit_log
CREATE POLICY "Allow service delete ocpp_audit_log"
ON public.ocpp_audit_log
FOR DELETE
USING (true);