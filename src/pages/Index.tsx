import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { useChargePoints } from '@/hooks/useChargePoints';
import { useTransactions } from '@/hooks/useTransactions';
import { mockChargePoints, mockBatteries, mockEMS, mockTransactions } from '@/data/mockData';
import { Zap, BatteryCharging, Sun, Activity, AlertTriangle } from 'lucide-react';
import EnergyHistoryChart from '@/components/EnergyHistoryChart';
import DataRetentionWidget from '@/components/DataRetentionWidget';
import GtvMonitorWidget from '@/components/GtvMonitorWidget';

const Dashboard = () => {
  const { data: dbChargePoints } = useChargePoints();
  const { data: dbTransactions } = useTransactions(5);

  const hasDbCp = dbChargePoints && dbChargePoints.length > 0;
  const hasDbTx = dbTransactions && dbTransactions.length > 0;

  // Charge points data
  const cpList = hasDbCp
    ? dbChargePoints.map(cp => ({ id: cp.id, name: cp.name, vendor: cp.vendor || '', status: cp.status, power: 0 }))
    : mockChargePoints.map(cp => ({ id: cp.id, name: cp.name, vendor: cp.vendor, status: cp.status, power: cp.connectors.reduce((a, c) => a + c.currentPower, 0) }));

  const chargingCount = cpList.filter(cp => cp.status === 'Charging').length;
  const faultedCount = cpList.filter(cp => cp.status === 'Faulted').length;
  const totalPower = hasDbCp ? 0 : mockChargePoints.reduce((acc, cp) => acc + cp.connectors.reduce((a, c) => a + c.currentPower, 0), 0);

  // Transactions
  const txList = hasDbTx
    ? dbTransactions.map(tx => ({ id: tx.id, idTag: tx.id_tag, startTime: tx.start_time, energyDelivered: tx.energy_delivered, cost: tx.cost, status: tx.status }))
    : mockTransactions;

  return (
    <AppLayout title="Dashboard" subtitle="Overzicht van je energiesysteem">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Actief laden" value={chargingCount} unit={`/ ${cpList.length}`} icon={Zap} variant="primary" />
        <StatCard title="Huidig vermogen" value={totalPower.toFixed(1)} unit="kW" icon={Activity} variant="primary" />
        <StatCard title="Zonne-energie" value={mockEMS.solarPower} unit="kW" icon={Sun} trend={{ value: 8, label: 'vandaag' }} />
        <StatCard title="Storingen" value={faultedCount} icon={AlertTriangle} variant={faultedCount > 0 ? 'destructive' : 'default'} />
      </div>
      {/* Energy History Chart */}
      <div className="mb-8">
        <EnergyHistoryChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charge Points Status */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Laadpalen Status</h2>
          </div>
          <div className="divide-y divide-border">
            {cpList.map((cp) => (
              <div key={cp.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{cp.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{cp.id} · {cp.vendor}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {cp.power > 0 && (
                    <span className="font-mono text-sm text-primary font-medium">{cp.power.toFixed(1)} kW</span>
                  )}
                  <StatusBadge status={cp.status as any} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Battery Summary */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Batterijen</h2>
            </div>
            <div className="p-5 space-y-4">
              {mockBatteries.map((bat) => (
                <div key={bat.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{bat.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{bat.soc}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${bat.soc}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={bat.status} />
                    <span className="font-mono text-xs text-muted-foreground">{bat.power > 0 ? '+' : ''}{bat.power} kW</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Energy Flow Summary */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Energieflow</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Grid</span>
                <span className="font-mono text-sm text-foreground">{mockEMS.gridPower} kW</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Zon</span>
                <span className="font-mono text-sm text-primary">{mockEMS.solarPower} kW</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Batterij</span>
                <span className="font-mono text-sm text-foreground">{mockEMS.batteryPower} kW</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">EV Laden</span>
                <span className="font-mono text-sm text-foreground">{mockEMS.evPower} kW</span>
              </div>
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Eigen verbruik</span>
                <span className="font-mono text-sm font-bold text-primary">{mockEMS.selfConsumption}%</span>
              </div>
          </div>

          {/* GTV Monitor */}
          <GtvMonitorWidget />

          {/* Data Retention Widget */}
          <DataRetentionWidget />
        </div>
      </div>
      </div>

      {/* Recent Transactions */}
      <div className="mt-8 rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Recente Transacties</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tag</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Start</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Energie</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Kosten</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {txList.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-sm text-foreground">#{tx.id}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{tx.idTag}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">
                    {new Date(tx.startTime).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-foreground">{tx.energyDelivered} kWh</td>
                  <td className="px-5 py-3 font-mono text-sm text-foreground">{tx.cost ? `€${Number(tx.cost).toFixed(2)}` : '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={tx.status as any} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
