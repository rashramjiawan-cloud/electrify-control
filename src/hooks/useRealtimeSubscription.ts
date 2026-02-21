import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribe to realtime changes on OCPP tables and invalidate
 * the corresponding React Query caches so the UI auto-refreshes.
 */
export const useRealtimeSubscription = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('ocpp-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'charge_points' },
        () => queryClient.invalidateQueries({ queryKey: ['charge-points'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connectors' },
        () => queryClient.invalidateQueries({ queryKey: ['connectors'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => queryClient.invalidateQueries({ queryKey: ['transactions'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ocpp_audit_log' },
        () => queryClient.invalidateQueries({ queryKey: ['ocpp-audit-log'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'status_notifications' },
        () => queryClient.invalidateQueries({ queryKey: ['charge-points'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meter_readings' },
        () => queryClient.invalidateQueries({ queryKey: ['meter-readings'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'energy_meters' },
        () => queryClient.invalidateQueries({ queryKey: ['energy-meters'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gtv_exceedances' },
        () => queryClient.invalidateQueries({ queryKey: ['gtv-exceedances'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
