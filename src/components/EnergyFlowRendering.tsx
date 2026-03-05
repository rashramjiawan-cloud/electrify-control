import { useEnergyFlows } from '@/hooks/useEnergyFlows';
import { useChargePoints } from '@/hooks/useChargePoints';

import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Animated energy flow rendering with glowing cables and flowing particles.
 * Responsive: horizontal on desktop, vertical on mobile.
 */
const EnergyFlowRendering = () => {
  const { flows, hasAnyLive } = useEnergyFlows();
  const { data: dbChargePoints } = useChargePoints();
  const isMobile = useIsMobile();

  

  const gridFlow = flows.find(f => f.type === 'grid');
  const pvFlow = flows.find(f => f.type === 'pv');
  const batFlow = flows.find(f => f.type === 'battery');

  const gridKw = gridFlow?.totalPowerKw ?? 0;
  const pvKw = pvFlow?.totalPowerKw ?? 0;
  const batKw = batFlow?.totalPowerKw ?? 0;

  const cpList = (dbChargePoints || []).map(cp => ({ id: cp.id, name: cp.name, status: cp.status }));

  const chargingCps = cpList.filter(cp => cp.status === 'Charging');
  const availableCps = cpList.filter(cp => cp.status === 'Available');
  const faultedCps = cpList.filter(cp => cp.status === 'Faulted');

  const solarPower = pvKw;
  const isGridActive = Math.abs(gridKw) > 0;
  const isPvActive = pvKw > 0;
  const isBatActive = Math.abs(batKw) > 0;
  const isCharging = chargingCps.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden border-pulse">
      {/* Header */}
      <div className="border-b border-border px-4 md:px-5 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="h-2 w-2 rounded-full bg-primary" />
            {hasAnyLive && (
              <div className="absolute inset-0 h-2 w-2 rounded-full bg-primary animate-ping opacity-75" />
            )}
          </div>
          <h2 className="text-xs md:text-sm font-semibold text-foreground">Energiestroom</h2>
        </div>
        {hasAnyLive && (
          <span className="text-[10px] font-mono text-primary uppercase tracking-wider">● Live</span>
        )}
      </div>

      <div className="relative p-4 md:p-6">
        {/* SVG Cables */}
        {isMobile ? (
          <MobileCables
            isGridActive={isGridActive}
            isPvActive={isPvActive}
            isBatActive={isBatActive}
            isCharging={isCharging}
            batKw={batKw}
          />
        ) : (
          <DesktopCables
            isGridActive={isGridActive}
            isPvActive={isPvActive}
            isBatActive={isBatActive}
            isCharging={isCharging}
            batKw={batKw}
          />
        )}

        {/* Node Layout */}
        {isMobile ? (
          <MobileLayout
            gridKw={gridKw} pvKw={pvKw} batKw={batKw}
            solarPower={solarPower} batteryData={batteryData}
            isGridActive={isGridActive} isPvActive={isPvActive} isBatActive={isBatActive}
            hasAnyLive={hasAnyLive} chargingCps={chargingCps} availableCps={availableCps} faultedCps={faultedCps}
          />
        ) : (
          <DesktopLayout
            gridKw={gridKw} pvKw={pvKw} batKw={batKw}
            solarPower={solarPower} batteryData={batteryData}
            isGridActive={isGridActive} isPvActive={isPvActive} isBatActive={isBatActive}
            hasAnyLive={hasAnyLive} chargingCps={chargingCps} availableCps={availableCps} faultedCps={faultedCps}
          />
        )}
      </div>
    </div>
  );
};

/* ===================== SVG DEFS ===================== */
const SvgDefs = () => (
  <defs>
    <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <filter id="glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <linearGradient id="cable-grid" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
      <stop offset="50%" stopColor="hsl(var(--foreground))" stopOpacity="0.6" />
      <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
    </linearGradient>
    <linearGradient id="cable-pv" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
      <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
    </linearGradient>
    <linearGradient id="cable-bat" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity="0.3" />
      <stop offset="50%" stopColor="hsl(var(--warning))" stopOpacity="0.8" />
      <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity="0.3" />
    </linearGradient>
    {/* Vertical versions */}
    <linearGradient id="cable-grid-v" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
      <stop offset="50%" stopColor="hsl(var(--foreground))" stopOpacity="0.6" />
      <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
    </linearGradient>
    <linearGradient id="cable-pv-v" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
      <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
    </linearGradient>
    <linearGradient id="cable-bat-v" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity="0.3" />
      <stop offset="50%" stopColor="hsl(var(--warning))" stopOpacity="0.8" />
      <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity="0.3" />
    </linearGradient>
  </defs>
);

