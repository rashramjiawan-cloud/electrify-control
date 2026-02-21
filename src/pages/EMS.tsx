import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import MeterHistoryChart from '@/components/MeterHistoryChart';
import GridDetailsPanel from '@/components/GridDetailsPanel';
import { mockEMS } from '@/data/mockData';
import { useEnergyMeters, useMeterReadings } from '@/hooks/useEnergyMeters';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Cpu, Sun, Zap, BatteryCharging, ArrowDownUp, Radio } from 'lucide-react';
import { useMemo } from 'react';
import { useGridAlerts } from '@/hooks/useGridAlerts';

const EMS = () => {
  // Realtime subscription (includes meter_readings)
  useRealtimeSubscription();

  const { data: meters } = useEnergyMeters();
  const enabledMeter = meters?.find(m => m.enabled);
  // Fetch latest readings for both channels
  const { data: readings } = useMeterReadings(enabledMeter?.id, 10);

  // Derive per-phase live data from latest Shelly readings
  const { liveGridPower, phases, isLive } = useMemo(() => {
    if (!readings?.length) return { liveGridPower: null, phases: [] as any[], isLive: false };

    // Group latest reading per channel
    const latestByChannel = new Map<number, typeof readings[0]>();
    for (const r of readings) {
      const ch = r.channel ?? 0;
      if (!latestByChannel.has(ch)) latestByChannel.set(ch, r);
    }

    let totalPower = 0;
    const phases = Array.from(latestByChannel.entries())
      .sort(([a], [b]) => a - b)
      .map(([ch, r]) => {
        const power = r.active_power != null ? +(r.active_power / 1000).toFixed(2) : null;
        if (power != null) totalPower += power;
        return {
          channel: ch,
          power,
          current: r.current != null ? +Number(r.current).toFixed(1) : null,
          voltage: r.voltage != null ? +Number(r.voltage).toFixed(1) : null,
          pf: r.power_factor != null ? +Number(r.power_factor).toFixed(2) : null,
          freq: r.frequency != null ? +Number(r.frequency).toFixed(1) : null,
        };
      });

    return {
      liveGridPower: phases.length ? +totalPower.toFixed(2) : null,
      phases,
      isLive: phases.length > 0,
    };
  }, [readings]);

  // Alert when voltage/frequency/PF out of range
  useGridAlerts(phases, isLive, enabledMeter?.id);

  const gridPower = liveGridPower ?? mockEMS.gridPower;

  // Recalculate totals when live data available
  const solarPower = mockEMS.solarPower;
  const batteryPower = mockEMS.batteryPower;
  const evPower = mockEMS.evPower;
  const totalConsumption = solarPower + Math.abs(batteryPower) + gridPower;
  const selfConsumption = totalConsumption > 0 ? Math.round(((solarPower + Math.abs(batteryPower)) / totalConsumption) * 100) : 0;

  const flowItems = [
    { label: 'Grid Import', value: gridPower, unit: 'kW', icon: ArrowDownUp, color: 'text-foreground', live: isLive, phases },
    { label: 'Zonne-energie', value: solarPower, unit: 'kW', icon: Sun, color: 'text-primary', live: false, phases: [] as any[] },
    { label: 'Batterij', value: batteryPower, unit: 'kW', icon: BatteryCharging, color: batteryPower < 0 ? 'text-warning' : 'text-primary', live: false, phases: [] as any[] },
    { label: 'EV Laden', value: evPower, unit: 'kW', icon: Zap, color: 'text-foreground', live: false, phases: [] as any[] },
  ];

  return (
    <AppLayout title="Energy Management System" subtitle="Realtime energiebalans en optimalisatie">
      {/* Per-phase Grid Import cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Grid Import"
          value={gridPower}
          unit="kW"
          icon={ArrowDownUp}
          variant={isLive ? 'primary' : 'default'}
        />
        <StatCard title="Zonne-energie" value={solarPower} unit="kW" icon={Sun} variant="primary" />
        <StatCard title="Totaal verbruik" value={totalConsumption.toFixed(1)} unit="kW" icon={Cpu} />
        <StatCard title="Eigen verbruik" value={selfConsumption} unit="%" icon={Cpu} variant="primary" trend={{ value: 5, label: 'vs gisteren' }} />
      </div>

      {/* Per-phase detail strip */}
      {isLive && phases.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {phases.map((p) => (
            <div key={p.channel} className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
              <span className="text-xs font-semibold text-foreground whitespace-nowrap">Fase {p.channel + 1}</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 font-mono text-xs text-muted-foreground">
                {p.voltage != null && <span>{p.voltage} V</span>}
                {p.current != null && <span>{p.current} A</span>}
                {p.power != null && <span>{p.power} kW</span>}
                {p.pf != null && <span>PF {p.pf}</span>}
                {p.freq != null && <span>{p.freq} Hz</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live indicator */}
      {isLive && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
          </span>
          <span className="text-xs text-muted-foreground">
            Live data via <span className="font-medium text-foreground">{enabledMeter?.name || 'Shelly PRO EM-50'}</span>
          </span>
        </div>
      )}

      {/* Energy Flow Diagram */}
      <div className="rounded-xl border border-border bg-card p-8">
        <h2 className="text-sm font-semibold text-foreground mb-8">Energieflow</h2>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {flowItems.map((item) => (
            <div key={item.label} className="flex flex-col items-center text-center p-6 rounded-xl bg-muted/50 border border-border relative">
              {item.live && (
                <div className="absolute top-3 right-3">
                  <Radio className="h-3.5 w-3.5 text-primary animate-pulse" />
                </div>
              )}
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <item.icon className="h-7 w-7 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground mb-1">{item.label}</span>
              <span className={`font-mono text-2xl font-bold ${item.color}`}>
                {item.value > 0 && item.label === 'Batterij' ? '+' : ''}{item.value}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{item.unit}</span>
              {item.phases.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-2 text-left w-full">
                  {item.phases.map((p: any) => (
                    <div key={p.channel} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">F{p.channel + 1}</span>
                      {p.current != null && <span>{p.current}A</span>}
                      {p.voltage != null && <span>{p.voltage}V</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Balance Bar */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Energiebalans</span>
            <span className="font-mono text-xs text-primary">{selfConsumption}% eigen verbruik</span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden flex">
            <div
              className="bg-primary h-full transition-all duration-700"
              style={{ width: `${totalConsumption > 0 ? (solarPower / totalConsumption) * 100 : 0}%` }}
              title="Zon"
            />
            <div
              className="bg-warning h-full transition-all duration-700"
              style={{ width: `${totalConsumption > 0 ? (Math.abs(batteryPower) / totalConsumption) * 100 : 0}%` }}
              title="Batterij"
            />
            <div
              className="bg-muted-foreground/30 h-full transition-all duration-700"
              style={{ width: `${totalConsumption > 0 ? (gridPower / totalConsumption) * 100 : 0}%` }}
              title="Grid"
            />
          </div>
          <div className="flex items-center gap-6 mt-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
              <span className="text-xs text-muted-foreground">Zon</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm bg-warning" />
              <span className="text-xs text-muted-foreground">Batterij</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
              <span className="text-xs text-muted-foreground">Grid</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Details Panel */}
      <div className="mt-8">
        <GridDetailsPanel />
      </div>

      {/* Meter History Chart */}
      <div className="mt-8">
        <MeterHistoryChart />
      </div>
    </AppLayout>
  );
};

export default EMS;
