import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCustomerImpersonation } from '@/hooks/useCustomerImpersonation';
import { useChargePoints } from '@/hooks/useChargePoints';

export interface DbTransaction {
  id: number;
  charge_point_id: string;
  connector_id: number;
  id_tag: string;
  start_time: string;
  stop_time: string | null;
  meter_start: number;
  meter_stop: number | null;
  energy_delivered: number;
  cost: number | null;
  status: string;
  created_at: string;
}

export function useTransactions(limit = 20, dateFrom?: string, dateTo?: string) {
  const { impersonatedCustomerId } = useCustomerImpersonation();
  const { data: chargePoints } = useChargePoints();

  // Get charge point IDs belonging to impersonated customer
  const cpIds = impersonatedCustomerId && chargePoints
    ? chargePoints.map(cp => cp.id)
    : null;

  return useQuery({
    queryKey: ['transactions', limit, dateFrom, dateTo, impersonatedCustomerId, cpIds],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(limit);
      if (dateFrom) query = query.gte('start_time', dateFrom);
      if (dateTo) query = query.lte('start_time', dateTo);
      if (cpIds && cpIds.length > 0) {
        query = query.in('charge_point_id', cpIds);
      } else if (impersonatedCustomerId) {
        // No charge points for this customer, return empty
        return [] as DbTransaction[];
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as DbTransaction[];
    },
    refetchInterval: 30_000,
  });
}
