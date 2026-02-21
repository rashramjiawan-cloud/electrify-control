import { useEffect, useState } from 'react';
import { VirtualGrid, VirtualGridMember, useVirtualGridMembers } from '@/hooks/useVirtualGrids';
import { supabase } from '@/integrations/supabase/client';
import { BatteryCharging, Zap, Radio, Sun, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const typeIcons: Record<string, typeof Zap> = {
  battery: BatteryCharging,
  energy_meter: Radio,
  charge_point: Zap,
  solar: Sun,
};

const typeColors: Record<string, string> = {
  battery: 'hsl(var(--chart-1))',
  energy_meter: 'hsl(var(--chart-2))',
  charge_point: 'hsl(var(--chart-3))',
  solar: 'hsl(var(--chart-4))',
};

const typeBgClasses: Record<string, string> = {
  battery: 'bg-chart-1',
  energy_meter: 'bg-chart-2',
  charge_point: 'bg-chart-3',
  solar: 'bg-chart-4',
};

interface Props {
  grid: VirtualGrid;
}

interface MemberPower {
  memberId: string;
  currentPower: number;
  allocatedPower: number;
}

const VirtualGridPowerWidget = ({ grid }: Props) => {
  const { data: members = [] } = useVirtualGridMembers(grid.id);
  const [powerData, setPowerData] = useState<Map<string, MemberPower>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Simulate realtime power data based on members — in production this comes from meter_readings / connectors
  useEffect(() => {
    if (members.length === 0) return;

    const simulatePower = () => {
      const totalAvailable = grid.gtv_limit_kw;
      const newPower = new Map<string, MemberPower>();

      const enabledMembers = members.filter(m => m.enabled);
      const totalMaxPower = enabledMembers.reduce((s, m) => s + (m.max_power_kw || 0), 0);

      enabledMembers.forEach(m => {
        const proportionalShare = totalMaxPower > 0
          ? ((m.max_power_kw || 0) / totalMaxPower) * totalAvailable
          : 0;
        // Add some realistic variance (±15%)
        const variance = 0.85 + Math.random() * 0.3;
        const currentPower = Math.min(
          proportionalShare * variance,
          m.max_power_kw || 0
        );

        newPower.set(m.id, {
          memberId: m.id,
          currentPower: Math.round(currentPower * 100) / 100,
          allocatedPower: Math.round(proportionalShare * 100) / 100,
        });
      });

      // Disabled members get 0
      members.filter(m => !m.enabled).forEach(m => {
        newPower.set(m.id, {
          memberId: m.id,
          currentPower: 0,
          allocatedPower: 0,
        });
      });

      setPowerData(newPower);
      setLastUpdate(new Date());
    };

    simulatePower();
    const interval = setInterval(simulatePower, 3000);
    return () => clearInterval(interval);
  }, [members, grid.gtv_limit_kw]);

  // Subscribe to realtime changes on virtual_grid_members
  useEffect(() => {
    const channel = supabase
      .channel(`grid-members-${grid.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'virtual_grid_members',
        filter: `grid_id=eq.${grid.id}`,
      }, () => {
        // Query client invalidation happens via the hook; this just triggers visual refresh
        setLastUpdate(new Date());
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [grid.id]);

  const totalCurrent = Array.from(powerData.values()).reduce((s, p) => s + p.currentPower, 0);
  const totalAllocated = Array.from(powerData.values()).reduce((s, p) => s + p.allocatedPower, 0);
  const utilizationPct = grid.gtv_limit_kw > 0
    ? Math.min((totalCurrent / grid.gtv_limit_kw) * 100, 100)
    : 0;

  if (members.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Live Vermogensverdeling</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">
            {lastUpdate.toLocaleTimeString('nl-NL')}
          </span>
        </div>
      </div>

      {/* Total utilization bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Totaal verbruik</span>
          <span className="text-xs font-mono font-bold">
            {totalCurrent.toFixed(1)} / {grid.gtv_limit_kw} kW
          </span>
        </div>
        <div className="h-3 rounded-full bg-muted/50 overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${utilizationPct}%`,
              background: utilizationPct > 90
                ? 'hsl(var(--destructive))'
                : utilizationPct > 70
                  ? 'hsl(var(--chart-5))'
                  : 'hsl(var(--primary))',
            }}
          />
          {/* GTV limit marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-destructive/60"
            style={{ left: '100%' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <Badge
            variant={utilizationPct > 90 ? 'destructive' : 'secondary'}
            className="text-[9px] px-1.5"
          >
            {utilizationPct.toFixed(0)}% benut
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {(grid.gtv_limit_kw - totalCurrent).toFixed(1)} kW beschikbaar
          </span>
        </div>
      </div>

      {/* Per-member power bars */}
      <div className="space-y-3">
        {members.map(m => {
          const power = powerData.get(m.id);
          const current = power?.currentPower ?? 0;
          const maxPower = m.max_power_kw || 1;
          const pct = Math.min((current / maxPower) * 100, 100);
          const Icon = typeIcons[m.member_type] || Zap;
          const barColor = typeColors[m.member_type] || 'hsl(var(--primary))';
          const bgClass = typeBgClasses[m.member_type] || 'bg-primary';

          return (
            <div key={m.id} className="group">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium truncate flex-1">
                  {m.member_name || m.member_id}
                </span>
                <span className="text-xs font-mono tabular-nums text-right min-w-[80px]">
                  <span className="font-bold">{current.toFixed(1)}</span>
                  <span className="text-muted-foreground"> / {maxPower} kW</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: m.enabled ? `${pct}%` : '0%',
                      backgroundColor: barColor,
                      opacity: m.enabled ? 1 : 0.3,
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
                  {m.enabled ? `${pct.toFixed(0)}%` : 'Uit'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Strategy indicator */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Strategie</span>
        <Badge variant="outline" className="text-[10px] capitalize">
          {grid.balancing_strategy.replace('_', ' ')}
        </Badge>
      </div>
    </div>
  );
};

export default VirtualGridPowerWidget;
