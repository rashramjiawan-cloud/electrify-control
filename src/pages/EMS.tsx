import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import { mockEMS } from '@/data/mockData';
import { Cpu, Sun, Zap, BatteryCharging, ArrowDownUp } from 'lucide-react';

const flowItems = [
  { label: 'Grid Import', value: mockEMS.gridPower, unit: 'kW', icon: ArrowDownUp, color: 'text-foreground' },
  { label: 'Zonne-energie', value: mockEMS.solarPower, unit: 'kW', icon: Sun, color: 'text-primary' },
  { label: 'Batterij', value: mockEMS.batteryPower, unit: 'kW', icon: BatteryCharging, color: mockEMS.batteryPower < 0 ? 'text-warning' : 'text-primary' },
  { label: 'EV Laden', value: mockEMS.evPower, unit: 'kW', icon: Zap, color: 'text-foreground' },
];

const EMS = () => {
  return (
    <AppLayout title="Energy Management System" subtitle="Realtime energiebalans en optimalisatie">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Grid Import" value={mockEMS.gridPower} unit="kW" icon={ArrowDownUp} />
        <StatCard title="Zonne-energie" value={mockEMS.solarPower} unit="kW" icon={Sun} variant="primary" />
        <StatCard title="Totaal verbruik" value={mockEMS.totalConsumption} unit="kW" icon={Cpu} />
        <StatCard title="Eigen verbruik" value={mockEMS.selfConsumption} unit="%" icon={Cpu} variant="primary" trend={{ value: 5, label: 'vs gisteren' }} />
      </div>

      {/* Energy Flow Diagram */}
      <div className="rounded-xl border border-border bg-card p-8">
        <h2 className="text-sm font-semibold text-foreground mb-8">Energieflow</h2>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {flowItems.map((item) => (
            <div key={item.label} className="flex flex-col items-center text-center p-6 rounded-xl bg-muted/50 border border-border">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <item.icon className="h-7 w-7 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground mb-1">{item.label}</span>
              <span className={`font-mono text-2xl font-bold ${item.color}`}>
                {item.value > 0 && item.label === 'Batterij' ? '+' : ''}{item.value}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{item.unit}</span>
            </div>
          ))}
        </div>

        {/* Balance Bar */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Energiebalans</span>
            <span className="font-mono text-xs text-primary">{mockEMS.selfConsumption}% eigen verbruik</span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden flex">
            <div
              className="bg-primary h-full transition-all duration-700"
              style={{ width: `${(mockEMS.solarPower / mockEMS.totalConsumption) * 100}%` }}
              title="Zon"
            />
            <div
              className="bg-warning h-full transition-all duration-700"
              style={{ width: `${(Math.abs(mockEMS.batteryPower) / mockEMS.totalConsumption) * 100}%` }}
              title="Batterij"
            />
            <div
              className="bg-muted-foreground/30 h-full transition-all duration-700"
              style={{ width: `${(mockEMS.gridPower / mockEMS.totalConsumption) * 100}%` }}
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
    </AppLayout>
  );
};

export default EMS;
