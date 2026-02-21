import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

type Range = '7d' | '30d';

function useEnergyHistory(days: number) {
  return useQuery({
    queryKey: ['energy-history', days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('transactions')
        .select('start_time, energy_delivered, charge_point_id')
        .gte('start_time', since)
        .not('energy_delivered', 'is', null)
        .order('start_time');
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
}

const EnergyHistoryChart = () => {
  const [range, setRange] = useState<Range>('7d');
  const days = range === '7d' ? 7 : 30;
  const { data: transactions, isLoading } = useEnergyHistory(days);

  const chartData = useMemo(() => {
    const interval = eachDayOfInterval({
      start: startOfDay(subDays(new Date(), days - 1)),
      end: startOfDay(new Date()),
    });

    const map = new Map<string, number>();
    interval.forEach(d => map.set(format(d, 'yyyy-MM-dd'), 0));

    transactions?.forEach(tx => {
      const key = format(new Date(tx.start_time), 'yyyy-MM-dd');
      if (map.has(key)) {
        map.set(key, (map.get(key) || 0) + Number(tx.energy_delivered || 0));
      }
    });

    return Array.from(map.entries()).map(([date, energy]) => ({
      date,
      label: format(new Date(date), days <= 7 ? 'EEE d' : 'd MMM', { locale: nl }),
      energy: +energy.toFixed(1),
    }));
  }, [transactions, days]);

  const totalEnergy = chartData.reduce((s, d) => s + d.energy, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Energieverbruik</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Totaal: <span className="font-mono font-medium text-foreground">{totalEnergy.toFixed(1)} kWh</span>
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <Button
            variant={range === '7d' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setRange('7d')}
          >
            7 dagen
          </Button>
          <Button
            variant={range === '30d' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setRange('30d')}
          >
            30 dagen
          </Button>
        </div>
      </div>
      <div className="h-52">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Laden...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval={days <= 7 ? 0 : 'preserveStartEnd'}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}`}
                width={36}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value} kWh`, 'Energie']}
              />
              <Bar dataKey="energy" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default EnergyHistoryChart;
