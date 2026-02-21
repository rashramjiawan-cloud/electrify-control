import { useState } from 'react';
import { useLoadBalanceLogs } from '@/hooks/useLoadBalanceLogs';
import { useVirtualGrids } from '@/hooks/useVirtualGrids';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { History, Zap, BatteryCharging, Radio, Sun, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const typeIcons: Record<string, typeof Zap> = {
  battery: BatteryCharging,
  energy_meter: Radio,
  charge_point: Zap,
  solar: Sun,
};

const LoadBalanceHistoryWidget = () => {
  const { data: grids = [] } = useVirtualGrids();
  const [selectedGrid, setSelectedGrid] = useState<string>('all');

  const gridId = selectedGrid === 'all' ? undefined : selectedGrid;
  const { data: logs = [], isLoading } = useLoadBalanceLogs(gridId, 30);

  if (grids.length === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Load Balance Historie</CardTitle>
          </div>
          <Select value={selectedGrid} onValueChange={setSelectedGrid}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Alle grids" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle grids</SelectItem>
              {grids.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground text-center py-4">Laden...</p>
        )}

        {!isLoading && logs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nog geen historische data. Resultaten verschijnen na de volgende load balance run.
          </p>
        )}

        {logs.map((log, idx) => {
          const usagePct = log.gtv_limit_kw > 0
            ? (log.total_allocated_kw / log.gtv_limit_kw) * 100
            : 0;
          const isNearLimit = usagePct > 85;

          // Compare with previous log to show trend
          const prevLog = logs[idx + 1];
          const trend = prevLog
            ? log.total_allocated_kw - prevLog.total_allocated_kw
            : 0;

          return (
            <div key={log.id} className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{log.grid_name}</span>
                  <Badge variant="outline" className="text-[9px] capitalize">
                    {log.strategy.replace('_', ' ')}
                  </Badge>
                  {isNearLimit && (
                    <Badge variant="destructive" className="text-[9px]">Bijna limiet</Badge>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(log.created_at), 'dd MMM HH:mm', { locale: nl })}
                </span>
              </div>

              {/* Usage summary */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs">
                    <span className="font-bold text-primary">{log.total_allocated_kw}</span>
                    <span className="text-muted-foreground"> / {log.gtv_limit_kw} kW</span>
                  </span>
                  {trend !== 0 && (
                    <span className={`flex items-center gap-0.5 text-[10px] ${trend > 0 ? 'text-destructive' : 'text-primary'}`}>
                      {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(trend).toFixed(1)} kW
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">{usagePct.toFixed(0)}%</span>
              </div>

              {/* Mini bar */}
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isNearLimit ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ width: `${Math.min(usagePct, 100)}%` }}
                />
              </div>

              {/* Compact allocations */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {(log.allocations || []).slice(0, 4).map((a: any) => {
                  const Icon = typeIcons[a.member_type] || Zap;
                  return (
                    <span key={a.member_id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Icon className="h-2.5 w-2.5" />
                      <span className="truncate max-w-[80px]">{a.member_name}</span>
                      <span className="font-mono font-bold text-foreground">{a.allocated_kw}kW</span>
                    </span>
                  );
                })}
                {(log.allocations || []).length > 4 && (
                  <span className="text-[10px] text-muted-foreground">+{log.allocations.length - 4}</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default LoadBalanceHistoryWidget;
