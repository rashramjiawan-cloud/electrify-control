import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import MeterSparkline from './MeterSparkline';
import type { MeterReading } from '@/hooks/useEnergyMeters';

interface ShellyDetailWidgetProps {
  meterId: string;
  meterName?: string;
}

const PHASE_COLORS = [
  { label: 'text-primary', border: 'border-primary/30', bg: 'bg-primary/5' },
  { label: 'text-chart-2', border: 'border-chart-2/30', bg: 'bg-chart-2/5' },
  { label: 'text-chart-3', border: 'border-chart-3/30', bg: 'bg-chart-3/5' },
];

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return '—';
  return Number(v).toFixed(decimals);
}

function fmtPower(watts: number | null): { value: string; unit: string } {
  if (watts == null) return { value: '—', unit: 'W' };
  const abs = Math.abs(watts);
  if (abs >= 1000) return { value: (watts / 1000).toFixed(2), unit: 'kW' };
  return { value: watts.toFixed(1), unit: 'W' };
}

function fmtApparent(va: number | null): { value: string; unit: string } {
  if (va == null) return { value: '—', unit: 'VA' };
  const abs = Math.abs(va);
  if (abs >= 1000) return { value: (va / 1000).toFixed(2), unit: 'kVA' };
  return { value: va.toFixed(1), unit: 'VA' };
}

