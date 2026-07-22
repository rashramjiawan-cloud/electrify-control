import { Plug } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import type { ChargePointStatus } from '@/types/energy';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';

interface ConnectorRowProps {
  connector: any;
  maxKw: number;
}

/**
 * Real-time connector bar. Reads `current_power` from the connectors table
 * (kept up-to-date by ocpp-handler on MeterValues events + Supabase Realtime)
 * and smoothly animates the displayed kW between discrete OCPP updates.
 */
const ConnectorRow = ({ connector, maxKw }: ConnectorRowProps) => {
  const status = connector.status as string;
  const isCharging = status === 'Charging';
  const targetKw = Number(connector.current_power) || 0;
  const kw = useAnimatedNumber(targetKw, 1200);
  const pct = Math.min(100, Math.max(0, (kw / (maxKw || 22)) * 100));

  const connBg =
    status === 'Charging' ? 'bg-primary/10 border border-primary/30'
    : status === 'Available' ? 'bg-success/10 border border-success/30'
    : status === 'Preparing' || status === 'SuspendedEV' || status === 'Finishing' ? 'bg-warning/10 border border-warning/30'
    : status === 'Faulted' ? 'bg-destructive/10 border border-destructive/30'
    : 'bg-muted/50 border border-border';

  const connIconColor =
    status === 'Charging' ? 'text-primary'
    : status === 'Available' ? 'text-success'
    : status === 'Preparing' || status === 'SuspendedEV' || status === 'Finishing' ? 'text-warning'
    : status === 'Faulted' ? 'text-destructive'
    : 'text-muted-foreground';

  return (
    <div className={`relative overflow-hidden rounded-lg px-4 py-2.5 ${connBg}`}>
      {isCharging && (
        <>
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/30 via-primary/20 to-primary/40 transition-[width] duration-1000 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-[shimmer_2s_linear_infinite]"
            style={{ width: `${pct}%`, backgroundSize: '200% 100%' }}
          />
        </>
      )}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plug className={`h-3.5 w-3.5 ${connIconColor} ${isCharging ? 'animate-pulse' : ''}`} />
          <span className="font-mono text-xs text-muted-foreground">Connector {connector.connector_id}</span>
          <StatusBadge status={connector.status as ChargePointStatus} />
        </div>
        <div className="flex items-center gap-4">
          {isCharging && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="font-mono text-sm text-primary font-bold tabular-nums">
                {kw.toFixed(1)} kW
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                / {maxKw} kW
              </span>
            </div>
          )}
          {!isCharging && targetKw > 0 && (
            <span className="font-mono text-sm text-primary font-medium">{targetKw} kW</span>
          )}
          {connector.activeTransaction && (
            <span className="font-mono text-xs text-muted-foreground">
              TX #{connector.activeTransaction.id} · {connector.activeTransaction.idTag}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectorRow;
