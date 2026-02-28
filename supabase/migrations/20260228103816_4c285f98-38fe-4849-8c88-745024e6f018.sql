
-- 1. Add customer_id to charge_points
ALTER TABLE public.charge_points ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- 2. Helper function: get current user's customer_id
CREATE OR REPLACE FUNCTION public.get_my_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- 3. Update charge_points SELECT policy: admins see all, users without customer see all, users with customer see their own + unassigned
DROP POLICY IF EXISTS "Allow public read charge_points" ON public.charge_points;
CREATE POLICY "Scoped read charge_points" ON public.charge_points
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.get_my_customer_id() IS NULL
  OR customer_id IS NULL
  OR customer_id = public.get_my_customer_id()
);

-- 4. Update transactions SELECT policy
DROP POLICY IF EXISTS "Allow public read transactions" ON public.transactions;
CREATE POLICY "Scoped read transactions" ON public.transactions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 5. Update connectors SELECT policy
DROP POLICY IF EXISTS "Allow public read connectors" ON public.connectors;
CREATE POLICY "Scoped read connectors" ON public.connectors
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 6. Update meter_values SELECT policy
DROP POLICY IF EXISTS "Allow public read meter_values" ON public.meter_values;
CREATE POLICY "Scoped read meter_values" ON public.meter_values
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 7. Update heartbeats SELECT policy
DROP POLICY IF EXISTS "Allow public read heartbeats" ON public.heartbeats;
CREATE POLICY "Scoped read heartbeats" ON public.heartbeats
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 8. Update status_notifications SELECT policy
DROP POLICY IF EXISTS "Allow public read status_notifications" ON public.status_notifications;
CREATE POLICY "Scoped read status_notifications" ON public.status_notifications
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 9. Update ocpp_audit_log SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read audit log" ON public.ocpp_audit_log;
CREATE POLICY "Scoped read audit log" ON public.ocpp_audit_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 10. Update charging_invoices SELECT policy
DROP POLICY IF EXISTS "Authenticated can read invoices" ON public.charging_invoices;
CREATE POLICY "Scoped read invoices" ON public.charging_invoices
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 11. Update charging_profiles SELECT policy
DROP POLICY IF EXISTS "Authenticated can read charging profiles" ON public.charging_profiles;
CREATE POLICY "Scoped read charging profiles" ON public.charging_profiles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 12. Update charge_point_config SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read config" ON public.charge_point_config;
CREATE POLICY "Scoped read config" ON public.charge_point_config
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 13. Update reservations SELECT policy
DROP POLICY IF EXISTS "Authenticated can read reservations" ON public.reservations;
CREATE POLICY "Scoped read reservations" ON public.reservations
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- 14. Update firmware_updates SELECT policy
DROP POLICY IF EXISTS "Authenticated can read firmware updates" ON public.firmware_updates;
CREATE POLICY "Scoped read firmware updates" ON public.firmware_updates
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);
