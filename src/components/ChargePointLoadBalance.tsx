import { useMemo } from 'react';
import { Zap, ArrowDown, ArrowUp, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChargePointLoadBalanceProps {
  chargePointId: string;
  chargePointName: string;
  maxPower: number | null;
  currentPower: number;
  status: string;
}

const ChargePointLoadBalance = ({ chargePointName, maxPower, currentPower, status }: ChargePointLoadBalanceProps) => {
  const max = maxPower || 7.4; // default 7.4 kW for home chargers
  const usage = Math.min(currentPower / max, 1);
  const usagePercent = Math.round(usage * 100);

  const getBarColor = (pct: number) => {
    if (pct > 90) return 'bg-destructive';
    if (pct > 70) return 'bg-warning';
    return 'bg-primary';
  };

  const getGlowClass = (pct: number) => {
    if (pct > 90) return 'glow-destructive';
    if (pct > 70) return 'glow-warning';
    return 'glow-primary';
  };

  const isCharging = status === 'Charging';
  const isAvailable = status === 'Available';

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Load Balance</span>
        </div>
        <span className={cn(
          'text-xs font-mono font-bold',
          usagePercent > 90 ? 'text-destructive' : usagePercent > 70 ? 'text-warning' : 'text-primary'
        )}>
          {usagePercent}%
        </span>
      </div>

      {/* Power bar */}
      <div className="space-y-1.5">
        <div className="h-3 rounded-full bg-muted overflow-hidden relative">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000 ease-out relative',
              getBarColor(usagePercent),
              isCharging && getGlowClass(usagePercent)
            )}
            style={{ width: `${Math.max(usagePercent, 2)}%` }}
          >
            {isCharging && (
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_ease-in-out_infinite]" />
              </div>
            )}
          </div>

          {/* Threshold markers */}
          <div className="absolute top-0 bottom-0 left-[70%] w-px bg-warning/40" />
          <div className="absolute top-0 bottom-0 left-[90%] w-px bg-destructive/40" />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
          <span>0 kW</span>
          <span>{(max * 0.7).toFixed(1)}</span>
          <span>{max.toFixed(1)} kW</span>
        </div>
      </div>

      {/* Power flow info */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background/60 p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ArrowDown className="h-3 w-3 text-primary" />
          </div>
          <p className="font-mono text-xs font-bold text-foreground">{currentPower.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground">kW huidig</p>
        </div>
        <div className="rounded-md bg-background/60 p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Zap className="h-3 w-3 text-muted-foreground" />
          </div>
          <p className="font-mono text-xs font-bold text-foreground">{max.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground">kW max</p>
        </div>
        <div className="rounded-md bg-background/60 p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ArrowUp className="h-3 w-3 text-primary" />
          </div>
          <p className="font-mono text-xs font-bold text-foreground">{(max - currentPower).toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground">kW vrij</p>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 pt-1">
        <div className={cn(
          'h-2 w-2 rounded-full',
          isCharging ? 'bg-primary animate-pulse' : isAvailable ? 'bg-primary' : 'bg-muted-foreground'
        )} />
        <span className="text-[10px] text-muted-foreground">
          {isCharging ? 'Actief laden — load balancing actief' : isAvailable ? 'Beschikbaar — wacht op sessie' : `Status: ${status}`}
        </span>
      </div>
    </div>
  );
};

export default ChargePointLoadBalance;
