import { useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

interface PhaseData {
  channel: number;
  voltage: number | null;
  current: number | null;
  power: number | null;
  pf: number | null;
  freq: number | null;
}

const THRESHOLDS = {
  voltage: { min: 207, max: 253, unit: 'V', label: 'Spanning' },
  frequency: { min: 49.8, max: 50.2, unit: 'Hz', label: 'Frequentie' },
  pf: { min: 0.85, max: 1, unit: '', label: 'Power Factor' },
};

type AlertKey = string; // e.g. "voltage_high_ch0"

/**
 * Monitors per-phase grid data and fires toast alerts when values
 * fall outside configured thresholds. Debounces alerts so the same
 * alert is not repeated within the cooldown period.
 */
export function useGridAlerts(phases: PhaseData[], isLive: boolean) {
  const firedRef = useRef<Map<AlertKey, number>>(new Map());
  const COOLDOWN_MS = 60_000; // Don't repeat same alert within 60s

  useEffect(() => {
    if (!isLive || !phases.length) return;

    const now = Date.now();
    const fired = firedRef.current;

    for (const phase of phases) {
      const ch = phase.channel;

      const checks: { key: string; value: number | null; threshold: typeof THRESHOLDS.voltage }[] = [
        { key: `voltage_ch${ch}`, value: phase.voltage, threshold: THRESHOLDS.voltage },
        { key: `freq_ch${ch}`, value: phase.freq, threshold: THRESHOLDS.frequency },
        { key: `pf_ch${ch}`, value: phase.pf, threshold: THRESHOLDS.pf },
      ];

      for (const { key, value, threshold } of checks) {
        if (value == null) continue;

        let alertType: 'low' | 'high' | null = null;
        if (value < threshold.min) alertType = 'low';
        else if (value > threshold.max) alertType = 'high';

        const alertKey = `${key}_${alertType}`;

        if (alertType) {
          const lastFired = fired.get(alertKey) || 0;
          if (now - lastFired > COOLDOWN_MS) {
            fired.set(alertKey, now);
            const direction = alertType === 'low' ? 'te laag' : 'te hoog';
            toast({
              variant: 'destructive',
              title: `⚠️ ${threshold.label} ${direction} — Fase ${ch + 1}`,
              description: `${threshold.label} is ${value}${threshold.unit ? ' ' + threshold.unit : ''} (bereik: ${threshold.min}–${threshold.max}${threshold.unit ? ' ' + threshold.unit : ''})`,
            });
          }
        } else {
          // Value back to normal — clear cooldown for both directions
          fired.delete(`${key}_low`);
          fired.delete(`${key}_high`);
        }
      }
    }
  }, [phases, isLive]);
}
