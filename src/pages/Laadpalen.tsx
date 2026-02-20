import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/StatusBadge';
import StatCard from '@/components/StatCard';
import { mockChargePoints } from '@/data/mockData';
import { Zap, Plug, AlertTriangle, CheckCircle } from 'lucide-react';

const Laadpalen = () => {
  const available = mockChargePoints.filter(cp => cp.status === 'Available').length;
  const charging = mockChargePoints.filter(cp => cp.status === 'Charging').length;
  const faulted = mockChargePoints.filter(cp => cp.status === 'Faulted').length;

  return (
    <AppLayout title="Laadpalen" subtitle="OCPP 1.6J Charge Point Management">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard title="Beschikbaar" value={available} icon={CheckCircle} variant="primary" />
        <StatCard title="Laden" value={charging} icon={Zap} variant="primary" />
        <StatCard title="Storing" value={faulted} icon={AlertTriangle} variant={faulted > 0 ? 'destructive' : 'default'} />
      </div>

      <div className="space-y-4">
        {mockChargePoints.map((cp) => (
          <div key={cp.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{cp.name}</h3>
                  <p className="font-mono text-xs text-muted-foreground">{cp.id} · {cp.vendor} {cp.model}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={cp.status} />
              </div>
            </div>

            <div className="px-6 py-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Locatie</span>
                  <p className="text-foreground font-medium">{cp.location}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Max vermogen</span>
                  <p className="font-mono text-foreground font-medium">{cp.power} kW</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Totaal geleverd</span>
                  <p className="font-mono text-foreground font-medium">{cp.energyDelivered.toLocaleString()} kWh</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Firmware</span>
                  <p className="font-mono text-foreground font-medium">v{cp.firmwareVersion}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Laatste heartbeat</span>
                  <p className="font-mono text-foreground font-medium">
                    {Math.round((Date.now() - new Date(cp.lastHeartbeat).getTime()) / 1000)}s geleden
                  </p>
                </div>
              </div>

              {/* Connectors */}
              <div className="mt-4 space-y-2">
                {cp.connectors.map((conn) => (
                  <div key={conn.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground">Connector {conn.id}</span>
                      <StatusBadge status={conn.status} />
                    </div>
                    <div className="flex items-center gap-4">
                      {conn.currentPower > 0 && (
                        <span className="font-mono text-sm text-primary font-medium">{conn.currentPower} kW</span>
                      )}
                      {conn.activeTransaction && (
                        <span className="font-mono text-xs text-muted-foreground">
                          TX #{conn.activeTransaction.id} · {conn.activeTransaction.idTag}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
};

export default Laadpalen;
