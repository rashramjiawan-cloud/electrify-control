import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FirmwareUpdate {
  id: number;
  charge_point_id: string;
  type: string;
  location: string;
  status: string;
  retrieve_date: string | null;
  retries: number;
  retry_interval: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function useFirmwareUpdates(chargePointId?: string) {
  return useQuery({
    queryKey: ['firmware-updates', chargePointId],
    queryFn: async () => {
      let q = supabase
        .from('firmware_updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (chargePointId) q = q.eq('charge_point_id', chargePointId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown) as FirmwareUpdate[];
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

export function useUpdateFirmware() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      chargePointId: string;
      location: string;
      retrieveDate?: string;
      retries?: number;
      retryInterval?: number;
    }) => {
      return sendOcpp(params.chargePointId, 'UpdateFirmware', {
        location: params.location,
        retrieveDate: params.retrieveDate || new Date().toISOString(),
        retries: params.retries || 3,
        retryInterval: params.retryInterval || 60,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firmware-updates'] }),
  });
}

export function useGetDiagnostics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      chargePointId: string;
      location: string;
      startTime?: string;
      stopTime?: string;
      retries?: number;
      retryInterval?: number;
    }) => {
      return sendOcpp(params.chargePointId, 'GetDiagnostics', {
        location: params.location,
        startTime: params.startTime,
        stopTime: params.stopTime,
        retries: params.retries || 3,
        retryInterval: params.retryInterval || 60,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firmware-updates'] }),
  });
}
