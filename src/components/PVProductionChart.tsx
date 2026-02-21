import { useMemo, useState } from 'react';
import { usePVReadings } from '@/hooks/usePVMeters';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TimeRange = '1h' | '6h' | '24h';
const RANGE_LIMITS: Record<TimeRange, number> = { '1h': 360, '6h': 2160, '24h': 8640 };

interface Props {
  meterId: string | undefined;
  meterName?: string;
}

const PVProductionChart = ({ meterId, meterName }: Props) => {
  const [range, setRange] = useState<TimeRange>('6h');
  const { data: readings, isLoading } = usePVReadings(meterId);

  const chartData = useMemo(() => {
    if (!readings?.length) return [];

    // Group by timestamp (rounded to 30s) and sum power across channels
    const grouped = new Map<number, { power: number; count: number }>();

    for (const r of readings) {
      const ts = new Date(r.timestamp).getTime();
      const key = Math.round(ts / 30000) * 30000;
      const existing = grouped.get(key);
      const power = r.active_power != null ? Math.abs(r.active_power) / 1000 : 0; // W → kW, absolute
      if (!existing) {
        grouped.set(key, { power, count: 1 });
      } else {
        existing.power += power;
        existing.count++;
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, g]) => ({
        time: new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        ts,
        power: +g.power.toFixed(2),
      }));
  }, [readings]);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">PV-productie verloop</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Vermogen over tijd{meterName ? ` — ${meterName}` : ''}
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as TimeRange)}>
          <TabsList className="h-8">
            <TabsTrigger value="1h" className="text-xs px-3 h-6">1u</TabsTrigger>
            <TabsTrigger value="6h" className="text-xs px-3 h-6">6u</TabsTrigger>
            <TabsTrigger value="24h" className="text-xs px-3 h-6">24u</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground animate-pulse">Laden...</p>
        </div>
      ) : !chartData.length ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Nog geen historische meetdata beschikbaar. Data verschijnt zodra de meter readings opslaat.
          </p>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="pvGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={v => `${v} kW`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value} kW`, 'PV Vermogen']}
              />
              <Area
                type="monotone"
                dataKey="power"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#pvGradient)"
                dot={false}
                activeDot={{ r: 3, fill: 'hsl(var(--primary))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default PVProductionChart;
