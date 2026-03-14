import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { History } from 'lucide-react';
import type { ModelType } from '@/hooks/useMeterAiModels';

interface Props {
  meterId: string;
  modelType: ModelType;
  modelLabel: string;
}

const METRIC_CONFIG: Record<string, { keys: { key: string; label: string; color: string }[]; unit: string }> = {
  consumption_high: {
    keys: [
      { key: 'mean', label: 'Gemiddelde (μ)', color: 'hsl(var(--primary))' },
      { key: 'stdDev', label: 'Std. afwijking (σ)', color: 'hsl(var(--muted-foreground))' },
      { key: 'threshold', label: 'Drempel', color: 'hsl(0 84% 60%)' },
    ],
    unit: 'W',
  },
  consumption_low: {
    keys: [
      { key: 'mean', label: 'Gemiddelde (μ)', color: 'hsl(var(--primary))' },
      { key: 'stdDev', label: 'Std. afwijking (σ)', color: 'hsl(var(--muted-foreground))' },
      { key: 'threshold', label: 'Drempel', color: 'hsl(200 80% 50%)' },
    ],
    unit: 'W',
  },
  long_working_cycle: {
    keys: [
      { key: 'avgCycleMin', label: 'Gem. cyclus', color: 'hsl(var(--primary))' },
      { key: 'thresholdMin', label: 'Drempel', color: 'hsl(0 84% 60%)' },
    ],
    unit: 'min',
  },
  long_idle_cycle: {
    keys: [
      { key: 'avgCycleMin', label: 'Gem. cyclus', color: 'hsl(var(--primary))' },
      { key: 'thresholdMin', label: 'Drempel', color: 'hsl(40 90% 50%)' },
    ],
    unit: 'min',
  },
};

export default function MeterAiModelHistoryChart({ meterId, modelType, modelLabel }: Props) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['meter-ai-model-history', meterId, modelType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_ai_model_history')
        .select('baseline_data, trained_at')
        .eq('meter_id', meterId)
        .eq('model_type', modelType)
        .order('trained_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const config = METRIC_CONFIG[modelType];

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.map((h) => {
      const b = h.baseline_data as Record<string, any>;
      const point: Record<string, any> = {
        date: new Date(h.trained_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      };
      for (const k of config.keys) {
        point[k.key] = b?.[k.key] ?? null;
      }
      return point;
    });
  }, [history, config]);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!chartData.length) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-3">
        <History className="h-3.5 w-3.5" />
        <span>Nog geen trainingshistorie beschikbaar. Train het model opnieuw om trends te zien.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <History className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground">Trainingshistorie — {modelLabel}</span>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={40} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number) => [`${value} ${config.unit}`, undefined]}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {config.keys.map((k) => (
              <Line
                key={k.key}
                type="monotone"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={1.5}
                dot={{ r: 2.5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