function fmtTs(ts: string): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')} ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function ShellyDetailWidget({ meterId, meterName }: ShellyDetailWidgetProps) {
  // Latest readings per channel
  const { data: latestReadings, isLoading: latestLoading } = useQuery({
    queryKey: ['shelly-detail-latest', meterId],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_readings')
        .select('*')
        .eq('meter_id', meterId)
        .order('timestamp', { ascending: false })
        .limit(6); // 3 channels x latest
      if (error) throw error;
      return data as MeterReading[];
    },
  });

  // Peak data: last 24h readings for min/max/avg
  const { data: historyReadings } = useQuery({
    queryKey: ['shelly-detail-peaks', meterId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { data, error } = await supabase
        .from('meter_readings')
        .select('channel, active_power, timestamp')
        .eq('meter_id', meterId)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Current phase data
  const phases = useMemo(() => {
    if (!latestReadings?.length) return [];
    const byChannel = new Map<number, MeterReading>();
    for (const r of latestReadings) {
      if (!byChannel.has(r.channel)) byChannel.set(r.channel, r);
    }
    return Array.from(byChannel.entries())
      .sort(([a], [b]) => a - b)
      .map(([ch, r]) => ({ channel: ch, reading: r }));
  }, [latestReadings]);

  // Totals across all phases
  const totals = useMemo(() => {
    if (!phases.length) return null;
    const sum = (fn: (r: MeterReading) => number | null) =>
      phases.reduce((s, p) => s + (fn(p.reading) ?? 0), 0);
    return {
      activePower: sum(r => r.active_power),
      apparentPower: sum(r => r.apparent_power),
      current: sum(r => r.current),
      avgVoltage: +(sum(r => r.voltage) / phases.length).toFixed(1),
      avgPf: +(sum(r => r.power_factor) / phases.length).toFixed(2),
      avgFreq: +(sum(r => r.frequency) / phases.length).toFixed(1),
    };
  }, [phases]);

  // Peak / average per channel
  const peaks = useMemo(() => {
    if (!historyReadings?.length) return new Map<number, { peakValue: number; peakTs: string; avgValue: number; avgTs: string }>();
    const grouped = new Map<number, { values: { power: number; ts: string }[] }>();
    for (const r of historyReadings) {
      const ch = r.channel ?? 0;
      if (!grouped.has(ch)) grouped.set(ch, { values: [] });
      if (r.active_power != null) grouped.get(ch)!.values.push({ power: r.active_power, ts: r.timestamp });
    }
    const result = new Map<number, { peakValue: number; peakTs: string; avgValue: number; avgTs: string }>();
    for (const [ch, { values }] of grouped) {
      if (!values.length) continue;
      // Peak = highest absolute value
      let peakIdx = 0;
      let peakAbs = 0;
      for (let i = 0; i < values.length; i++) {
        const abs = Math.abs(values[i].power);
        if (abs > peakAbs) { peakAbs = abs; peakIdx = i; }
      }
      const avg = values.reduce((s, v) => s + v.power, 0) / values.length;
      const lastTs = values[values.length - 1].ts;
      result.set(ch, {
        peakValue: values[peakIdx].power,
        peakTs: values[peakIdx].ts,
        avgValue: avg,
        avgTs: lastTs,
      });
    }
    return result;
  }, [historyReadings]);

  if (latestLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-48 mb-6" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  const hasData = phases.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {meterName || 'Shelly Pro 3EM'}
          </span>
        </div>
        {hasData && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-[10px] text-muted-foreground">Live</span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-6">
        {!hasData ? (
          <p className="text-sm text-muted-foreground text-center py-8">Geen data beschikbaar</p>
        ) : (
          <>
            {/* Phase headers */}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-0 items-center mb-1">
              <span />
              {phases.map((p, i) => (
                <span key={p.channel} className={`text-xs font-semibold text-center ${PHASE_COLORS[i]?.label || 'text-foreground'}`}>
                  Fase {p.channel + 1}
                </span>
              ))}
            </div>

            {/* Metric rows */}
            {[
              {
                label: 'Schijnbaar vermogen',
                render: (r: MeterReading) => fmtApparent(r.apparent_power),
              },
              {
                label: 'Stroom',
                render: (r: MeterReading) => ({ value: fmt(r.current), unit: 'A' }),
              },
              {
                label: 'Spanning',
                render: (r: MeterReading) => ({ value: fmt(r.voltage), unit: 'V' }),
              },
              {
                label: 'Power Factor',
                render: (r: MeterReading) => ({ value: fmt(r.power_factor, 2), unit: 'PF' }),
              },
              {
                label: 'Actief vermogen',
                render: (r: MeterReading) => fmtPower(r.active_power),
              },
              {
                label: 'Frequentie',
                render: (r: MeterReading) => ({ value: fmt(r.frequency), unit: 'Hz' }),
              },
            ].map(({ label, render }) => (
              <div key={label}>
                <span className="text-[11px] text-muted-foreground font-medium mb-2 block">{label}</span>
                <div className="grid grid-cols-3 gap-3">
                  {phases.map((p, i) => {
                    const { value, unit } = render(p.reading);
                    return (
                      <div
                        key={p.channel}
                        className={`flex flex-col items-center justify-center rounded-lg border ${PHASE_COLORS[i]?.border || 'border-border'} ${PHASE_COLORS[i]?.bg || 'bg-muted/50'} px-3 py-3`}
                      >
                        <span className="font-mono text-lg font-bold text-foreground">{value}</span>
                        <span className="text-[10px] text-muted-foreground">{unit}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Peak Energy (24h) */}
            {peaks.size > 0 && (
              <div>
                <span className="text-[11px] text-muted-foreground font-medium mb-2 block">Hoogste piekvermogen (24u)</span>
                <div className="grid grid-cols-3 gap-3">
                  {phases.map((p, i) => {
                    const peak = peaks.get(p.channel);
                    if (!peak) return <div key={p.channel} className="rounded-lg border border-border bg-muted/50 px-3 py-3 text-center text-xs text-muted-foreground">—</div>;
                    const { value, unit } = fmtPower(peak.peakValue);
                    return (
                      <div
                        key={p.channel}
                        className={`flex flex-col items-center justify-center rounded-lg border ${PHASE_COLORS[i]?.border || 'border-border'} ${PHASE_COLORS[i]?.bg || 'bg-muted/50'} px-3 py-3`}
                      >
                        <span className="font-mono text-lg font-bold text-foreground">{value} {unit}</span>
                        <span className="text-[10px] text-muted-foreground">{fmtTs(peak.peakTs)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Average */}
            {peaks.size > 0 && (
              <div>
                <span className="text-[11px] text-muted-foreground font-medium mb-2 block">Gemiddeld vermogen (24u)</span>
                <div className="grid grid-cols-3 gap-3">
                  {phases.map((p, i) => {
                    const peak = peaks.get(p.channel);
                    if (!peak) return <div key={p.channel} className="rounded-lg border border-border bg-muted/50 px-3 py-3 text-center text-xs text-muted-foreground">—</div>;
                    const { value, unit } = fmtPower(peak.avgValue);
                    return (
                      <div
                        key={p.channel}
                        className={`flex flex-col items-center justify-center rounded-lg border ${PHASE_COLORS[i]?.border || 'border-border'} ${PHASE_COLORS[i]?.bg || 'bg-muted/50'} px-3 py-3`}
                      >
                        <span className="font-mono text-lg font-bold text-foreground">{value} {unit}</span>
                        <span className="text-[10px] text-muted-foreground">{fmtTs(peak.avgTs)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sparklines per phase */}
            <div>
              <span className="text-[11px] text-muted-foreground font-medium mb-2 block">Vermogensverloop (5 min)</span>
              <div className="grid grid-cols-3 gap-3">
                {phases.map((p, i) => (
                  <div
                    key={p.channel}
                    className={`flex flex-col items-center rounded-lg border ${PHASE_COLORS[i]?.border || 'border-border'} ${PHASE_COLORS[i]?.bg || 'bg-muted/50'} px-3 py-3`}
                  >
                    <span className={`text-[10px] font-semibold mb-1 ${PHASE_COLORS[i]?.label || 'text-foreground'}`}>Fase {p.channel + 1}</span>
                    <MeterSparkline meterId={meterId} minutes={5} width={140} height={40} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