/* ===================== DESKTOP CABLES ===================== */
const DesktopCables = ({ isGridActive, isPvActive, isBatActive, isCharging, batKw }: CableProps) => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
    <SvgDefs />
    {isGridActive && (
      <g>
        <path d="M 80 100 C 200 100, 280 200, 400 200" fill="none" stroke="url(#cable-grid)" strokeWidth="3" strokeLinecap="round" />
        <path d="M 80 100 C 200 100, 280 200, 400 200" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
        <circle r="4" fill="hsl(var(--foreground))" filter="url(#glow-blue)" opacity="0.9">
          <animateMotion dur="2.5s" repeatCount="indefinite" path="M 80 100 C 200 100, 280 200, 400 200" />
        </circle>
        <circle r="3" fill="hsl(var(--foreground))" filter="url(#glow-blue)" opacity="0.6">
          <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.8s" path="M 80 100 C 200 100, 280 200, 400 200" />
        </circle>
      </g>
    )}
    {isPvActive && (
      <g>
        <path d="M 80 200 L 400 200" fill="none" stroke="url(#cable-pv)" strokeWidth="3" strokeLinecap="round" />
        <circle r="5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.95">
          <animateMotion dur="1.8s" repeatCount="indefinite" path="M 80 200 L 400 200" />
        </circle>
        <circle r="3" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.6">
          <animateMotion dur="1.8s" repeatCount="indefinite" begin="0.6s" path="M 80 200 L 400 200" />
        </circle>
      </g>
    )}
    {isBatActive && (
      <g>
        <path d="M 80 300 C 200 300, 280 200, 400 200" fill="none" stroke="url(#cable-bat)" strokeWidth="3" strokeLinecap="round" />
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
    {isCharging && (
      <g>
        <path d="M 400 200 C 520 200, 600 140, 720 140" fill="none" stroke="url(#cable-pv)" strokeWidth="3" strokeLinecap="round" />
        <circle r="4" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.9">
          <animateMotion dur="2s" repeatCount="indefinite" path="M 400 200 C 520 200, 600 140, 720 140" />
        </circle>
        <path d="M 400 200 C 520 200, 600 260, 720 260" fill="none" stroke="url(#cable-pv)" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="3.5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.8">
          <animateMotion dur="2.3s" repeatCount="indefinite" begin="0.3s" path="M 400 200 C 520 200, 600 260, 720 260" />
        </circle>
      </g>
    )}
  </svg>
);

/* ===================== MOBILE CABLES ===================== */
const MobileCables = ({ isGridActive, isPvActive, isBatActive, isCharging, batKw }: CableProps) => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 600" preserveAspectRatio="xMidYMid meet">
    <SvgDefs />
    {/* Sources → Hub (top section) */}
    {isGridActive && (
      <g>
        <path d="M 60 60 C 60 120, 150 140, 150 180" fill="none" stroke="url(#cable-grid-v)" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="3" fill="hsl(var(--foreground))" filter="url(#glow-blue)" opacity="0.9">
          <animateMotion dur="2s" repeatCount="indefinite" path="M 60 60 C 60 120, 150 140, 150 180" />
        </circle>
      </g>
    )}
    {isPvActive && (
      <g>
        <path d="M 150 60 L 150 180" fill="none" stroke="url(#cable-pv-v)" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="4" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.95">
          <animateMotion dur="1.5s" repeatCount="indefinite" path="M 150 60 L 150 180" />
        </circle>
      </g>
    )}
    {isBatActive && (
      <g>
        <path d="M 240 60 C 240 120, 150 140, 150 180" fill="none" stroke="url(#cable-bat-v)" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="3" fill="hsl(var(--warning))" filter="url(#glow-yellow)" opacity="0.9">
          <animateMotion dur="2s" repeatCount="indefinite"
            path={batKw >= 0 ? "M 240 60 C 240 120, 150 140, 150 180" : "M 150 180 C 150 140, 240 120, 240 60"} />
        </circle>
      </g>
    )}
    {/* Hub → Consumers (bottom section) */}
    {isCharging && (
      <g>
        <path d="M 150 230 L 150 350" fill="none" stroke="url(#cable-pv-v)" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="3.5" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.9">
          <animateMotion dur="1.8s" repeatCount="indefinite" path="M 150 230 L 150 350" />
        </circle>
        <circle r="2" fill="hsl(var(--primary))" filter="url(#glow-green)" opacity="0.6">
          <animateMotion dur="1.8s" repeatCount="indefinite" begin="0.6s" path="M 150 230 L 150 350" />
        </circle>
      </g>
    )}
  </svg>
);

