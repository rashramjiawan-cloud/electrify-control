import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVirtualGrids } from '@/hooks/useVirtualGrids';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Scale, RefreshCw, CheckCircle2, AlertCircle, Zap, BatteryCharging, Radio, Sun, Loader2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

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

interface GridResult {
  grid_id: string;
  grid_name: string;
  strategy: string;
  total_available_kw: number;
  gtv_limit_kw: number;
  allocations: Allocation[];
}

interface BatchResponse {
  mode: string;
  grids_processed: number;
  results: GridResult[];
}

const LoadBalanceStatusWidget = () => {
  const { data: grids = [] } = useVirtualGrids();
  const enabledGrids = grids.filter(g => g.enabled);

  const [results, setResults] = useState<GridResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  const fetchResults = useCallback(async () => {
    if (enabledGrids.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('grid-load-balancer', {
        body: {},
      });
      if (fnError) throw fnError;
      const batch = data as BatchResponse;
      setResults(batch.results || []);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message || 'Kon load balance status niet ophalen');
    } finally {
      setLoading(false);
    }
  }, [enabledGrids.length]);

  // Auto-fetch on mount and every 5 minutes
  useEffect(() => {
    if (enabledGrids.length > 0) {
      fetchResults();
    }
    const interval = setInterval(() => {
      if (enabledGrids.length > 0) fetchResults();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [enabledGrids.length, fetchResults]);

  // Update relative time display
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (enabledGrids.length === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Load Balance Status</CardTitle>
            {/* Live pulse */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: nl })}
              </span>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchResults} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {loading && results.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {results.map((r) => {
          const totalAllocated = r.allocations.reduce((s, a) => s + a.allocated_kw, 0);
          const usagePct = r.gtv_limit_kw > 0 ? (totalAllocated / r.gtv_limit_kw) * 100 : 0;
          const isNearLimit = usagePct > 85;

          return (
            <div key={r.grid_id} className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
              {/* Grid header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">{r.grid_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] capitalize">
                    {r.strategy.replace('_', ' ')}
                  </Badge>
                  {isNearLimit && (
                    <Badge variant="destructive" className="text-[9px]">
                      Bijna limiet
                    </Badge>
                  )}
                </div>
              </div>

              {/* Usage bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">
                    Capaciteitsgebruik
                  </span>
                  <span className="font-mono text-xs">
                    <span className="font-bold text-primary">{totalAllocated.toFixed(1)}</span>
                    <span className="text-muted-foreground"> / {r.gtv_limit_kw} kW</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      isNearLimit ? 'bg-destructive' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5 text-right">{usagePct.toFixed(0)}%</p>
              </div>

              {/* Top allocations (compact) */}
              <div className="grid grid-cols-2 gap-1.5">
                {r.allocations.slice(0, 4).map((a) => {
                  const Icon = typeIcons[a.member_type] || Zap;
                  return (
                    <div key={a.member_id} className="flex items-center gap-1.5 text-[10px]">
                      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{a.member_name}</span>
                      <span className="ml-auto font-mono font-bold shrink-0">{a.allocated_kw}kW</span>
                    </div>
                  );
                })}
              </div>
              {r.allocations.length > 4 && (
                <p className="text-[9px] text-muted-foreground">+{r.allocations.length - 4} meer</p>
              )}
            </div>
          );
        })}

        {!loading && results.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">Geen actieve grids gevonden</p>
        )}

        <p className="text-[9px] text-muted-foreground text-center">
          Automatisch elke 5 minuten · {enabledGrids.length} actieve grid(s)
        </p>
      </CardContent>
    </Card>
  );
};

export default LoadBalanceStatusWidget;
