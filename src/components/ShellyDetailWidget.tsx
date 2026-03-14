import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import MeterSparkline from './MeterSparkline';
import type { MeterReading } from '@/hooks/useEnergyMeters';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from 'recharts';
import { Plug, ChevronDown, ChevronUp } from 'lucide-react';

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

  // Hourly consumption chart data (24h)
  const hourlyData = useMemo(() => {
    if (!historyReadings?.length) return [];
    // Group readings by hour, sum active_power across all channels per timestamp, then average per hour
    const byTimestamp = new Map<string, number>();
    for (const r of historyReadings) {
      const ts = r.timestamp;
      byTimestamp.set(ts, (byTimestamp.get(ts) ?? 0) + (r.active_power ?? 0));
    }

    const byHour = new Map<string, { sum: number; count: number }>();
    for (const [ts, totalPower] of byTimestamp) {
      const d = new Date(ts);
      const hourKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      const entry = byHour.get(hourKey) ?? { sum: 0, count: 0 };
      entry.sum += totalPower;
      entry.count++;
      byHour.set(hourKey, entry);
    }

    // Convert to kWh estimate: avg power (W) * 1h / 1000
    const now = new Date();
    const result: { hour: string; kwh: number; isExport: boolean }[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(d.getHours() - i, 0, 0, 0);
      const hourKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      const entry = byHour.get(hourKey);
      const avgPower = entry ? entry.sum / entry.count : 0;
      const kwh = +(avgPower / 1000).toFixed(2);
      result.push({
        hour: `${d.getHours().toString().padStart(2, '0')}:00`,
        kwh,
        isExport: kwh < 0,
      });
    }
    return result;
  }, [historyReadings]);

  const total24hKwh = useMemo(() => {
    return hourlyData.reduce((s, h) => s + h.kwh, 0);
  }, [hourlyData]);

  const importKwh = useMemo(() => {
    return hourlyData.filter(h => h.kwh > 0).reduce((s, h) => s + h.kwh, 0);
  }, [hourlyData]);

  const exportKwh = useMemo(() => {
    return Math.abs(hourlyData.filter(h => h.kwh < 0).reduce((s, h) => s + h.kwh, 0));
  }, [hourlyData]);

  const selfSufficiency = useMemo(() => {
    if (importKwh <= 0 && exportKwh <= 0) return 0;
    // Self-sufficiency = export / (import + export) * 100
    const total = importKwh + exportKwh;
    if (total <= 0) return 0;
    return Math.min(100, Math.round((exportKwh / total) * 100));
  }, [importKwh, exportKwh]);

  const [expanded, setExpanded] = useState(false);

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
      {/* Header - clickable to toggle */}
      <div
        className="border-b border-border px-5 py-4 flex items-center justify-between cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {meterName || 'Shelly Pro 3EM'}
          </span>
          {hasData && totals && (
            <span className="text-xs font-mono text-muted-foreground ml-2">
              {fmtPower(totals.activePower).value} {fmtPower(totals.activePower).unit} · {fmt(totals.current)} A · {totals.avgVoltage} V
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-[10px] text-muted-foreground">Live</span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
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

            {/* Totals row */}
            {totals && (
              <div>
                <span className="text-[11px] text-muted-foreground font-medium mb-2 block">Totaal (alle fasen)</span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {[
                    { ...fmtPower(totals.activePower), label: 'Actief' },
                    { ...fmtApparent(totals.apparentPower), label: 'Schijnbaar' },
                    { value: fmt(totals.current), unit: 'A', label: 'Stroom' },
                    { value: String(totals.avgVoltage), unit: 'V', label: 'Gem. spanning' },
                    { value: String(totals.avgPf), unit: 'PF', label: 'Gem. PF' },
                    { value: String(totals.avgFreq), unit: 'Hz', label: 'Frequentie' },
                  ].map(({ value, unit, label }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center justify-center rounded-lg border border-primary/30 bg-primary/5 px-3 py-3"
                    >
                      <span className="font-mono text-lg font-bold text-foreground">{value}</span>
                      <span className="text-[10px] text-muted-foreground">{unit}</span>
                      <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

            {/* 24h Consumption Chart */}
            {hourlyData.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Plug className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Verbruik</h3>
                    <span className="text-[11px] text-muted-foreground">Laatste 24 uur</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="flex flex-col items-center justify-center rounded-lg border border-chart-3/30 bg-chart-3/5 px-3 py-3">
                    <span className="font-mono text-lg font-bold text-foreground">{importKwh.toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground">kWh</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">Import</span>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
                    <span className="font-mono text-lg font-bold text-foreground">{exportKwh.toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground">kWh</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">Export</span>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/50 px-3 py-3">
                    <span className="font-mono text-lg font-bold text-foreground">{total24hKwh.toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground">kWh</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">Netto</span>
                  </div>
                </div>
                <div className="h-[180px] mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 10 }}
                        className="fill-muted-foreground"
                        tickLine={false}
                        interval={2}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        className="fill-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}`}
                        label={{ value: 'kWh', angle: -90, position: 'insideLeft', offset: 20, style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`${value.toFixed(2)} kWh`, value < 0 ? 'Teruglevering' : 'Verbruik']}
                        labelFormatter={(label) => `${label}`}
                      />
                      <ReferenceLine y={0} className="stroke-muted-foreground/30" />
                      <Bar dataKey="kwh" radius={[3, 3, 0, 0]} maxBarSize={20}>
                        {hourlyData.map((entry, index) => (
                          <Cell
                            key={index}
                            className={entry.isExport ? 'fill-primary' : 'fill-chart-3'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-2 justify-center">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm bg-chart-3" />
                    <span className="text-[10px] text-muted-foreground">Verbruik</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
                    <span className="text-[10px] text-muted-foreground">Teruglevering</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
