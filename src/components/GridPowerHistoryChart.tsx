import { useMemo, useState } from 'react';
import { VirtualGrid, useVirtualGridMembers } from '@/hooks/useVirtualGrids';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, subHours, eachHourOfInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3 } from 'lucide-react';

type Range = '6h' | '12h' | '24h';

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-5))',
];

const CHART_FILLS = [
  'hsl(var(--chart-1) / 0.15)',
  'hsl(var(--chart-3) / 0.15)',
  'hsl(var(--chart-4) / 0.15)',
  'hsl(var(--chart-2) / 0.15)',
  'hsl(var(--chart-5) / 0.15)',
];

interface Props {
  grid: VirtualGrid;
}

/**
 * Generates simulated historical power data per member.
 * In production this would query meter_readings / meter_values.
 */
function generateHistory(
  members: { id: string; member_name: string | null; member_type: string; max_power_kw: number; enabled: boolean }[],
  hours: number
) {
  const now = new Date();
  const start = subHours(now, hours);
  const hourSlots = eachHourOfInterval({ start, end: now });

  // Seed a deterministic-ish pattern per member
  return hourSlots.map((slot) => {
    const hour = slot.getHours();
    // Solar follows a bell-curve during daylight
    const solarFactor = hour >= 6 && hour <= 20
      ? Math.sin(((hour - 6) / 14) * Math.PI)
      : 0;

    const row: Record<string, string | number> = {
      time: slot.toISOString(),
      label: format(slot, 'HH:mm', { locale: nl }),
    };

    members.forEach((m) => {
      if (!m.enabled) {
        row[m.id] = 0;
        return;
      }
      const max = m.max_power_kw || 1;
      let base: number;

      if (m.member_type === 'solar') {
        base = max * solarFactor * (0.7 + Math.random() * 0.3);
      } else if (m.member_type === 'charge_point') {
        // EVs charge more at night / morning
        const evFactor = hour >= 18 || hour <= 8 ? 0.8 : 0.3;
        base = max * evFactor * (0.6 + Math.random() * 0.4);
      } else if (m.member_type === 'battery') {
        // Battery discharges during peaks, charges at night
        const battFactor = hour >= 17 && hour <= 21 ? 0.9 : 0.2;
        base = max * battFactor * (0.5 + Math.random() * 0.5);
      } else {
        base = max * (0.3 + Math.random() * 0.5);
      }

      row[m.id] = Math.round(Math.min(base, max) * 100) / 100;
    });

    // Total
    const total = members.reduce((s, m) => s + (Number(row[m.id]) || 0), 0);
    row['__total'] = Math.round(total * 100) / 100;

    return row;
  });
}

const GridPowerHistoryChart = ({ grid }: Props) => {
  const { data: members = [] } = useVirtualGridMembers(grid.id);
  const [range, setRange] = useState<Range>('24h');

  const hours = range === '6h' ? 6 : range === '12h' ? 12 : 24;

  const chartData = useMemo(
    () => generateHistory(members, hours),
    // Re-generate when members change or range changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members.map(m => m.id).join(','), hours]
  );

  const peakTotal = useMemo(
    () => Math.max(...chartData.map(d => Number(d['__total']) || 0), 0),
    [chartData]
  );

  if (members.length === 0) return null;

  const ranges: Range[] = ['6h', '12h', '24h'];

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
      </div>

      {/* Chart */}
      <div className="h-56">
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
      </div>

      {/* Footer legend */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Gestapelde gebieden tonen vermogen per lid</span>
        <Badge variant="outline" className="text-[9px]">Simulatie</Badge>
      </div>
    </div>
  );
};

export default GridPowerHistoryChart;