/* ===================== MOBILE LAYOUT ===================== */
const MobileLayout = ({ gridKw, solarPower, batteryData, batKw, isGridActive, isPvActive, isBatActive, chargingCps, availableCps, faultedCps }: LayoutProps) => (
  <div className="relative z-10 flex flex-col gap-3 min-h-[480px]">
    {/* Sources row */}
    <div className="grid grid-cols-3 gap-2">
      <NodeCard label="Grid" value={`${Math.abs(gridKw).toFixed(1)} kW`} subtitle={gridKw >= 0 ? 'Import' : 'Export'} color="foreground" active={isGridActive} small icon={<GridIcon />} />
      <NodeCard label="PV" value={`${solarPower.toFixed?.(1) ?? solarPower} kW`} color="primary" active={isPvActive} small icon={<SunIcon />} />
      <NodeCard label="Batterij" value={`${batteryData?.soc ?? 0}%`} subtitle={`${batKw || batteryData?.power || 0} kW`} color="warning" active={isBatActive} small icon={<BatteryIcon soc={batteryData?.soc ?? 0} />} />
    </div>

    {/* Hub */}
    <div className="flex justify-center py-6">
      <HubNode />
    </div>

    {/* Consumers */}
    <div className="space-y-2">
      {chargingCps.length > 0 ? (
        chargingCps.slice(0, 3).map(cp => (
          <NodeCard key={cp.id} label={cp.name} subtitle="Laden" color="primary" active small icon={<BoltIcon small />} />
        ))
      ) : (
        mockChargePoints.filter(cp => cp.status === 'Charging').slice(0, 2).map(cp => (
          <NodeCard key={cp.id} label={cp.name} subtitle={`${cp.connectors.reduce((a, c) => a + c.currentPower, 0).toFixed(1)} kW`} color="primary" active small icon={<BoltIcon small />} />
        ))
      )}
      {(availableCps.length > 0 || mockChargePoints.filter(cp => cp.status === 'Available').length > 0) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {availableCps.length || mockChargePoints.filter(cp => cp.status === 'Available').length} beschikbaar
          </span>
        </div>
      )}
      {faultedCps.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
          <div className="h-2 w-2 rounded-full bg-destructive" />
          <span className="text-[10px] text-destructive">{faultedCps.length} storing</span>
        </div>
      )}
    </div>
  </div>
);

/* ===================== DESKTOP LAYOUT ===================== */
const DesktopLayout = ({ gridKw, solarPower, batteryData, batKw, isGridActive, isPvActive, isBatActive, chargingCps, availableCps, faultedCps }: LayoutProps) => (
  <div className="relative z-10 grid grid-cols-5 gap-4 min-h-[320px] items-center">
    {/* Left: Sources */}
    <div className="col-span-1 space-y-4">
      <NodeCard label="Grid (net)" value={`${Math.abs(gridKw).toFixed(1)} kW`} subtitle={gridKw >= 0 ? 'Import' : 'Export'} color="foreground" active={isGridActive} icon={<GridIcon />} />
      <NodeCard label="Zonne-energie" value={`${solarPower.toFixed?.(1) ?? solarPower} kW`} color="primary" active={isPvActive} icon={<SunIcon />} />
      <NodeCard label="Batterij" value={`${batteryData?.soc ?? 0}%`} subtitle={`${batKw || batteryData?.power || 0} kW`} color="warning" active={isBatActive} icon={<BatteryIcon soc={batteryData?.soc ?? 0} />} />
    </div>

    {/* Center: Hub */}
    <div className="col-span-1 flex items-center justify-center col-start-3">
      <HubNode />
    </div>

    {/* Right: Consumers */}
    <div className="col-span-1 col-start-5 space-y-3">
      {chargingCps.length > 0 ? (
        chargingCps.slice(0, 3).map(cp => (
          <NodeCard key={cp.id} label={cp.name} subtitle="Laden" color="primary" active small icon={<BoltIcon small />} />
        ))
      ) : (
        mockChargePoints.filter(cp => cp.status === 'Charging').slice(0, 3).map(cp => (
          <NodeCard key={cp.id} label={cp.name} subtitle={`${cp.connectors.reduce((a, c) => a + c.currentPower, 0).toFixed(1)} kW`} color="primary" active small icon={<BoltIcon small />} />
        ))
      )}
      {(availableCps.length > 0 || mockChargePoints.filter(cp => cp.status === 'Available').length > 0) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {availableCps.length || mockChargePoints.filter(cp => cp.status === 'Available').length} beschikbaar
          </span>
        </div>
      )}
      {faultedCps.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
          <div className="h-2 w-2 rounded-full bg-destructive" />
          <span className="text-[10px] text-destructive">{faultedCps.length} storing</span>
        </div>
      )}
    </div>
  </div>
);

