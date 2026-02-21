import { useMemo, useState } from 'react';
import { useMeterReadings, useEnergyMeters } from '@/hooks/useEnergyMeters';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TimeRange = '1h' | '6h' | '24h';
const RANGE_LIMITS: Record<TimeRange, number> = { '1h': 360, '6h': 2160, '24h': 8640 };

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

const axisTickStyle = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };

interface MiniChartProps {
  title: string;
  dataKey: string;
  unit: string;
  color: string;
  data: any[];
  domain?: [number | 'auto', number | 'auto'];
}

const MiniChart = ({ title, dataKey, unit, color, data, domain }: MiniChartProps) => (
  <div>
    <h4 className="text-xs font-medium text-muted-foreground mb-2">{title}</h4>
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="time"
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            width={55}
            tickFormatter={v => `${v}${unit}`}
            domain={domain}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [`${value} ${unit}`, title]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const GridDetailsPanel = () => {
  const { data: meters } = useEnergyMeters();
  const [range, setRange] = useState<TimeRange>('1h');

  const meterId = meters?.find(m => m.enabled)?.id;
  const { data: readings, isLoading } = useMeterReadings(meterId, RANGE_LIMITS[range]);

  const chartData = useMemo(() => {
    if (!readings?.length) return [];

    const grouped = new Map<string, { voltage: number[]; current: number[]; pf: number[]; freq: number[]; ts: number }>();

    for (const r of readings) {
      const ts = new Date(r.timestamp).getTime();
      const key = String(Math.round(ts / 10000) * 10000);
      if (!grouped.has(key)) grouped.set(key, { voltage: [], current: [], pf: [], freq: [], ts: Number(key) });
      const g = grouped.get(key)!;
      if (r.voltage != null) g.voltage.push(r.voltage);
      if (r.current != null) g.current.push(r.current);
      if (r.power_factor != null) g.pf.push(r.power_factor);
      if (r.frequency != null) g.freq.push(r.frequency);
    }

    const avg = (arr: number[], decimals = 2) =>
      arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(decimals) : 0;

    return Array.from(grouped.values())
      .sort((a, b) => a.ts - b.ts)
      .map(g => ({
        time: new Date(g.ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        voltage: avg(g.voltage, 1),
        current: avg(g.current, 1),
        pf: avg(g.pf, 2),
        freq: avg(g.freq, 1),
      }));
  }, [readings]);

  if (!meters?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Grid Details</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Historische spanning, stroom, power factor en frequentie</p>
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
        <div className="h-44 flex items-center justify-center">
          <p className="text-sm text-muted-foreground animate-pulse">Laden...</p>
        </div>
      ) : !chartData.length ? (
        <div className="h-44 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Nog geen meetdata beschikbaar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MiniChart title="Spanning" dataKey="voltage" unit=" V" color="hsl(var(--chart-2, 160 60% 45%))" data={chartData} domain={[210, 250]} />
          <MiniChart title="Stroom" dataKey="current" unit=" A" color="hsl(var(--chart-3, 30 80% 55%))" data={chartData} />
          <MiniChart title="Power Factor" dataKey="pf" unit="" color="hsl(var(--primary))" data={chartData} domain={[0.8, 1]} />
          <MiniChart title="Frequentie" dataKey="freq" unit=" Hz" color="hsl(var(--chart-4, 280 65% 60%))" data={chartData} domain={[49.5, 50.5]} />
        </div>
      )}
    </div>
  );
};

export default GridDetailsPanel;
