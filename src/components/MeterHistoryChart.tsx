import { useMemo, useState } from 'react';
import { useMeterReadings, useEnergyMeters } from '@/hooks/useEnergyMeters';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { downloadReadingsAsCsv } from '@/lib/csvExport';

type TimeRange = '1h' | '6h' | '24h';
const RANGE_LIMITS: Record<TimeRange, number> = { '1h': 360, '6h': 2160, '24h': 8640 };

const MeterHistoryChart = () => {
  const { data: meters } = useEnergyMeters();
  const [selectedMeterId, setSelectedMeterId] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<TimeRange>('1h');
  const [channel, setChannel] = useState<string>('all');

  const meterId = selectedMeterId || meters?.find(m => m.enabled)?.id;
  const { data: readings, isLoading } = useMeterReadings(meterId, RANGE_LIMITS[range]);

  const chartData = useMemo(() => {
    if (!readings?.length) return [];

    const filtered = channel === 'all'
      ? readings
      : readings.filter(r => r.channel === Number(channel));

    // Group by timestamp (rounded to nearest 10s) and average per timestamp
    const grouped = new Map<string, { voltage: number[]; current: number[]; power: number[]; ts: number }>();

    for (const r of filtered) {
      const ts = new Date(r.timestamp).getTime();
      const key = String(Math.round(ts / 10000) * 10000);
      if (!grouped.has(key)) grouped.set(key, { voltage: [], current: [], power: [], ts: Number(key) });
      const g = grouped.get(key)!;
      if (r.voltage != null) g.voltage.push(r.voltage);
      if (r.current != null) g.current.push(r.current);
      if (r.active_power != null) g.power.push(r.active_power);
    }

    const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;

    return Array.from(grouped.values())
      .sort((a, b) => a.ts - b.ts)
      .map(g => ({
        time: new Date(g.ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        ts: g.ts,
        voltage: avg(g.voltage),
        current: avg(g.current),
        power: avg(g.power),
      }));
  }, [readings, channel]);

  if (!meters?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Geen energiemeters geconfigureerd</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Meterdata Historie</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Spanning, stroom en vermogen over tijd</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Meter selector */}
          {meters.length > 1 && (
            <Select value={meterId} onValueChange={setSelectedMeterId}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Kies meter" />
              </SelectTrigger>
              <SelectContent>
                {meters.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Channel selector */}
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alle kanalen</SelectItem>
              <SelectItem value="0" className="text-xs">Kanaal 1</SelectItem>
              <SelectItem value="1" className="text-xs">Kanaal 2</SelectItem>
              <SelectItem value="2" className="text-xs">Kanaal 3</SelectItem>
            </SelectContent>
          </Select>

          {/* Time range */}
          <Tabs value={range} onValueChange={(v) => setRange(v as TimeRange)}>
            <TabsList className="h-8">
              <TabsTrigger value="1h" className="text-xs px-3 h-6">1u</TabsTrigger>
              <TabsTrigger value="6h" className="text-xs px-3 h-6">6u</TabsTrigger>
              <TabsTrigger value="24h" className="text-xs px-3 h-6">24u</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* CSV Export */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={!readings?.length}
            onClick={() => {
              if (!readings?.length) return;
              const meterName = meters?.find(m => m.id === meterId)?.name || 'meter';
              const safeName = meterName.replace(/[^a-zA-Z0-9]/g, '_');
              downloadReadingsAsCsv(readings, `${safeName}_${range}.csv`);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-72 flex items-center justify-center">
          <p className="text-sm text-muted-foreground animate-pulse">Laden...</p>
        </div>
      ) : !chartData.length ? (
        <div className="h-72 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Nog geen meetdata beschikbaar</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Power chart */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Vermogen (W)</h4>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}`}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${value} W`, 'Vermogen']}
                  />
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Voltage & Current chart */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Spanning (V) & Stroom (A)</h4>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis
                    yAxisId="voltage"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tickFormatter={v => `${v}V`}
                  />
                  <YAxis
                    yAxisId="current"
                    orientation="right"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tickFormatter={v => `${v}A`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => value === 'voltage' ? 'Spanning (V)' : 'Stroom (A)'}
                  />
                  <Line
                    yAxisId="voltage"
                    type="monotone"
                    dataKey="voltage"
                    stroke="hsl(var(--chart-2, 160 60% 45%))"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="current"
                    type="monotone"
                    dataKey="current"
                    stroke="hsl(var(--chart-3, 30 80% 55%))"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeterHistoryChart;
