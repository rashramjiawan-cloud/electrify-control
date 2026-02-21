import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  meterId: string | undefined;
}

function usePVMonthlyReadings(meterId: string | undefined, year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  return useQuery({
    queryKey: ['pv-monthly-readings', meterId, year, month],
    enabled: !!meterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_readings')
        .select('channel, total_energy, timestamp')
        .eq('meter_id', meterId!)
        .gte('timestamp', start.toISOString())
        .lt('timestamp', end.toISOString())
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const PVMonthlyYieldChart = ({ meterId }: Props) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data: readings, isLoading } = usePVMonthlyReadings(meterId, year, month);

  const chartData = useMemo(() => {
    if (!readings?.length) return [];

    // Group readings by day, then per channel find first/last total_energy
    const byDay = new Map<number, Map<number, { first: number; last: number }>>();

    for (const r of readings) {
      const day = new Date(r.timestamp).getDate();
      const ch = r.channel ?? 0;
      const energy = r.total_energy ?? 0;

      if (!byDay.has(day)) byDay.set(day, new Map());
      const channels = byDay.get(day)!;

      if (!channels.has(ch)) {
        channels.set(ch, { first: energy, last: energy });
      } else {
        channels.get(ch)!.last = energy;
      }
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result = [];

    for (let d = 1; d <= daysInMonth; d++) {
      let yieldKwh = 0;
      const channels = byDay.get(d);
      if (channels) {
        for (const v of channels.values()) {
          yieldKwh += Math.max(0, v.last - v.first);
        }
      }
      result.push({
        day: d,
        label: `${d}`,
        yield: +(yieldKwh / 1000).toFixed(2), // Wh → kWh
      });
    }

    return result;
  }, [readings, year, month]);

  const totalMonth = useMemo(
    () => chartData.reduce((s, d) => s + d.yield, 0).toFixed(1),
    [chartData]
  );

  const monthLabel = new Date(year, month).toLocaleDateString('nl-NL', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    const now = new Date();
    const next = new Date(year, month + 1);
    if (next > now) return;
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const hasData = chartData.some(d => d.yield > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Maandoverzicht opbrengst</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dagelijkse PV-opbrengst in kWh — totaal{' '}
            <span className="font-semibold text-primary">{totalMonth} kWh</span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium text-foreground min-w-[120px] text-center capitalize">
            {monthLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={nextMonth}
            disabled={isCurrentMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground animate-pulse">Laden...</p>
        </div>
      ) : !hasData ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Geen opbrengstdata beschikbaar voor {monthLabel}.
          </p>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={v => `${v} kWh`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value} kWh`, 'Opbrengst']}
                labelFormatter={(label) => `Dag ${label}`}
              />
              <Bar dataKey="yield" radius={[3, 3, 0, 0]} maxBarSize={18}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.day === today.getDate() && isCurrentMonth
                        ? 'hsl(var(--primary))'
                        : 'hsl(var(--primary) / 0.6)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default PVMonthlyYieldChart;
