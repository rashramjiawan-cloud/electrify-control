import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChargingInvoice {
  id: string;
  transaction_id: number;
  vehicle_id: string | null;
  charge_point_id: string;
  tariff_id: string | null;
  energy_kwh: number;
  duration_min: number;
  idle_min: number;
  start_fee: number;
  energy_cost: number;
  idle_cost: number;
  total_cost: number;
  currency: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['charging-invoices'];

export function useChargingInvoices() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charging_invoices' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as ChargingInvoice[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('charging_invoices' as any)
        .update({ status } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Factuurstatus bijgewerkt');
    },
    onError: (err: any) => toast.error('Fout: ' + err.message),
  });

  return { invoices: query.data ?? [], isLoading: query.isLoading, updateStatus };
}
