import { useEnergyFlows } from '@/hooks/useEnergyFlows';
import { useChargePoints } from '@/hooks/useChargePoints';
import { mockChargePoints, mockBatteries, mockEMS } from '@/data/mockData';
import { useMemo } from 'react';

/**
 * Animated energy flow rendering with glowing cables and flowing particles.
 * Inspired by fiber-optic / neon cable aesthetics.
 */
const EnergyFlowRendering = () => {
  const { flows, hasAnyLive } = useEnergyFlows();
  const { data: dbChargePoints } = useChargePoints();

  const hasDbCp = dbChargePoints && dbChargePoints.length > 0;

  const gridFlow = flows.find(f => f.type === 'grid');
  const pvFlow = flows.find(f => f.type === 'pv');
  const batFlow = flows.find(f => f.type === 'battery');

  const gridKw = gridFlow?.totalPowerKw ?? 0;
  const pvKw = pvFlow?.totalPowerKw ?? 0;
  const batKw = batFlow?.totalPowerKw ?? 0;

  const cpList = hasDbCp
    ? dbChargePoints.map(cp => ({ id: cp.id, name: cp.name, status: cp.status }))
    : mockChargePoints.map(cp => ({ id: cp.id, name: cp.name, status: cp.status }));

  const chargingCps = cpList.filter(cp => cp.status === 'Charging');
  const availableCps = cpList.filter(cp => cp.status === 'Available');
  const faultedCps = cpList.filter(cp => cp.status === 'Faulted');

  const batteryData = mockBatteries[0];
  const solarPower = pvKw || mockEMS.solarPower;
  const isGridActive = Math.abs(gridKw) > 0 || !hasAnyLive;
  const isPvActive = pvKw > 0 || mockEMS.solarPower > 0;
  const isBatActive = Math.abs(batKw) > 0 || (batteryData && Math.abs(batteryData.power) > 0);
  const isCharging = chargingCps.length > 0 || mockChargePoints.some(cp => cp.status === 'Charging');

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="h-2 w-2 rounded-full bg-primary" />
            {hasAnyLive && (
              <div className="absolute inset-0 h-2 w-2 rounded-full bg-primary animate-ping opacity-75" />
            )}
          </div>
          <h2 className="text-sm font-semibold text-foreground">Energiestroom Visualisatie</h2>
        </div>
        {hasAnyLive && (
          <span className="text-[10px] font-mono text-primary uppercase tracking-wider">● Live</span>
        )}
      </div>

      <div className="relative p-6">
        {/* SVG Cable Rendering */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* Glow filters */}
            <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Gradient for grid cable */}
            <linearGradient id="cable-grid" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
              <stop offset="50%" stopColor="hsl(var(--foreground))" stopOpacity="0.6" />
              <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
            </linearGradient>

            {/* Gradient for PV cable */}
            <linearGradient id="cable-pv" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
              <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            </linearGradient>

            {/* Gradient for battery cable */}
            <linearGradient id="cable-bat" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity="0.3" />
              <stop offset="50%" stopColor="hsl(var(--warning))" stopOpacity="0.8" />
              <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity="0.3" />
            </linearGradient>

            {/* Flowing particle */}
            <linearGradient id="particle-green" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* === Grid → Hub cable === */}
          {isGridActive && (
            <g>
              <path d="M 80 100 C 200 100, 280 200, 400 200" fill="none" stroke="url(#cable-grid)" strokeWidth="3" strokeLinecap="round" />
              <path d="M 80 100 C 200 100, 280 200, 400 200" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
              {/* Flowing particles */}
              <circle r="4" fill="hsl(var(--foreground))" filter="url(#glow-blue)" opacity="0.9">
                <animateMotion dur="2.5s" repeatCount="indefinite" path="M 80 100 C 200 100, 280 200, 400 200" />
              </circle>
              <circle r="3" fill="hsl(var(--foreground))" filter="url(#glow-blue)" opacity="0.6">
                <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.8s" path="M 80 100 C 200 100, 280 200, 400 200" />
              </circle>
              <circle r="2" fill="hsl(var(--foreground))" filter="url(#glow-blue)" opacity="0.4">
                <animateMotion dur="2.5s" repeatCount="indefinite" begin="1.6s" path="M 80 100 C 200 100, 280 200, 400 200" />
              </circle>
            </g>
          )}

          {/* === PV → Hub cable === */}
          {isPvActive && (
            <g>
              <path d="M 80 200 L 400 200" fill="none" stroke="url(#cable-pv)" strokeWidth="3" strokeLinecap="round" />
              <path d="M 80 200 L 400 200" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
              <circle r="5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.95">
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 80 200 L 400 200" />
              </circle>
              <circle r="3.5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.7">
                <animateMotion dur="1.8s" repeatCount="indefinite" begin="0.6s" path="M 80 200 L 400 200" />
              </circle>
              <circle r="2.5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.5">
                <animateMotion dur="1.8s" repeatCount="indefinite" begin="1.2s" path="M 80 200 L 400 200" />
              </circle>
            </g>
          )}

          {/* === Battery ↔ Hub cable === */}
          {isBatActive && (
            <g>
              <path d="M 80 300 C 200 300, 280 200, 400 200" fill="none" stroke="url(#cable-bat)" strokeWidth="3" strokeLinecap="round" />
              <path d="M 80 300 C 200 300, 280 200, 400 200" fill="none" stroke="hsl(var(--warning))" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
              <circle r="4" fill="hsl(var(--warning))" filter="url(#glow-yellow)" opacity="0.9">
                <animateMotion dur="2.2s" repeatCount="indefinite" 
                  path={batKw >= 0 ? "M 80 300 C 200 300, 280 200, 400 200" : "M 400 200 C 280 200, 200 300, 80 300"} />
              </circle>
              <circle r="2.5" fill="hsl(var(--warning))" filter="url(#glow-yellow)" opacity="0.6">
                <animateMotion dur="2.2s" repeatCount="indefinite" begin="0.7s"
                  path={batKw >= 0 ? "M 80 300 C 200 300, 280 200, 400 200" : "M 400 200 C 280 200, 200 300, 80 300"} />
              </circle>
            </g>
          )}

          {/* === Hub → Charge Points cable === */}
          {isCharging && (
            <g>
              <path d="M 400 200 C 520 200, 600 140, 720 140" fill="none" stroke="url(#cable-pv)" strokeWidth="3" strokeLinecap="round" />
              <path d="M 400 200 C 520 200, 600 140, 720 140" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
              <circle r="4" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.9">
                <animateMotion dur="2s" repeatCount="indefinite" path="M 400 200 C 520 200, 600 140, 720 140" />
              </circle>
              <circle r="2.5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.6">
                <animateMotion dur="2s" repeatCount="indefinite" begin="0.7s" path="M 400 200 C 520 200, 600 140, 720 140" />
              </circle>

              {/* Second cable to lower CP row */}
              <path d="M 400 200 C 520 200, 600 260, 720 260" fill="none" stroke="url(#cable-pv)" strokeWidth="2.5" strokeLinecap="round" />
              <circle r="3.5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.8">
                <animateMotion dur="2.3s" repeatCount="indefinite" begin="0.3s" path="M 400 200 C 520 200, 600 260, 720 260" />
              </circle>
            </g>
          )}
        </svg>

        {/* Node Layout */}
        <div className="relative z-10 grid grid-cols-5 gap-4 min-h-[320px] items-center">
          {/* Left column: Sources */}
          <div className="col-span-1 space-y-4">
            {/* Grid Node */}
            <NodeCard
              label="Grid (net)"
              value={`${Math.abs(gridKw).toFixed(1)} kW`}
              subtitle={gridKw >= 0 ? 'Import' : 'Export'}
              color="foreground"
              active={isGridActive}
              icon={
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 7h18M3 17h18M7 3v18M17 3v18" strokeLinecap="round" />
                </svg>
              }
            />
            {/* PV Node */}
            <NodeCard
              label="Zonne-energie"
              value={`${solarPower.toFixed?.(1) ?? solarPower} kW`}
              color="primary"
              active={isPvActive}
              icon={
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" strokeLinecap="round" />
                </svg>
              }
            />
            {/* Battery Node */}
            <NodeCard
              label="Batterij"
              value={`${batteryData?.soc ?? 0}%`}
              subtitle={`${batKw || batteryData?.power || 0} kW`}
              color="warning"
              active={isBatActive}
              icon={
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="7" width="18" height="10" rx="2" />
                  <path d="M22 11v2" strokeLinecap="round" />
                  <rect x="4" y="9" width={`${(batteryData?.soc ?? 0) * 0.14}`} height="6" rx="1" fill="currentColor" opacity="0.4" />
                </svg>
              }
            />
          </div>

          {/* Center: Hub */}
          <div className="col-span-1 flex items-center justify-center col-start-3">
            <div className="relative">
              <div className="h-20 w-20 rounded-2xl border-2 border-primary/30 bg-primary/5 flex items-center justify-center backdrop-blur-sm">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-primary" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-2xl border-2 border-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-mono text-muted-foreground">EMS Hub</span>
              </div>
            </div>
          </div>

          {/* Right column: Consumers */}
          <div className="col-span-1 col-start-5 space-y-3">
            {/* Charging CPs */}
            {chargingCps.length > 0 ? (
              chargingCps.slice(0, 3).map(cp => (
                <NodeCard
                  key={cp.id}
                  label={cp.name}
                  subtitle="Laden"
                  color="primary"
                  active
                  small
                  icon={
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
              ))
            ) : (
              mockChargePoints.filter(cp => cp.status === 'Charging').slice(0, 3).map(cp => (
                <NodeCard
                  key={cp.id}
                  label={cp.name}
                  subtitle={`${cp.connectors.reduce((a, c) => a + c.currentPower, 0).toFixed(1)} kW`}
                  color="primary"
                  active
                  small
                  icon={
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
              ))
            )}
            {/* Available CPs count */}
            {(availableCps.length > 0 || mockChargePoints.filter(cp => cp.status === 'Available').length > 0) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  {availableCps.length || mockChargePoints.filter(cp => cp.status === 'Available').length} beschikbaar
                </span>
              </div>
            )}
            {/* Faulted CPs */}
            {(faultedCps.length > 0) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="h-2 w-2 rounded-full bg-destructive" />
                <span className="text-[10px] text-destructive">{faultedCps.length} storing</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Single node card for sources/consumers */
const NodeCard = ({
  label,
  value,
  subtitle,
  color,
  active,
  icon,
  small,
}: {
  label: string;
  value?: string;
  subtitle?: string;
  color: 'primary' | 'warning' | 'destructive' | 'foreground';
  active: boolean;
  icon: React.ReactNode;
  small?: boolean;
}) => {
  const colorMap = {
    primary: {
      border: 'border-primary/30',
      bg: 'bg-primary/5',
      text: 'text-primary',
      glow: active ? 'glow-primary' : '',
      dot: 'bg-primary',
    },
    warning: {
      border: 'border-warning/30',
      bg: 'bg-warning/5',
      text: 'text-warning',
      glow: active ? 'glow-warning' : '',
      dot: 'bg-warning',
    },
    destructive: {
      border: 'border-destructive/30',
      bg: 'bg-destructive/5',
      text: 'text-destructive',
      glow: active ? 'glow-destructive' : '',
      dot: 'bg-destructive',
    },
    foreground: {
      border: 'border-border',
      bg: 'bg-muted/50',
      text: 'text-foreground',
      glow: '',
      dot: 'bg-foreground',
    },
  };

  const c = colorMap[color];

  return (
    <div className={`relative rounded-xl border ${c.border} ${c.bg} ${c.glow} ${small ? 'px-3 py-2.5' : 'px-4 py-3.5'} transition-all duration-500`}>
      {active && (
        <div className={`absolute top-2 right-2 h-2 w-2 rounded-full ${c.dot}`}>
          <div className={`absolute inset-0 h-2 w-2 rounded-full ${c.dot} animate-ping opacity-50`} />
        </div>
      )}
      <div className={`flex items-center gap-2.5 ${c.text}`}>
        {icon}
        <div className="min-w-0">
          <p className={`${small ? 'text-[11px]' : 'text-xs'} font-medium truncate`}>{label}</p>
          {value && (
            <p className={`font-mono ${small ? 'text-sm' : 'text-lg'} font-bold`}>{value}</p>
          )}
          {subtitle && (
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnergyFlowRendering;
