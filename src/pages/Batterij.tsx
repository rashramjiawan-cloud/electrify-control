import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/StatusBadge';
import StatCard from '@/components/StatCard';
import { mockBatteries } from '@/data/mockData';
import { BatteryCharging, Thermometer, Heart, RefreshCw } from 'lucide-react';

const Batterij = () => {
  const totalCapacity = mockBatteries.reduce((a, b) => a + b.capacity, 0);
  const avgSoc = Math.round(mockBatteries.reduce((a, b) => a + b.soc, 0) / mockBatteries.length);
  const totalPower = mockBatteries.reduce((a, b) => a + b.power, 0);

  return (
    <AppLayout title="Batterij" subtitle="Battery Energy Storage System">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard title="Totale capaciteit" value={totalCapacity} unit="kWh" icon={BatteryCharging} variant="primary" />
        <StatCard title="Gem. SoC" value={avgSoc} unit="%" icon={BatteryCharging} variant="primary" />
        <StatCard title="Netto vermogen" value={totalPower > 0 ? `+${totalPower}` : totalPower.toString()} unit="kW" icon={BatteryCharging} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {mockBatteries.map((bat) => (
          <div key={bat.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{bat.name}</h3>
                <StatusBadge status={bat.status} />
              </div>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">{bat.id} · {bat.capacity} kWh</p>
            </div>

            <div className="p-5 space-y-5">
              {/* SoC Bar */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">State of Charge</span>
                  <span className="font-mono text-sm font-bold text-foreground">{bat.soc}%</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      bat.soc > 50 ? 'bg-primary' : bat.soc > 20 ? 'bg-warning' : 'bg-destructive'
                    }`}
                    style={{ width: `${bat.soc}%` }}
                  />
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BatteryCharging className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Vermogen</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {bat.power > 0 ? '+' : ''}{bat.power} kW
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Temperatuur</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">{bat.temperature}°C</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Cycli</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">{bat.cycles}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Gezondheid</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">{bat.health}%</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
};

export default Batterij;
