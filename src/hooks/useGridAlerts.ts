import { useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useGridAlertThresholds } from '@/hooks/useGridAlertThresholds';

interface PhaseData {
  channel: number;
  voltage: number | null;
  current: number | null;
  power: number | null;
  pf: number | null;
  freq: number | null;
}

type AlertKey = string;

const METRIC_MAP: Record<string, { getValue: (p: PhaseData) => number | null }> = {
  voltage: { getValue: (p) => p.voltage },
  frequency: { getValue: (p) => p.freq },
  pf: { getValue: (p) => p.pf },
};

export function useGridAlerts(phases: PhaseData[], isLive: boolean, meterId?: string) {
  const firedRef = useRef<Map<AlertKey, number>>(new Map());
  const COOLDOWN_MS = 60_000;
  const { thresholds } = useGridAlertThresholds();

  useEffect(() => {
    if (!isLive || !phases.length || !thresholds.length) return;

    const now = Date.now();
    const fired = firedRef.current;

    for (const phase of phases) {
      const ch = phase.channel;

      for (const threshold of thresholds) {
        if (!threshold.enabled) continue;
        const mapping = METRIC_MAP[threshold.metric];
        if (!mapping) continue;

        const value = mapping.getValue(phase);
        if (value == null) continue;

        let alertType: 'low' | 'high' | null = null;
        if (value < threshold.min_value) alertType = 'low';
        else if (value > threshold.max_value) alertType = 'high';

        const alertKey = `${threshold.metric}_ch${ch}_${alertType}`;

        if (alertType) {
          const lastFired = fired.get(alertKey) || 0;
          if (now - lastFired > COOLDOWN_MS) {
            fired.set(alertKey, now);
            const direction = alertType === 'low' ? 'te laag' : 'te hoog';

            toast({
              variant: 'destructive',
              title: `⚠️ ${threshold.label} ${direction} — Fase ${ch + 1}`,
              description: `${threshold.label} is ${value}${threshold.unit ? ' ' + threshold.unit : ''} (bereik: ${threshold.min_value}–${threshold.max_value}${threshold.unit ? ' ' + threshold.unit : ''})`,
            });

            // Send external notifications
            supabase.functions.invoke('send-alert-notification', {
              body: {
                metric: threshold.metric,
                label: threshold.label,
                value,
                unit: threshold.unit,
                direction: alertType,
                channel: ch,
                meter_id: meterId,
                threshold_min: threshold.min_value,
                threshold_max: threshold.max_value,
              },
            }).then(({ error: notifError }) => {
              if (notifError) console.error('Failed to send alert notification:', notifError);
            });

            // Persist to database
            if (meterId) {
              supabase.from('grid_alerts').insert({
                meter_id: meterId,
                channel: ch,
                metric: threshold.metric,
                value,
                threshold_min: threshold.min_value,
                threshold_max: threshold.max_value,
                direction: alertType,
                unit: threshold.unit,
              } as any).then(({ error }) => {
                if (error) console.error('Failed to save grid alert:', error);
              });
            }
          }
        } else {
          fired.delete(`${threshold.metric}_ch${ch}_low`);
          fired.delete(`${threshold.metric}_ch${ch}_high`);
        }
      }
    }
  }, [phases, isLive, meterId, thresholds]);
}
