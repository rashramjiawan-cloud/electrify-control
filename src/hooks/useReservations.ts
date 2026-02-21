import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Reservation {
  id: number;
  charge_point_id: string;
  connector_id: number;
  id_tag: string;
  expiry_date: string;
  status: string;
  parent_id_tag: string | null;
  created_at: string;
  updated_at: string;
}

export function useReservations(chargePointId?: string) {
  return useQuery({
    queryKey: ['reservations', chargePointId],
    queryFn: async () => {
      let q = supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (chargePointId) q = q.eq('charge_point_id', chargePointId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown) as Reservation[];
    },
    refetchInterval: 15_000,
  });
}

const OCPP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-handler`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function sendOcpp(chargePointId: string, action: string, payload: Record<string, unknown>) {
  const res = await fetch(OCPP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      chargePointId,
      messageTypeId: 2,
      uniqueId: crypto.randomUUID().slice(0, 8),
      action,
      payload,
    }),
  });
  return res.json();
}

export function useReserveNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      chargePointId: string;
      connectorId: number;
      idTag: string;
      expiryDate: string;
      parentIdTag?: string;
    }) => {
      return sendOcpp(params.chargePointId, 'ReserveNow', {
        connectorId: params.connectorId,
        idTag: params.idTag,
        expiryDate: params.expiryDate,
        parentIdTag: params.parentIdTag,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
  });
}

export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      chargePointId: string;
      reservationId: number;
    }) => {
      return sendOcpp(params.chargePointId, 'CancelReservation', {
        reservationId: params.reservationId,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
  });
}
