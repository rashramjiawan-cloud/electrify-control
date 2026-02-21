import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SchedulePeriod {
  startPeriod: number;
  limit: number;
  numberPhases?: number;
}

export interface ChargingProfile {
  id: number;
  charge_point_id: string;
  connector_id: number;
  stack_level: number;
  charging_profile_purpose: string;
  charging_profile_kind: string;
  recurrency_kind: string | null;
  valid_from: string | null;
  valid_to: string | null;
  charging_schedule_unit: string;
  duration: number | null;
  start_schedule: string | null;
  min_charging_rate: number | null;
  schedule_periods: SchedulePeriod[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useChargingProfiles(chargePointId?: string) {
  return useQuery({
    queryKey: ['charging-profiles', chargePointId],
    queryFn: async () => {
      let q = supabase
        .from('charging_profiles')
        .select('*')
        .eq('active', true)
        .order('stack_level', { ascending: false });
      if (chargePointId) q = q.eq('charge_point_id', chargePointId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown) as ChargingProfile[];
    },
    refetchInterval: 30_000,
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

export function useSetChargingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      chargePointId: string;
      connectorId: number;
      profile: {
        stackLevel: number;
        chargingProfilePurpose: string;
        chargingProfileKind: string;
        recurrencyKind?: string;
        validFrom?: string;
        validTo?: string;
        chargingSchedule: {
          chargingRateUnit: string;
          duration?: number;
          startSchedule?: string;
          minChargingRate?: number;
          chargingSchedulePeriod: SchedulePeriod[];
        };
      };
    }) => {
      const result = await sendOcpp(params.chargePointId, 'SetChargingProfile', {
        connectorId: params.connectorId,
        csChargingProfiles: params.profile,
      });
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charging-profiles'] }),
  });
}

export function useClearChargingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      chargePointId: string;
      id?: number;
      connectorId?: number;
      chargingProfilePurpose?: string;
      stackLevel?: number;
    }) => {
      const { chargePointId, ...payload } = params;
      return sendOcpp(chargePointId, 'ClearChargingProfile', payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charging-profiles'] }),
  });
}