/* ===================== SHARED ICONS ===================== */
const GridIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7h18M3 17h18M7 3v18M17 3v18" strokeLinecap="round" />
  </svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" strokeLinecap="round" />
  </svg>
);
const BatteryIcon = ({ soc }: { soc: number }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="7" width="18" height="10" rx="2" />
    <path d="M22 11v2" strokeLinecap="round" />
    <rect x="4" y="9" width={`${soc * 0.14}`} height="6" rx="1" fill="currentColor" opacity="0.4" />
  </svg>
);
const BoltIcon = ({ small }: { small?: boolean }) => (
  <svg viewBox="0 0 24 24" className={small ? "h-4 w-4 md:h-5 md:w-5" : "h-5 w-5 md:h-6 md:w-6"} fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ===================== HUB NODE ===================== */
const HubNode = () => (
  <div className="relative">
    <div className="h-14 w-14 md:h-20 md:w-20 rounded-2xl border-2 border-primary/30 bg-primary/5 flex items-center justify-center backdrop-blur-sm">
      <svg viewBox="0 0 24 24" className="h-6 w-6 md:h-8 md:w-8 text-primary" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <div className="absolute inset-0 rounded-2xl border-2 border-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
      <span className="text-[9px] md:text-[10px] font-mono text-muted-foreground">EMS Hub</span>
    </div>
  </div>
);

/* ===================== NODE CARD ===================== */
const NodeCard = ({
  label, value, subtitle, color, active, icon, small,
}: {
  label: string; value?: string; subtitle?: string;
  color: 'primary' | 'warning' | 'destructive' | 'foreground';
  active: boolean; icon: React.ReactNode; small?: boolean;
}) => {
  const colorMap = {
    primary: { border: 'border-primary/30', bg: 'bg-primary/5', text: 'text-primary', dot: 'bg-primary' },
    warning: { border: 'border-warning/30', bg: 'bg-warning/5', text: 'text-warning', dot: 'bg-warning' },
    destructive: { border: 'border-destructive/30', bg: 'bg-destructive/5', text: 'text-destructive', dot: 'bg-destructive' },
    foreground: { border: 'border-border', bg: 'bg-muted/50', text: 'text-foreground', dot: 'bg-foreground' },
  };
  const c = colorMap[color];

  return (
    <div className={`relative rounded-xl border ${c.border} ${c.bg} ${small ? 'px-2.5 py-2 md:px-3 md:py-2.5' : 'px-3 py-2.5 md:px-4 md:py-3.5'} transition-all duration-500`}>
      {active && (
        <div className={`absolute top-1.5 right-1.5 md:top-2 md:right-2 h-1.5 w-1.5 md:h-2 md:w-2 rounded-full ${c.dot}`}>
          <div className={`absolute inset-0 rounded-full ${c.dot} animate-ping opacity-50`} />
        </div>
      )}
      <div className={`flex items-center gap-1.5 md:gap-2.5 ${c.text}`}>
        {icon}
        <div className="min-w-0">
          <p className={`${small ? 'text-[10px] md:text-[11px]' : 'text-[11px] md:text-xs'} font-medium truncate`}>{label}</p>
          {value && (
            <p className={`font-mono ${small ? 'text-xs md:text-sm' : 'text-sm md:text-lg'} font-bold leading-tight`}>{value}</p>
          )}
          {subtitle && (
            <p className="text-[9px] md:text-[10px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

/* ===================== TYPES ===================== */
interface CableProps {
  isGridActive: boolean;
  isPvActive: boolean;
  isBatActive: boolean;
  isCharging: boolean;
  batKw: number;
}

interface LayoutProps {
  gridKw: number; pvKw: number; batKw: number;
  solarPower: number; batteryData: any;
  isGridActive: boolean; isPvActive: boolean; isBatActive: boolean;
  hasAnyLive: boolean;
  chargingCps: { id: string; name: string; status: string }[];
  availableCps: { id: string; name: string; status: string }[];
  faultedCps: { id: string; name: string; status: string }[];
}

export default EnergyFlowRendering;
