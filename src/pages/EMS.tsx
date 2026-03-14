import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import MeterHistoryChart from '@/components/MeterHistoryChart';
import GridDetailsPanel from '@/components/GridDetailsPanel';
import EnergyFlowWidget from '@/components/EnergyFlowWidget';
import GtvMonitorWidget from '@/components/GtvMonitorWidget';
import LoadBalanceStatusWidget from '@/components/LoadBalanceStatusWidget';
import LoadBalanceHistoryWidget from '@/components/LoadBalanceHistoryWidget';
import ShellyDetailWidget from '@/components/ShellyDetailWidget';
import MeterAiModelWidget from '@/components/MeterAiModelWidget';

import { useEnergyMeters, useMeterReadings } from '@/hooks/useEnergyMeters';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useEnergyFlows } from '@/hooks/useEnergyFlows';
import { Cpu, Sun, Zap, BatteryCharging, ArrowDownUp, Radio } from 'lucide-react';
import { useMemo } from 'react';
import { useGridAlerts } from '@/hooks/useGridAlerts';

const EMS = () => {
  // Realtime subscription (includes meter_readings)
  useRealtimeSubscription();

  const { data: meters } = useEnergyMeters();
  const enabledMeter = meters?.find(m => m.enabled);
  // Fetch latest readings for all three channels
  const { data: readings } = useMeterReadings(enabledMeter?.id, 30);

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

  // Use real energy flows where available, fall back to mock
  const { flows } = useEnergyFlows();
  const gridFlow = flows.find(f => f.type === 'grid');
  const pvFlow = flows.find(f => f.type === 'pv');
  const batFlow = flows.find(f => f.type === 'battery');

  const gridPower = gridFlow?.totalPowerKw ?? (liveGridPower ?? 0);
  const solarPower = pvFlow?.totalPowerKw ?? 0;
  const batteryPower = batFlow?.totalPowerKw ?? 0;
  const evPower = 0;
  const totalConsumption = solarPower + Math.abs(batteryPower) + gridPower;
  const selfConsumption = totalConsumption > 0 ? Math.round(((solarPower + Math.abs(batteryPower)) / totalConsumption) * 100) : 0;

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {phases.map((p, i) => {
            const colors = [
              'border-primary/40 bg-primary/5',
              'border-chart-2/40 bg-chart-2/5',
              'border-chart-3/40 bg-chart-3/5',
            ];
            const labelColors = ['text-primary', 'text-chart-2', 'text-chart-3'];
            return (
              <div key={p.channel} className={`flex items-center gap-2 sm:gap-4 rounded-lg border px-3 sm:px-4 py-2 sm:py-2.5 ${colors[i] || colors[0]}`}>
                <span className={`text-xs font-semibold whitespace-nowrap ${labelColors[i] || labelColors[0]}`}>F{p.channel + 1}</span>
                <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-0.5 font-mono text-[11px] sm:text-xs text-muted-foreground">
                  {p.voltage != null && <span>{p.voltage} V</span>}
                  {p.current != null && <span>{p.current} A</span>}
                  {p.power != null && <span>{p.power} kW</span>}
                  {p.pf != null && <span>PF {p.pf}</span>}
                  {p.freq != null && <span>{p.freq} Hz</span>}
                </div>
              </div>
            );
          })}
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

      {/* Shelly Pro 3EM Detail Widget */}
      {enabledMeter && (
        <div className="mb-8">
          <ShellyDetailWidget meterId={enabledMeter.id} meterName={enabledMeter.name} />
        </div>
      )}

      {/* Energy Flow Diagram - reusable widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EnergyFlowWidget />
        </div>
        <GtvMonitorWidget />
      </div>

      {/* Load Balance Status + History */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LoadBalanceStatusWidget />
        <LoadBalanceHistoryWidget />
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
