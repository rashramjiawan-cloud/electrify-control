import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/StatusBadge';
import StatCard from '@/components/StatCard';
import { useChargePoints, useConnectors } from '@/hooks/useChargePoints';
import { mockChargePoints } from '@/data/mockData';
import { Zap, Plug, AlertTriangle, CheckCircle } from 'lucide-react';
import type { ChargePointStatus } from '@/types/energy';

const Laadpalen = () => {
  const { data: dbChargePoints, isLoading: cpLoading } = useChargePoints();
  const { data: dbConnectors } = useConnectors();

  // Use DB data if available, fallback to mock
  const hasDbData = dbChargePoints && dbChargePoints.length > 0;

  const chargePoints = hasDbData
    ? dbChargePoints.map(cp => ({
        ...cp,
        connectors: (dbConnectors || []).filter(c => c.charge_point_id === cp.id),
      }))
    : mockChargePoints.map(cp => ({
        id: cp.id,
        name: cp.name,
        model: cp.model,
        vendor: cp.vendor,
        serial_number: cp.serialNumber,
        status: cp.status,
        firmware_version: cp.firmwareVersion,
        location: cp.location,
        max_power: cp.power,
        energy_delivered: cp.energyDelivered,
        last_heartbeat: cp.lastHeartbeat,
        connectors: cp.connectors.map(c => ({
          connector_id: c.id,
          status: c.status,
          current_power: c.currentPower,
          meter_value: c.meterValue,
          charge_point_id: cp.id,
          activeTransaction: c.activeTransaction,
        })),
      }));

  const available = chargePoints.filter(cp => cp.status === 'Available').length;
  const charging = chargePoints.filter(cp => cp.status === 'Charging').length;
  const faulted = chargePoints.filter(cp => cp.status === 'Faulted').length;

  return (
    <AppLayout title="Laadpalen" subtitle="OCPP 1.6J Charge Point Management">
      {!hasDbData && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          📡 Demo modus — verbind een laadpaal via de OCPP endpoint om live data te zien
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard title="Beschikbaar" value={available} icon={CheckCircle} variant="primary" />
        <StatCard title="Laden" value={charging} icon={Zap} variant="primary" />
        <StatCard title="Storing" value={faulted} icon={AlertTriangle} variant={faulted > 0 ? 'destructive' : 'default'} />
      </div>

      {cpLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : (
        <div className="space-y-4">
          {chargePoints.map((cp) => (
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
                <StatusBadge status={cp.status as ChargePointStatus} />
              </div>

              <div className="px-6 py-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Locatie</span>
                    <p className="text-foreground font-medium">{cp.location || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Max vermogen</span>
                    <p className="font-mono text-foreground font-medium">{cp.max_power} kW</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Totaal geleverd</span>
                    <p className="font-mono text-foreground font-medium">{Number(cp.energy_delivered).toLocaleString()} kWh</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Firmware</span>
                    <p className="font-mono text-foreground font-medium">v{cp.firmware_version || '?'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Laatste heartbeat</span>
                    <p className="font-mono text-foreground font-medium">
                      {cp.last_heartbeat
                        ? `${Math.round((Date.now() - new Date(cp.last_heartbeat).getTime()) / 1000)}s geleden`
                        : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {cp.connectors.map((conn: any) => (
                    <div key={conn.connector_id} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-xs text-muted-foreground">Connector {conn.connector_id}</span>
                        <StatusBadge status={conn.status as ChargePointStatus} />
                      </div>
                      <div className="flex items-center gap-4">
                        {conn.current_power > 0 && (
                          <span className="font-mono text-sm text-primary font-medium">{conn.current_power} kW</span>
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
      )}
    </AppLayout>
  );
};

export default Laadpalen;
