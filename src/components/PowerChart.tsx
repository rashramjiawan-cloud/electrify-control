import { useChargePoints, useConnectors } from '@/hooks/useChargePoints';
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
];

const PowerChart = () => {
  const { data: chargePoints } = useChargePoints();
  const { data: connectors } = useConnectors();

  const chartData = useMemo(() => {
    if (!chargePoints?.length) return [];
    return chargePoints.map((cp) => {
      const cpConnectors = connectors?.filter(c => c.charge_point_id === cp.id) || [];
      const totalPower = cpConnectors.reduce((sum, c) => sum + (c.current_power || 0), 0);
      return {
        name: cp.name,
        power: +(totalPower / 1000).toFixed(2), // W -> kW
        maxPower: +(cp.max_power / 1000).toFixed(1),
      };
    });
  }, [chargePoints, connectors]);

  if (!chartData.length) return null;

  const totalPower = chartData.reduce((s, d) => s + d.power, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Huidig vermogen per laadpaal</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Realtime · ververst elke 30s</p>
        </div>
        <div className="text-right">
          <span className="font-mono text-2xl font-bold text-foreground">{totalPower.toFixed(1)}</span>
          <span className="font-mono text-sm text-muted-foreground ml-1">kW</span>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
            <XAxis
              type="number"
              tickFormatter={v => `${v} kW`}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value} kW`, 'Vermogen']}
            />
            <Bar dataKey="power" radius={[0, 6, 6, 0]} maxBarSize={28}>
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PowerChart;
