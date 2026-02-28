import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { useChargePoints } from '@/hooks/useChargePoints';
import { useTransactions } from '@/hooks/useTransactions';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useEnergyFlows } from '@/hooks/useEnergyFlows';
import { mockChargePoints, mockBatteries, mockEMS, mockTransactions } from '@/data/mockData';
import { Zap, BatteryCharging, Sun, Activity, AlertTriangle, Gauge } from 'lucide-react';
import EnergyHistoryChart from '@/components/EnergyHistoryChart';
import DataRetentionWidget from '@/components/DataRetentionWidget';
import GtvMonitorWidget from '@/components/GtvMonitorWidget';
import EnergyFlowRendering from '@/components/EnergyFlowRendering';
import DashboardGrid from '@/components/DashboardGrid';
import { useMemo } from 'react';

const Dashboard = () => {
  const { data: dbChargePoints } = useChargePoints();
  const { data: dbTransactions } = useTransactions(5);
  const { getSetting } = useSystemSettings();
  const { flows } = useEnergyFlows();

  const hasDbCp = dbChargePoints && dbChargePoints.length > 0;
  const hasDbTx = dbTransactions && dbTransactions.length > 0;

  const cpList = hasDbCp
    ? dbChargePoints.map(cp => ({ id: cp.id, name: cp.name, vendor: cp.vendor || '', status: cp.status, power: 0 }))
    : mockChargePoints.map(cp => ({ id: cp.id, name: cp.name, vendor: cp.vendor, status: cp.status, power: cp.connectors.reduce((a, c) => a + c.currentPower, 0) }));

  const chargingCount = cpList.filter(cp => cp.status === 'Charging').length;
  const faultedCount = cpList.filter(cp => cp.status === 'Faulted').length;
  const totalPower = hasDbCp ? 0 : mockChargePoints.reduce((acc, cp) => acc + cp.connectors.reduce((a, c) => a + c.currentPower, 0), 0);

  const gtvImport = Number(getSetting('gtv_import_kw')?.value ?? 150);
  const gtvExport = Number(getSetting('gtv_export_kw')?.value ?? 150);
  const gridFlow = flows.find(f => f.type === 'grid');
  const currentPowerKw = gridFlow?.totalPowerKw ?? 0;
  const isImporting = currentPowerKw >= 0;
  const activeGtvLimit = isImporting ? gtvImport : gtvExport;
  const gtvUsagePct = activeGtvLimit > 0 ? Math.round((Math.abs(currentPowerKw) / activeGtvLimit) * 100) : 0;
  const gtvVariant = gtvUsagePct >= 100 ? 'destructive' : gtvUsagePct >= 80 ? 'warning' : 'default';

  const txList = hasDbTx
    ? dbTransactions.map(tx => ({ id: tx.id, idTag: tx.id_tag, startTime: tx.start_time, energyDelivered: tx.energy_delivered, cost: tx.cost, status: tx.status }))
    : mockTransactions;

  const widgets = useMemo(() => [
    {
      id: 'energy-flow',
      title: 'Energiestroom',
      defaultLayout: { x: 0, y: 0, w: 12, h: 5, minW: 6, minH: 4 },
      children: <EnergyFlowRendering />,
    },
    {
      id: 'stat-charging',
      title: 'Actief laden',
      defaultLayout: { x: 0, y: 5, w: 2, h: 2, minW: 2, minH: 2 },
      children: <StatCard title="Actief laden" value={chargingCount} unit={`/ ${cpList.length}`} icon={Zap} variant="primary" />,
    },
    {
      id: 'stat-power',
      title: 'Huidig vermogen',
      defaultLayout: { x: 2, y: 5, w: 3, h: 2, minW: 2, minH: 2 },
      children: <StatCard title="Huidig vermogen" value={totalPower.toFixed(1)} unit="kW" icon={Activity} variant="primary" />,
    },
    {
      id: 'stat-solar',
      title: 'Zonne-energie',
      defaultLayout: { x: 5, y: 5, w: 3, h: 2, minW: 2, minH: 2 },
      children: <StatCard title="Zonne-energie" value={mockEMS.solarPower} unit="kW" icon={Sun} trend={{ value: 8, label: 'vandaag' }} />,
    },
    {
      id: 'stat-faults',
      title: 'Storingen',
      defaultLayout: { x: 8, y: 5, w: 2, h: 2, minW: 2, minH: 2 },
      children: <StatCard title="Storingen" value={faultedCount} icon={AlertTriangle} variant={faultedCount > 0 ? 'destructive' : 'default'} />,
    },
    {
      id: 'stat-gtv',
      title: 'GTV-gebruik',
      defaultLayout: { x: 10, y: 5, w: 2, h: 2, minW: 2, minH: 2 },
      children: <StatCard title="GTV-gebruik" value={gtvUsagePct} unit={`% / ${activeGtvLimit} kW`} icon={Gauge} variant={gtvVariant as any} />,
    },
    {
      id: 'energy-history',
      title: 'Energiegeschiedenis',
      defaultLayout: { x: 0, y: 7, w: 12, h: 5, minW: 6, minH: 3 },
      children: <EnergyHistoryChart />,
    },
    {
      id: 'charge-points',
      title: 'Laadpalen Status',
      defaultLayout: { x: 0, y: 12, w: 8, h: 6, minW: 4, minH: 3 },
      children: (
        <div className="divide-y divide-border -mx-4 -mt-4">
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
      ),
    },
    {
      id: 'batteries',
      title: 'Batterijen',
      defaultLayout: { x: 8, y: 12, w: 4, h: 4, minW: 3, minH: 3 },
      children: (
        <div className="space-y-4">
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
      ),
    },
    {
      id: 'energy-flow-summary',
      title: 'Energieflow',
      defaultLayout: { x: 8, y: 16, w: 4, h: 4, minW: 3, minH: 3 },
      children: (
        <div className="space-y-3">
          {flows.map((flow) => {
            const labels: Record<string, string> = { grid: 'Grid', pv: 'Zon', battery: 'Batterij' };
            const colorClass = flow.type === 'pv' ? 'text-primary' : 'text-foreground';
            return (
              <div key={flow.type} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{labels[flow.type] || flow.label}</span>
                <span className={`font-mono text-sm ${colorClass}`}>{flow.totalPowerKw.toFixed(1)} kW</span>
              </div>
            );
          })}
          {(() => {
            const pvFlow = flows.find(f => f.type === 'pv');
            const gridFlow = flows.find(f => f.type === 'grid');
            const pvKw = Math.abs(pvFlow?.totalPowerKw ?? 0);
            const gridKw = gridFlow?.totalPowerKw ?? 0;
            const totalConsumption = gridKw + pvKw;
            const selfConsumption = totalConsumption > 0 ? Math.round((pvKw / totalConsumption) * 100) : 0;
            return (
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Eigen verbruik</span>
                <span className="font-mono text-sm font-bold text-primary">{selfConsumption}%</span>
              </div>
            );
          })()}
        </div>
      ),
    },
    {
      id: 'gtv-monitor',
      title: 'GTV Monitor',
      defaultLayout: { x: 8, y: 20, w: 4, h: 3, minW: 3, minH: 2 },
      children: <GtvMonitorWidget />,
    },
    {
      id: 'data-retention',
      title: 'Data Retentie',
      defaultLayout: { x: 8, y: 23, w: 4, h: 3, minW: 3, minH: 2 },
      children: <DataRetentionWidget />,
    },
    {
      id: 'recent-transactions',
      title: 'Recente Transacties',
      defaultLayout: { x: 0, y: 18, w: 8, h: 5, minW: 6, minH: 3 },
      children: (
        <div className="overflow-x-auto -mx-4 -mt-4">
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
      ),
    },
  ], [cpList, chargingCount, totalPower, faultedCount, gtvUsagePct, activeGtvLimit, gtvVariant, flows, txList]);

  return (
    <AppLayout title="Dashboard" subtitle="Overzicht van je energiesysteem">
      <DashboardGrid widgets={widgets} />
    </AppLayout>
  );
};

export default Dashboard;
