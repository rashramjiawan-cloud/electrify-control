import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

interface MeterSparklineProps {
  meterId: string;
  minutes?: number;
  width?: number;
  height?: number;
}

export default function MeterSparkline({ meterId, minutes = 5, width = 120, height = 36 }: MeterSparklineProps) {
  const since = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - minutes);
    return d.toISOString();
  }, [minutes]);

  const { data: readings } = useQuery({
    queryKey: ['meter-sparkline', meterId, minutes],
    queryFn: async () => {
      // Get total active_power per timestamp (sum across channels)
      const { data, error } = await supabase
        .from('meter_readings')
        .select('timestamp, active_power, channel')
        .eq('meter_id', meterId)
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  // Group by timestamp and sum active_power across channels
  const points = useMemo(() => {
    if (!readings || readings.length === 0) return [];
    const grouped = new Map<string, number>();
    for (const r of readings) {
      const ts = r.timestamp;
      grouped.set(ts, (grouped.get(ts) ?? 0) + (r.active_power ?? 0));
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ts, power]) => ({ ts, power }));
  }, [readings]);

  if (points.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center">
        <span className="text-[9px] text-muted-foreground">Geen data</span>
      </div>
    );
  }

  const values = points.map(p => p.power);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;

  const pathPoints = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.power - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const zeroY = pad + (1 - (0 - min) / range) * (height - pad * 2);
  const clampedZeroY = Math.max(pad, Math.min(height - pad, zeroY));

  // Fill area
  const fillPath = `M${pathPoints[0]} ${pathPoints.map((_, i) => (i === 0 ? '' : `L${pathPoints[i]}`)).join(' ')} L${pad + ((points.length - 1) / (points.length - 1)) * (width - pad * 2)},${clampedZeroY} L${pad},${clampedZeroY} Z`;

  const lastValue = values[values.length - 1];
  const isExport = lastValue < 0;

  return (
    <div style={{ width, height }} className="relative">
      <svg width={width} height={height} className="overflow-visible">
        {/* Zero line */}
        {min < 0 && max > 0 && (
          <line
            x1={pad}
            y1={clampedZeroY}
            x2={width - pad}
            y2={clampedZeroY}
            className="stroke-muted-foreground/30"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />
        )}
        {/* Fill */}
        <path
          d={fillPath}
          className={isExport ? 'fill-green-500/15' : 'fill-destructive/10'}
        />
        {/* Line */}
        <polyline
          points={pathPoints.join(' ')}
          fill="none"
          className={isExport ? 'stroke-green-500' : 'stroke-destructive'}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Current dot */}
        <circle
          cx={pad + ((points.length - 1) / (points.length - 1)) * (width - pad * 2)}
          cy={pad + (1 - (lastValue - min) / range) * (height - pad * 2)}
          r={2.5}
          className={isExport ? 'fill-green-500' : 'fill-destructive'}
        />
      </svg>
    </div>
  );
}
