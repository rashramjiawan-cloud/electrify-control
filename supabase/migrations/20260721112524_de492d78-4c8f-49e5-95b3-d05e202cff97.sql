
-- pending_ocpp_commands
DROP POLICY IF EXISTS "Authenticated users can read commands" ON public.pending_ocpp_commands;
CREATE POLICY "Scoped read pending commands" ON public.pending_ocpp_commands FOR SELECT TO authenticated
USING (
  is_admin_or_manager(auth.uid())
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- ocpp_proxy_log (currently admin-only read; add customer-scoped read)
CREATE POLICY "Scoped read proxy log" ON public.ocpp_proxy_log FOR SELECT TO authenticated
USING (
  is_admin_or_manager(auth.uid())
  OR charge_point_id IN (SELECT id FROM public.charge_points)
);

-- load_balance_logs
DROP POLICY IF EXISTS "Authenticated can read load balance logs" ON public.load_balance_logs;
CREATE POLICY "Scoped read load balance logs" ON public.load_balance_logs FOR SELECT TO authenticated
USING (
  is_admin_or_manager(auth.uid())
  OR grid_id IN (SELECT id FROM public.virtual_grids)
);

-- grid_alerts (meter_id -> virtual_grid_members.member_id where type='meter')
DROP POLICY IF EXISTS "Authenticated can read grid alerts" ON public.grid_alerts;
CREATE POLICY "Scoped read grid alerts" ON public.grid_alerts FOR SELECT TO authenticated
USING (
  is_admin_or_manager(auth.uid())
  OR meter_id::text IN (
    SELECT member_id FROM public.virtual_grid_members WHERE member_type = 'meter'
  )
);

-- gtv_exceedances
DROP POLICY IF EXISTS "Authenticated can read gtv exceedances" ON public.gtv_exceedances;
CREATE POLICY "Scoped read gtv exceedances" ON public.gtv_exceedances FOR SELECT TO authenticated
USING (
  is_admin_or_manager(auth.uid())
  OR (meter_id IS NOT NULL AND meter_id::text IN (
    SELECT member_id FROM public.virtual_grid_members WHERE member_type = 'meter'
  ))
);
