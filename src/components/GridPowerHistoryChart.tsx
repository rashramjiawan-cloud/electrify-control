import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { VirtualGrid, useVirtualGridMembers } from '@/hooks/useVirtualGrids';
import { supabase } from '@/integrations/supabase/client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { format, subHours, eachHourOfInterval, startOfHour } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { downloadAsCsv } from '@/lib/csvExport';

type Range = '6h' | '12h' | '24h';

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-5))',
];

interface Props {
  grid: VirtualGrid;
}

interface MemberInfo {
  id: string;
  member_id: string;
  member_name: string | null;
  member_type: string;
  max_power_kw: number;
  enabled: boolean;
}

/**
 * Fetches meter_readings for energy_meter/solar members and meter_values for charge_point members.
 * Returns data keyed by member grid-member id, bucketed per hour.
 */
function useGridPowerHistory(members: MemberInfo[], hours: number) {
  const meterMembers = members.filter(m => m.member_type === 'energy_meter' || m.member_type === 'solar');
  const cpMembers = members.filter(m => m.member_type === 'charge_point');

  const since = subHours(new Date(), hours).toISOString();

  // meter_readings for energy_meter / solar members (member_id is the meter UUID)
  const meterIds = meterMembers.map(m => m.member_id);
  const meterQuery = useQuery({
    queryKey: ['grid-history-meters', meterIds.join(','), hours],
    enabled: meterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_readings')
        .select('meter_id, active_power, timestamp')
        .in('meter_id', meterIds)
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  // meter_values for charge_point members (member_id is the charge_point_id)
  const cpIds = cpMembers.map(m => m.member_id);
  const cpQuery = useQuery({
    queryKey: ['grid-history-cp', cpIds.join(','), hours],
    enabled: cpIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_values')
        .select('charge_point_id, value, unit, measurand, timestamp')
        .in('charge_point_id', cpIds)
        .eq('measurand', 'Power.Active.Import')
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  return {
    meterReadings: meterQuery.data ?? [],
    cpValues: cpQuery.data ?? [],
    isLoading: meterQuery.isLoading || cpQuery.isLoading,
    meterMembers,
    cpMembers,
  };
}

/**
 * Buckets raw readings into hourly averages per member, keyed by grid-member id.
 */
function buildChartData(
  members: MemberInfo[],
  meterReadings: { meter_id: string; active_power: number | null; timestamp: string }[],
  cpValues: { charge_point_id: string; value: number; unit: string; timestamp: string }[],
  hours: number
) {
  const now = new Date();
  const start = startOfHour(subHours(now, hours));
  const hourSlots = eachHourOfInterval({ start, end: startOfHour(now) });

  // Map member_id → grid-member id for lookups
  const memberIdToGridId = new Map<string, string>();
  members.forEach(m => memberIdToGridId.set(`${m.member_type}:${m.member_id}`, m.id));

  // Bucket: hourKey → memberId → { sum, count }
  type Bucket = Map<string, Map<string, { sum: number; count: number }>>;
  const buckets: Bucket = new Map();
  hourSlots.forEach(slot => {
    buckets.set(slot.toISOString(), new Map());
  });

  const bucketReading = (timestamp: string, gridMemberId: string, powerKw: number) => {
    const hour = startOfHour(new Date(timestamp)).toISOString();
    const bucket = buckets.get(hour);
    if (!bucket) return;
    const existing = bucket.get(gridMemberId) || { sum: 0, count: 0 };
    existing.sum += powerKw;
    existing.count += 1;
    bucket.set(gridMemberId, existing);
  };

  // Process meter_readings (active_power is in Watts)
  meterReadings.forEach(r => {
    if (r.active_power == null) return;
    // Find matching member(s) - could be energy_meter or solar
    for (const type of ['energy_meter', 'solar']) {
      const gridId = memberIdToGridId.get(`${type}:${r.meter_id}`);
      if (gridId) {
        bucketReading(r.timestamp, gridId, Math.abs(r.active_power) / 1000); // W → kW
      }
    }
  });

  // Process meter_values (value unit could be W or kW)
  cpValues.forEach(v => {
    const gridId = memberIdToGridId.get(`charge_point:${v.charge_point_id}`);
    if (!gridId) return;
    const powerKw = v.unit === 'W' ? v.value / 1000 : v.value;
    bucketReading(v.timestamp, gridId, powerKw);
  });

  // Build chart rows
  const hasAnyData = meterReadings.length > 0 || cpValues.length > 0;

  return hourSlots.map(slot => {
    const hourKey = slot.toISOString();
    const bucket = buckets.get(hourKey)!;

    const row: Record<string, string | number> = {
      time: hourKey,
      label: format(slot, 'HH:mm', { locale: nl }),
    };

    members.forEach(m => {
      const entry = bucket.get(m.id);
      if (entry && entry.count > 0) {
        row[m.id] = Math.round((entry.sum / entry.count) * 100) / 100;
      } else if (!hasAnyData && m.member_type === 'battery') {
        // Fallback simulation for battery (no meter data source)
        const hour = slot.getHours();
        const battFactor = hour >= 17 && hour <= 21 ? 0.9 : 0.2;
        row[m.id] = Math.round((m.max_power_kw * battFactor * (0.5 + Math.random() * 0.5)) * 100) / 100;
      } else {
        row[m.id] = 0;
      }
    });

    const total = members.reduce((s, m) => s + (Number(row[m.id]) || 0), 0);
    row['__total'] = Math.round(total * 100) / 100;

    return row;
  });
}

const GridPowerHistoryChart = ({ grid }: Props) => {
  const { data: members = [] } = useVirtualGridMembers(grid.id);
  const [range, setRange] = useState<Range>('24h');
  const hours = range === '6h' ? 6 : range === '12h' ? 12 : 24;

  const { meterReadings, cpValues, isLoading } = useGridPowerHistory(members as MemberInfo[], hours);

  const chartData = useMemo(
    () => buildChartData(members as MemberInfo[], meterReadings, cpValues, hours),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members.map(m => m.id).join(','), meterReadings.length, cpValues.length, hours]
  );

  const peakTotal = useMemo(
    () => Math.max(...chartData.map(d => Number(d['__total']) || 0), 0),
    [chartData]
  );

  const hasRealData = meterReadings.length > 0 || cpValues.length > 0;

  if (members.length === 0) return null;

  const ranges: Range[] = ['6h', '12h', '24h'];

  const handleExportCsv = () => {
    const rows = chartData.map(row => {
      const out: Record<string, unknown> = { Tijd: row.label };
      members.forEach(m => { out[m.member_name || m.id] = row[m.id] ?? 0; });
      out['Totaal (kW)'] = row['__total'];
      return out;
    });
    downloadAsCsv(rows, `vermogenshistorie-${grid.name}-${range}.csv`);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Vermogenshistorie</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Piek: <span className="font-mono font-medium text-foreground">{peakTotal.toFixed(1)} kW</span>
              {' · '}GTV limiet: <span className="font-mono font-medium text-foreground">{grid.gtv_limit_kw} kW</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {ranges.map(r => (
              <Button
                key={r}
                variant={range === r ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={handleExportCsv} title="Exporteer als CSV">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-56">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
              <defs>
                {members.map((m, i) => (
                  <linearGradient key={m.id} id={`grad-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval={hours <= 6 ? 0 : hours <= 12 ? 1 : 'preserveStartEnd'}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}`}
                width={36}
                domain={[0, Math.ceil(grid.gtv_limit_kw * 1.1)]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: number, name: string) => {
                  const member = members.find(m => m.id === name);
                  return [`${value} kW`, member?.member_name || name];
                }}
                labelFormatter={(label) => `Tijd: ${label}`}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => {
                  const member = members.find(m => m.id === value);
                  return (
                    <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                      {member?.member_name || value}
                    </span>
                  );
                }}
              />

              {/* GTV limit reference line */}
              <ReferenceLine
                y={grid.gtv_limit_kw}
                stroke="hsl(var(--destructive))"
                strokeDasharray="4 4"
                strokeWidth={1}
              />

              {members.map((m, i) => (
                <Area
                  key={m.id}
                  type="monotone"
                  dataKey={m.id}
                  name={m.id}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={`url(#grad-${m.id})`}
                  strokeWidth={1.5}
                  dot={false}
                  stackId="power"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {hasRealData
            ? `${meterReadings.length + cpValues.length} metingen verwerkt`
            : 'Geen meterdata beschikbaar in deze periode'}
        </span>
        <Badge variant={hasRealData ? 'default' : 'outline'} className="text-[9px]">
          {hasRealData ? 'Live data' : 'Geen data'}
        </Badge>
      </div>
    </div>
  );
};

export default GridPowerHistoryChart;
