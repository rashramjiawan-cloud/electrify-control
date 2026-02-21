import { useMemo } from 'react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useEnergyFlows } from '@/hooks/useEnergyFlows';
import { Gauge, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const GtvMonitorWidget = () => {
  const { getSetting, isLoading: settingsLoading } = useSystemSettings();
  const { flows, isLoading: flowsLoading, hasAnyLive } = useEnergyFlows();

  const isLoading = settingsLoading || flowsLoading;

  const gtvImport = Number(getSetting('gtv_import_kw')?.value ?? 150);
  const gtvExport = Number(getSetting('gtv_export_kw')?.value ?? 150);
  const warningPct = Number(getSetting('gtv_warning_pct')?.value ?? 80);
  const gridOperator = getSetting('gtv_grid_operator')?.value ?? 'Onbekend';

  const gridFlow = flows.find(f => f.type === 'grid');
  const currentPowerKw = gridFlow?.totalPowerKw ?? 0;

  // Positive = import, negative = export
  const isImporting = currentPowerKw >= 0;
  const absCurrentKw = Math.abs(currentPowerKw);
  const activeLimit = isImporting ? gtvImport : gtvExport;
  const usagePct = activeLimit > 0 ? Math.round((absCurrentKw / activeLimit) * 100) : 0;
  const warningThresholdKw = (activeLimit * warningPct) / 100;

  const status = useMemo(() => {
    if (absCurrentKw >= activeLimit) return 'critical';
    if (absCurrentKw >= warningThresholdKw) return 'warning';
    return 'ok';
  }, [absCurrentKw, activeLimit, warningThresholdKw]);

  const statusColor = {
    ok: 'text-primary',
    warning: 'text-warning',
    critical: 'text-destructive',
  }[status];

  const barColor = {
    ok: 'bg-primary',
    warning: 'bg-warning',
    critical: 'bg-destructive',
  }[status];

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">GTV Bewaking</h2>
        </div>
        <div className="flex items-center gap-2">
          {status === 'critical' && <AlertTriangle className="h-3.5 w-3.5 text-destructive animate-pulse" />}
          {status === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
          <span className="text-[10px] text-muted-foreground">{gridOperator}</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Current power vs limit */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isImporting ? (
              <ArrowDown className={`h-4 w-4 ${statusColor}`} />
            ) : (
              <ArrowUp className={`h-4 w-4 ${statusColor}`} />
            )}
            <span className="text-xs text-muted-foreground">
              {isImporting ? 'Afname' : 'Teruglevering'}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`font-mono text-2xl font-bold ${statusColor}`}>
              {absCurrentKw}
            </span>
            <span className="text-xs text-muted-foreground">/ {activeLimit} kW</span>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-4 rounded-full bg-muted overflow-hidden relative">
            {/* Warning threshold marker */}
            <div
              className="absolute top-0 bottom-0 w-px bg-warning/60 z-10"
              style={{ left: `${Math.min(warningPct, 100)}%` }}
            />
            {/* Current usage */}
            <div
              className={`${barColor} h-full transition-all duration-700 rounded-full`}
              style={{ width: `${Math.min(usagePct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground">0 kW</span>
            <span className={`font-mono text-[10px] font-semibold ${statusColor}`}>{usagePct}%</span>
            <span className="text-[10px] text-muted-foreground">{activeLimit} kW</span>
          </div>
        </div>

        {/* Import / Export limits */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <ArrowDown className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Afname</span>
            </div>
            <span className="font-mono text-sm font-bold text-foreground">{gtvImport} kW</span>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <ArrowUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Teruglevering</span>
            </div>
            <span className="font-mono text-sm font-bold text-foreground">{gtvExport} kW</span>
          </div>
        </div>

        {/* Status message */}
        {status === 'critical' && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            ⚠️ GTV-limiet overschreden! Huidig vermogen ({absCurrentKw} kW) overschrijdt het gecontracteerde maximum ({activeLimit} kW).
          </div>
        )}
        {status === 'warning' && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
            ⚡ Waarschuwing: {usagePct}% van het GTV-limiet bereikt. Smart charging wordt aangepast.
          </div>
        )}
      </div>
    </div>
  );
};

export default GtvMonitorWidget;
