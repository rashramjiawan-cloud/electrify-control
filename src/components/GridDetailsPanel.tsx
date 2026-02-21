import { useMemo, useState } from 'react';
import { useMeterReadings, useEnergyMeters } from '@/hooks/useEnergyMeters';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TimeRange = '1h' | '6h' | '24h';
const RANGE_LIMITS: Record<TimeRange, number> = { '1h': 720, '6h': 4320, '24h': 17280 };

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

const axisTickStyle = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };

const PHASE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 160 60% 45%))',
];

interface MiniChartProps {
  title: string;
  baseKey: string;
  unit: string;
  data: any[];
  channels: number[];
  domain?: [number | 'auto', number | 'auto'];
}

const MiniChart = ({ title, baseKey, unit, data, channels, domain }: MiniChartProps) => (
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
            formatter={(value: number, name: string) => [`${value}${unit}`, name]}
          />
          {channels.length > 1 && (
            <Legend
              iconSize={8}
              wrapperStyle={{ fontSize: 10 }}
            />
          )}
          {channels.map((ch, i) => (
            <Line
              key={ch}
              type="monotone"
              dataKey={channels.length > 1 ? `${baseKey}_ch${ch}` : baseKey}
              name={channels.length > 1 ? `Fase ${ch + 1}` : title}
              stroke={PHASE_COLORS[i % PHASE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
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

  const { chartData, channels } = useMemo(() => {
    if (!readings?.length) return { chartData: [], channels: [] as number[] };

    // Discover unique channels
    const channelSet = new Set<number>();
    for (const r of readings) channelSet.add(r.channel ?? 0);
    const channels = Array.from(channelSet).sort();
    const multiPhase = channels.length > 1;

    type Bucket = {
      ts: number;
      [key: string]: number[] | number;
    };

    const grouped = new Map<string, Bucket>();

    for (const r of readings) {
      const ts = new Date(r.timestamp).getTime();
      const key = String(Math.round(ts / 10000) * 10000);
      if (!grouped.has(key)) {
        grouped.set(key, { ts: Number(key) } as Bucket);
      }
      const g = grouped.get(key)!;
      const ch = r.channel ?? 0;
      const suffix = multiPhase ? `_ch${ch}` : '';

      const push = (field: string, val: number | null) => {
        if (val == null) return;
        const k = `${field}${suffix}`;
        if (!Array.isArray(g[k])) g[k] = [];
        (g[k] as number[]).push(val);
      };

      push('voltage', r.voltage);
      push('current', r.current);
      push('pf', r.power_factor);
      push('freq', r.frequency);
      push('power', r.active_power);
    }

    const avg = (arr: number[], decimals = 2) =>
      arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(decimals) : 0;

    const chartData = Array.from(grouped.values())
      .sort((a, b) => (a.ts as number) - (b.ts as number))
      .map(g => {
        const row: any = {
          time: new Date(g.ts as number).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        for (const ch of channels) {
          const suffix = multiPhase ? `_ch${ch}` : '';
          row[`voltage${suffix}`] = avg(g[`voltage${suffix}`] as number[] || [], 1);
          row[`current${suffix}`] = avg(g[`current${suffix}`] as number[] || [], 1);
          row[`pf${suffix}`] = avg(g[`pf${suffix}`] as number[] || [], 2);
          row[`freq${suffix}`] = avg(g[`freq${suffix}`] as number[] || [], 1);
          row[`power${suffix}`] = avg(g[`power${suffix}`] as number[] || [], 0);
        }
        return row;
      });

    return { chartData, channels };
  }, [readings]);

  if (!meters?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Grid Details</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Historische spanning, stroom, power factor en frequentie
            {channels.length > 1 && ` · ${channels.length} fasen`}
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
        <div className="h-44 flex items-center justify-center">
          <p className="text-sm text-muted-foreground animate-pulse">Laden...</p>
        </div>
      ) : !chartData.length ? (
        <div className="h-44 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Nog geen meetdata beschikbaar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MiniChart title="Spanning" baseKey="voltage" unit=" V" data={chartData} channels={channels} domain={[210, 250]} />
          <MiniChart title="Stroom" baseKey="current" unit=" A" data={chartData} channels={channels} />
          <MiniChart title="Power Factor" baseKey="pf" unit="" data={chartData} channels={channels} domain={[0.8, 1]} />
          <MiniChart title="Frequentie" baseKey="freq" unit=" Hz" data={chartData} channels={channels} domain={[49.5, 50.5]} />
          <MiniChart title="Vermogen" baseKey="power" unit=" W" data={chartData} channels={channels} />
        </div>
      )}
    </div>
  );
};

export default GridDetailsPanel;
