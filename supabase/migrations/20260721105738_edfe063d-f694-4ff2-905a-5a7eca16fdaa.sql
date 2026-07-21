
-- Helper: is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'manager')
$$;

-- 1. charge_points: strict scope
DROP POLICY IF EXISTS "Scoped read charge_points" ON public.charge_points;
CREATE POLICY "Scoped read charge_points" ON public.charge_points FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR (customer_id IS NOT NULL AND customer_id = public.get_my_customer_id())
);

-- 2. Child tables: scope via charge_points.customer_id
DROP POLICY IF EXISTS "Scoped read connectors" ON public.connectors;
CREATE POLICY "Scoped read connectors" ON public.connectors FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (SELECT 1 FROM public.charge_points cp WHERE cp.id = connectors.charge_point_id
             AND cp.customer_id IS NOT NULL AND cp.customer_id = public.get_my_customer_id())
);

DROP POLICY IF EXISTS "Scoped read transactions" ON public.transactions;
CREATE POLICY "Scoped read transactions" ON public.transactions FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (SELECT 1 FROM public.charge_points cp WHERE cp.id = transactions.charge_point_id
             AND cp.customer_id IS NOT NULL AND cp.customer_id = public.get_my_customer_id())
);

DROP POLICY IF EXISTS "Scoped read status_notifications" ON public.status_notifications;
CREATE POLICY "Scoped read status_notifications" ON public.status_notifications FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (SELECT 1 FROM public.charge_points cp WHERE cp.id = status_notifications.charge_point_id
             AND cp.customer_id IS NOT NULL AND cp.customer_id = public.get_my_customer_id())
);

DROP POLICY IF EXISTS "Scoped read config" ON public.charge_point_config;
DROP POLICY IF EXISTS "Authenticated users can manage config" ON public.charge_point_config;
CREATE POLICY "Scoped read config" ON public.charge_point_config FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (SELECT 1 FROM public.charge_points cp WHERE cp.id = charge_point_config.charge_point_id
             AND cp.customer_id IS NOT NULL AND cp.customer_id = public.get_my_customer_id())
);
-- Restore mutate for admins/managers (was ALL true — narrow it)
CREATE POLICY "Admins manage config" ON public.charge_point_config FOR ALL TO authenticated
USING (public.is_admin_or_manager(auth.uid()))
WITH CHECK (public.is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "Scoped read heartbeats" ON public.heartbeats;
CREATE POLICY "Scoped read heartbeats" ON public.heartbeats FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (SELECT 1 FROM public.charge_points cp WHERE cp.id = heartbeats.charge_point_id
             AND cp.customer_id IS NOT NULL AND cp.customer_id = public.get_my_customer_id())
);

-- 3. virtual_grids: add customer_id, backfill, scope
ALTER TABLE public.virtual_grids ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
UPDATE public.virtual_grids SET customer_id = '1eb5b5aa-620d-4d9c-a590-6c06f6bebc17'
  WHERE id = 'c23b1edf-d5f0-4a95-8d9f-8bbdbe988a3c' AND customer_id IS NULL;

DROP POLICY IF EXISTS "Authenticated can read virtual grids" ON public.virtual_grids;
CREATE POLICY "Scoped read virtual grids" ON public.virtual_grids FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR (customer_id IS NOT NULL AND customer_id = public.get_my_customer_id())
);

DROP POLICY IF EXISTS "Authenticated can read grid members" ON public.virtual_grid_members;
CREATE POLICY "Scoped read grid members" ON public.virtual_grid_members FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (SELECT 1 FROM public.virtual_grids vg WHERE vg.id = virtual_grid_members.grid_id
             AND vg.customer_id IS NOT NULL AND vg.customer_id = public.get_my_customer_id())
);

-- energy_meters + meter_readings: scope via virtual_grid_members membership
DROP POLICY IF EXISTS "Authenticated can read meters" ON public.energy_meters;
CREATE POLICY "Scoped read meters" ON public.energy_meters FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.virtual_grid_members m
    JOIN public.virtual_grids vg ON vg.id = m.grid_id
    WHERE m.member_type = 'energy_meter' AND m.member_id = energy_meters.id::text
      AND vg.customer_id IS NOT NULL AND vg.customer_id = public.get_my_customer_id()
  )
);

DROP POLICY IF EXISTS "Authenticated can read readings" ON public.meter_readings;
CREATE POLICY "Scoped read readings" ON public.meter_readings FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.virtual_grid_members m
    JOIN public.virtual_grids vg ON vg.id = m.grid_id
    WHERE m.member_type = 'energy_meter' AND m.member_id = meter_readings.meter_id::text
      AND vg.customer_id IS NOT NULL AND vg.customer_id = public.get_my_customer_id()
  )
);
