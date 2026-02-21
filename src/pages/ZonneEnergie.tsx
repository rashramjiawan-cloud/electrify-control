import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import { usePVMeters, usePVReadings, usePVDailyYield, usePVRealtime } from '@/hooks/usePVMeters';
import { Sun, Zap, Activity, Gauge, Radio } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const ZonneEnergie = () => {
  const queryClient = useQueryClient();
  const { data: pvMeters, isLoading: metersLoading } = usePVMeters();
  const activeMeter = pvMeters?.find(m => m.enabled);
  const { data: readings } = usePVReadings(activeMeter?.id);
  const { data: dailyYield } = usePVDailyYield(activeMeter?.id);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pv-readings'] });
    queryClient.invalidateQueries({ queryKey: ['pv-daily-yield'] });
  }, [queryClient]);

  usePVRealtime(activeMeter?.id, invalidate);

  const { totalPower, phases, isLive } = useMemo(() => {
    if (!readings?.length) return { totalPower: 0, phases: [] as any[], isLive: false };

    const latestByChannel = new Map<number, (typeof readings)[0]>();
    for (const r of readings) {
      const ch = r.channel ?? 0;
      if (!latestByChannel.has(ch)) latestByChannel.set(ch, r);
    }

    let total = 0;
    const phases = Array.from(latestByChannel.entries())
      .sort(([a], [b]) => a - b)
      .map(([ch, r]) => {
        const power = r.active_power != null ? +(r.active_power / 1000).toFixed(2) : null;
        if (power != null) total += power;
        return {
          channel: ch,
          power,
          current: r.current != null ? +Number(r.current).toFixed(1) : null,
          voltage: r.voltage != null ? +Number(r.voltage).toFixed(1) : null,
          pf: r.power_factor != null ? +Number(r.power_factor).toFixed(2) : null,
          freq: r.frequency != null ? +Number(r.frequency).toFixed(1) : null,
        };
      });

    return { totalPower: +total.toFixed(2), phases, isLive: phases.length > 0 };
  }, [readings]);

  const phaseColors = [
    { border: 'border-primary/40 bg-primary/5', label: 'text-primary' },
    { border: 'border-chart-2/40 bg-chart-2/5', label: 'text-chart-2' },
    { border: 'border-chart-3/40 bg-chart-3/5', label: 'text-chart-3' },
  ];

  const noPVConfigured = !metersLoading && (!pvMeters || pvMeters.length === 0);

  return (
    <AppLayout title="Zonne-energie" subtitle="Realtime PV-productie monitoring">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Actueel vermogen"
          value={isLive ? totalPower : '—'}
          unit="kW"
          icon={Sun}
          variant="primary"
        />
        <StatCard
          title="Dagopbrengst"
          value={dailyYield != null ? dailyYield : '—'}
          unit="kWh"
          icon={Zap}
          variant="primary"
        />
        <StatCard
          title="Fasen actief"
          value={phases.length}
          unit={`/ 3`}
          icon={Activity}
        />
        <StatCard
          title="Status"
          value={isLive ? 'Online' : 'Offline'}
          icon={Gauge}
          variant={isLive ? 'primary' : 'destructive'}
        />
      </div>

      {/* Live indicator */}
      {isLive && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
          </span>
          <span className="text-xs text-muted-foreground">
            Live data via <span className="font-medium text-foreground">{activeMeter?.name || 'PV Meter'}</span>
          </span>
        </div>
      )}

      {/* Per-phase detail strips */}
      {isLive && phases.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {phases.map((p, i) => (
            <div key={p.channel} className={`rounded-xl border p-4 ${phaseColors[i]?.border || phaseColors[0].border}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-semibold ${phaseColors[i]?.label || phaseColors[0].label}`}>
                  Fase {p.channel + 1}
                </span>
                <Radio className={`h-3.5 w-3.5 animate-pulse ${phaseColors[i]?.label || phaseColors[0].label}`} />
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Vermogen</span>
                  <p className="font-mono text-lg font-bold text-foreground">{p.power ?? '—'} <span className="text-xs text-muted-foreground">kW</span></p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Spanning</span>
                  <p className="font-mono text-lg font-bold text-foreground">{p.voltage ?? '—'} <span className="text-xs text-muted-foreground">V</span></p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Stroom</span>
                  <p className="font-mono text-lg font-bold text-foreground">{p.current ?? '—'} <span className="text-xs text-muted-foreground">A</span></p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Power Factor</span>
                  <p className="font-mono text-lg font-bold text-foreground">{p.pf ?? '—'}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Frequentie</span>
                  <p className="font-mono text-lg font-bold text-foreground">{p.freq ?? '—'} <span className="text-xs text-muted-foreground">Hz</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No PV configured message */}
      {noPVConfigured && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Sun className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Geen PV-meter geconfigureerd</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Voeg een energiemeter toe via <span className="font-medium text-foreground">EMS → Energiemeters</span> en 
            stel het type in op <span className="font-mono text-primary">PV</span> om realtime zonne-energie data te zien.
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {metersLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default ZonneEnergie;
