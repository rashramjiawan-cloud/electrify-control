import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import MeterHistoryChart from '@/components/MeterHistoryChart';
import { mockEMS } from '@/data/mockData';
import { useEnergyMeters, useMeterReadings } from '@/hooks/useEnergyMeters';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Cpu, Sun, Zap, BatteryCharging, ArrowDownUp, Radio } from 'lucide-react';
import { useMemo } from 'react';

const EMS = () => {
  // Realtime subscription (includes meter_readings)
  useRealtimeSubscription();

  const { data: meters } = useEnergyMeters();
  const enabledMeter = meters?.find(m => m.enabled);
  const { data: readings } = useMeterReadings(enabledMeter?.id, 1);

  // Derive grid power and current from latest Shelly reading
  const { liveGridPower, liveCurrent, liveVoltage, livePF, liveFreq } = useMemo(() => {
    if (!readings?.length) return { liveGridPower: null, liveCurrent: null, liveVoltage: null, livePF: null, liveFreq: null };
    const r = readings[0];
    const power = r?.active_power != null ? +(r.active_power / 1000).toFixed(2) : null;
    const current = r?.current != null ? +Number(r.current).toFixed(1) : null;
    const voltage = r?.voltage != null ? +Number(r.voltage).toFixed(1) : null;
    const pf = r?.power_factor != null ? +Number(r.power_factor).toFixed(2) : null;
    const freq = r?.frequency != null ? +Number(r.frequency).toFixed(1) : null;
    return { liveGridPower: power, liveCurrent: current, liveVoltage: voltage, livePF: pf, liveFreq: freq };
  }, [readings]);

  const gridPower = liveGridPower ?? mockEMS.gridPower;
  const isLive = liveGridPower !== null;

  // Recalculate totals when live data available
  const solarPower = mockEMS.solarPower;
  const batteryPower = mockEMS.batteryPower;
  const evPower = mockEMS.evPower;
  const totalConsumption = solarPower + Math.abs(batteryPower) + gridPower;
  const selfConsumption = totalConsumption > 0 ? Math.round(((solarPower + Math.abs(batteryPower)) / totalConsumption) * 100) : 0;

  const flowItems = [
    { label: 'Grid Import', value: gridPower, unit: 'kW', icon: ArrowDownUp, color: 'text-foreground', live: isLive, ampere: liveCurrent, volt: liveVoltage, pf: livePF, freq: liveFreq },
    { label: 'Zonne-energie', value: solarPower, unit: 'kW', icon: Sun, color: 'text-primary', live: false },
    { label: 'Batterij', value: batteryPower, unit: 'kW', icon: BatteryCharging, color: batteryPower < 0 ? 'text-warning' : 'text-primary', live: false },
    { label: 'EV Laden', value: evPower, unit: 'kW', icon: Zap, color: 'text-foreground', live: false },
  ];

  return (
    <AppLayout title="Energy Management System" subtitle="Realtime energiebalans en optimalisatie">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Grid Import"
          value={gridPower}
          unit={liveCurrent != null ? `kW · ${liveCurrent} A · ${liveVoltage ?? '—'} V` : 'kW'}
          icon={ArrowDownUp}
          variant={isLive ? 'primary' : 'default'}
        />
        <StatCard title="Zonne-energie" value={solarPower} unit="kW" icon={Sun} variant="primary" />
        <StatCard title="Totaal verbruik" value={totalConsumption.toFixed(1)} unit="kW" icon={Cpu} />
        <StatCard title="Eigen verbruik" value={selfConsumption} unit="%" icon={Cpu} variant="primary" trend={{ value: 5, label: 'vs gisteren' }} />
      </div>

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
              {'ampere' in item && item.ampere != null && (
                <span className="font-mono text-sm text-muted-foreground mt-1">{item.ampere} A</span>
              )}
              {'volt' in item && item.volt != null && (
                <span className="font-mono text-sm text-muted-foreground">{item.volt} V</span>
              )}
              {('pf' in item && item.pf != null || 'freq' in item && item.freq != null) && (
                <div className="flex items-center gap-2 mt-1">
                  {'pf' in item && item.pf != null && (
                    <span className="font-mono text-xs text-muted-foreground">PF {item.pf}</span>
                  )}
                  {'freq' in item && item.freq != null && (
                    <span className="font-mono text-xs text-muted-foreground">{item.freq} Hz</span>
                  )}
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

      {/* Meter History Chart */}
      <div className="mt-8">
        <MeterHistoryChart />
      </div>
    </AppLayout>
  );
};

export default EMS;
