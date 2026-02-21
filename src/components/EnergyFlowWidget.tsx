import { useEnergyFlows } from '@/hooks/useEnergyFlows';
import { ArrowDownUp, Sun, BatteryCharging, Radio, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from 'react';

const TYPE_CONFIG = {
  grid: { icon: ArrowDownUp, accentClass: 'text-foreground', bgClass: 'bg-muted-foreground/10' },
  pv: { icon: Sun, accentClass: 'text-primary', bgClass: 'bg-primary/10' },
  battery: { icon: BatteryCharging, accentClass: 'text-warning', bgClass: 'bg-warning/10' },
} as const;

const EnergyFlowWidget = () => {
  const { flows, isLoading, hasAnyLive } = useEnergyFlows();

  const totalConsumption = useMemo(() => {
    const grid = flows.find(f => f.type === 'grid')?.totalPowerKw ?? 0;
    const pv = flows.find(f => f.type === 'pv')?.totalPowerKw ?? 0;
    const bat = flows.find(f => f.type === 'battery')?.totalPowerKw ?? 0;
    return +(grid + pv + Math.abs(bat)).toFixed(2);
  }, [flows]);

  const selfConsumption = useMemo(() => {
    if (totalConsumption <= 0) return 0;
    const pv = flows.find(f => f.type === 'pv')?.totalPowerKw ?? 0;
    const bat = Math.abs(flows.find(f => f.type === 'battery')?.totalPowerKw ?? 0);
    return Math.round(((pv + bat) / totalConsumption) * 100);
  }, [flows, totalConsumption]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-40 mb-6" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Energiestromen</h2>
        </div>
        {hasAnyLive && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-[10px] text-muted-foreground">Live</span>
          </div>
        )}
      </div>

      <div className="p-5">
        {/* Flow cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {flows.map(flow => {
            const config = TYPE_CONFIG[flow.type];
            const Icon = config.icon;
            const hasLive = flow.meters.some(m => m.isLive);

            return (
              <div key={flow.type} className="relative flex flex-col items-center text-center p-5 rounded-xl bg-muted/50 border border-border">
                {hasLive && (
                  <div className="absolute top-2.5 right-2.5">
                    <Radio className="h-3 w-3 text-primary animate-pulse" />
                  </div>
                )}
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${config.bgClass} mb-3`}>
                  <Icon className={`h-6 w-6 ${config.accentClass}`} />
                </div>
                <span className="text-xs text-muted-foreground mb-1">{flow.label}</span>
                <span className={`font-mono text-2xl font-bold ${config.accentClass}`}>
                  {flow.totalPowerKw}
                </span>
                <span className="font-mono text-xs text-muted-foreground">kW</span>

                {/* Per-meter breakdown if multiple */}
                {flow.meters.length > 1 && (
                  <div className="mt-3 w-full space-y-1">
                    {flow.meters.map(m => (
                      <div key={m.id} className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                        <span className="truncate">{m.name}</span>
                        <span className={m.isLive ? 'text-foreground' : ''}>{m.powerKw} kW</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Balance bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Energiebalans</span>
            <span className="font-mono text-xs text-primary">{selfConsumption}% eigen verbruik</span>
          </div>
          <div className="h-3.5 rounded-full bg-muted overflow-hidden flex">
            {flows.map(flow => {
              const abs = Math.abs(flow.totalPowerKw);
              const pct = totalConsumption > 0 ? (abs / totalConsumption) * 100 : 0;
              const colorMap = { pv: 'bg-primary', battery: 'bg-warning', grid: 'bg-muted-foreground/30' };
              return (
                <div
                  key={flow.type}
                  className={`${colorMap[flow.type]} h-full transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                  title={`${flow.label}: ${abs} kW`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-5 mt-2.5">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-primary" />
              <span className="text-[10px] text-muted-foreground">PV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-warning" />
              <span className="text-[10px] text-muted-foreground">Batterij</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground">Grid</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnergyFlowWidget;
