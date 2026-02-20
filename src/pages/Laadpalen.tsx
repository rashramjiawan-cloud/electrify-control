import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/StatusBadge';
import StatCard from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useChargePoints, useConnectors } from '@/hooks/useChargePoints';
import { useTransactions } from '@/hooks/useTransactions';
import { mockChargePoints } from '@/data/mockData';
import { Zap, Plug, AlertTriangle, CheckCircle, Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { ChargePointStatus } from '@/types/energy';

const OCPP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-handler`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const sendOcppCommand = async (chargePointId: string, action: string, payload: Record<string, unknown>) => {
  const res = await fetch(OCPP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      chargePointId,
      messageTypeId: 2,
      uniqueId: crypto.randomUUID().slice(0, 8),
      action,
      payload,
    }),
  });
  return res.json();
};

const Laadpalen = () => {
  const { data: dbChargePoints, isLoading: cpLoading } = useChargePoints();
  const { data: dbConnectors } = useConnectors();
  const { data: dbTransactions } = useTransactions(100);

  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [selectedCpId, setSelectedCpId] = useState('');
  const [startIdTag, setStartIdTag] = useState('RFID-REMOTE-001');
  const [startConnector, setStartConnector] = useState('1');
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

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

  // Find active transactions for a charge point
  const getActiveTransactions = (cpId: string) =>
    (dbTransactions || []).filter(tx => tx.charge_point_id === cpId && tx.status === 'Active');

  const handleRemoteStart = async () => {
    setSending(true);
    try {
      const data = await sendOcppCommand(selectedCpId, 'RemoteStartTransaction', {
        connectorId: Number(startConnector),
        idTag: startIdTag,
      });
      if (data[2]?.status === 'Accepted') {
        toast.success(`RemoteStart geaccepteerd — TX #${data[2].transactionId}`);
        setStartDialogOpen(false);
      } else {
        toast.error(`RemoteStart geweigerd: ${data[2]?.reason || 'unknown'}`);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const handleRemoteStop = async () => {
    if (!selectedTxId) return;
    setSending(true);
    try {
      const data = await sendOcppCommand(selectedCpId, 'RemoteStopTransaction', {
        transactionId: selectedTxId,
      });
      if (data[2]?.status === 'Accepted') {
        toast.success(`RemoteStop geaccepteerd — TX #${selectedTxId} gestopt`);
        setStopDialogOpen(false);
      } else {
        toast.error(`RemoteStop geweigerd: ${data[2]?.reason || 'unknown'}`);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const openStartDialog = (cpId: string) => {
    setSelectedCpId(cpId);
    setStartDialogOpen(true);
  };

  const openStopDialog = (cpId: string) => {
    setSelectedCpId(cpId);
    const activeTxs = getActiveTransactions(cpId);
    if (activeTxs.length > 0) {
      setSelectedTxId(activeTxs[0].id);
    }
    setStopDialogOpen(true);
  };

  return (
    <AppLayout title="Laadpalen" subtitle="OCPP 1.6J Charge Point Management">
      {!hasDbData && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          📡 Demo modus — verbind een laadpaal via de OCPP endpoint of gebruik de Simulator om live data te zien
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
          {chargePoints.map((cp) => {
            const activeTxs = getActiveTransactions(cp.id);
            const isCharging = cp.status === 'Charging';

            return (
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
                    {/* Remote Start/Stop buttons */}
                    {hasDbData && (
                      <div className="flex items-center gap-2">
                        {!isCharging && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => openStartDialog(cp.id)}
                          >
                            <Play className="h-3 w-3" />
                            Remote Start
                          </Button>
                        )}
                        {isCharging && activeTxs.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                            onClick={() => openStopDialog(cp.id)}
                          >
                            <Square className="h-3 w-3" />
                            Remote Stop
                          </Button>
                        )}
                      </div>
                    )}
                    <StatusBadge status={cp.status as ChargePointStatus} />
                  </div>
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

                  {/* Active transactions */}
                  {activeTxs.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {activeTxs.map(tx => (
                        <div key={tx.id} className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-2">
                          <div className="flex items-center gap-3">
                            <Zap className="h-3.5 w-3.5 text-primary animate-pulse" />
                            <span className="font-mono text-xs text-primary font-medium">TX #{tx.id}</span>
                            <span className="font-mono text-xs text-muted-foreground">{tx.id_tag}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-muted-foreground">
                              {new Date(tx.start_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="font-mono text-xs text-primary">{tx.energy_delivered} kWh</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Connectors */}
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
            );
          })}
        </div>
      )}

      {/* Remote Start Dialog */}
      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Remote Start Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Start een laadsessie op <span className="font-mono font-semibold text-foreground">{selectedCpId}</span>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">RFID Tag / idTag</Label>
              <Input value={startIdTag} onChange={e => setStartIdTag(e.target.value)} className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Connector ID</Label>
              <Input value={startConnector} onChange={e => setStartConnector(e.target.value)} className="font-mono text-sm" type="number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleRemoteStart} disabled={sending} className="gap-2">
              <Play className="h-4 w-4" />
              {sending ? 'Bezig...' : 'Start laden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remote Stop Dialog */}
      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Remote Stop Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Stop de actieve laadsessie op <span className="font-mono font-semibold text-foreground">{selectedCpId}</span>
            </p>
            {getActiveTransactions(selectedCpId).map(tx => (
              <div
                key={tx.id}
                className={`rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                  selectedTxId === tx.id
                    ? 'border-destructive/50 bg-destructive/5'
                    : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => setSelectedTxId(tx.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-foreground">TX #{tx.id}</span>
                  <span className="font-mono text-xs text-muted-foreground">{tx.id_tag}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    Gestart: {new Date(tx.start_time).toLocaleString('nl-NL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </span>
                  <span className="font-mono text-xs text-primary">{tx.energy_delivered} kWh</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopDialogOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleRemoteStop} disabled={sending || !selectedTxId} className="gap-2">
              <Square className="h-4 w-4" />
              {sending ? 'Bezig...' : 'Stop laden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Laadpalen;
