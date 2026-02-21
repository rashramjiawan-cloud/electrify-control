import { useState } from 'react';
import { VirtualGrid } from '@/hooks/useVirtualGrids';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Scale, Loader2, BatteryCharging, Zap, Radio, Sun, CheckCircle2, AlertCircle } from 'lucide-react';

const typeIcons: Record<string, typeof Zap> = {
  battery: BatteryCharging,
  energy_meter: Radio,
  charge_point: Zap,
  solar: Sun,
};

interface Allocation {
  member_id: string;
  member_name: string;
  member_type: string;
  allocated_kw: number;
  max_kw: number;
  percentage: number;
}

interface BalanceResponse {
  grid_id: string;
  grid_name: string;
  strategy: string;
  total_available_kw: number;
  gtv_limit_kw: number;
  allocations: Allocation[];
}

interface Props {
  grid: VirtualGrid;
}

const LoadBalancerButton = ({ grid }: Props) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BalanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBalance = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('grid-load-balancer', {
        body: { grid_id: grid.id },
      });
      if (fnError) throw fnError;
      setResult(data as BalanceResponse);
    } catch (e: any) {
      setError(e?.message || 'Load balancing mislukt');
    } finally {
      setLoading(false);
    }
  };

  const totalAllocated = result?.allocations.reduce((s, a) => s + a.allocated_kw, 0) ?? 0;

  return (
    <div className="mt-4">
      <Button
        onClick={handleBalance}
        disabled={loading || !grid.enabled}
        variant="outline"
        className="w-full gap-2 h-9 text-xs"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Scale className="h-3.5 w-3.5" />
        )}
        {loading ? 'Balanceren...' : 'Load Balance Uitvoeren'}
      </Button>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3 animate-in fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold">Balancing Resultaat</span>
            </div>
            <Badge variant="outline" className="text-[9px] capitalize">
              {result.strategy.replace('_', ' ')}
            </Badge>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-card border border-border p-2 text-center">
              <p className="font-mono text-sm font-bold text-primary">{totalAllocated.toFixed(1)}</p>
              <p className="text-[9px] text-muted-foreground">Toegewezen kW</p>
            </div>
            <div className="rounded-md bg-card border border-border p-2 text-center">
              <p className="font-mono text-sm font-bold">{result.gtv_limit_kw}</p>
              <p className="text-[9px] text-muted-foreground">GTV Limiet kW</p>
            </div>
          </div>

          {/* Per-member allocations */}
          <div className="space-y-2">
            {result.allocations.map((a) => {
              const Icon = typeIcons[a.member_type] || Zap;
              const pct = a.max_kw > 0 ? (a.allocated_kw / a.max_kw) * 100 : 0;
              return (
                <div key={a.member_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] font-medium truncate">{a.member_name}</span>
                    </div>
                    <span className="text-[11px] font-mono">
                      <span className="font-bold">{a.allocated_kw}</span>
                      <span className="text-muted-foreground"> / {a.max_kw} kW</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadBalancerButton;
