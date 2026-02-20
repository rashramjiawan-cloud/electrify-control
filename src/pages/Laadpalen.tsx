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
import { Zap, Plug, AlertTriangle, CheckCircle, Play, Square, Settings, Lock, Unlock, Loader2, RotateCcw, Radio } from 'lucide-react';
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
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedCpId, setSelectedCpId] = useState('');
  const [startIdTag, setStartIdTag] = useState('RFID-REMOTE-001');
  const [startConnector, setStartConnector] = useState('1');
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configKeys, setConfigKeys] = useState<Array<{ key: string; value: string | null; readonly: boolean }>>([]);
  const [unknownKeys, setUnknownKeys] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetType, setResetType] = useState<'Soft' | 'Hard'>('Soft');
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState('StatusNotification');
  const [triggerConnector, setTriggerConnector] = useState('0');

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

  const openConfigDialog = async (cpId: string) => {
    setSelectedCpId(cpId);
    setConfigDialogOpen(true);
    setConfigLoading(true);
    setConfigKeys([]);
    setUnknownKeys([]);
    try {
      const data = await sendOcppCommand(cpId, 'GetConfiguration', {});
      const result = data[2] || {};
      setConfigKeys(result.configurationKey || []);
      setUnknownKeys(result.unknownKey || []);
    } catch (err) {
      toast.error(`Fout bij ophalen configuratie: ${(err as Error).message}`);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleChangeConfig = async (key: string, value: string) => {
    if (!key.trim() || value.length > 500) {
      toast.error('Ongeldige waarde');
      return;
    }
    setSavingConfig(true);
    try {
      const data = await sendOcppCommand(selectedCpId, 'ChangeConfiguration', { key, value });
      const status = data[2]?.status;
      if (status === 'Accepted') {
        toast.success(`${key} gewijzigd`);
        setConfigKeys(prev => prev.map(c => c.key === key ? { ...c, value } : c));
        setEditingKey(null);
      } else if (status === 'NotSupported') {
        toast.error(`Sleutel "${key}" wordt niet ondersteund`);
      } else {
        toast.error(`ChangeConfiguration geweigerd: ${status}`);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const openResetDialog = (cpId: string) => {
    setSelectedCpId(cpId);
    setResetType('Soft');
    setResetDialogOpen(true);
  };

  const handleReset = async () => {
    setSending(true);
    try {
      const data = await sendOcppCommand(selectedCpId, 'Reset', { type: resetType });
      if (data[2]?.status === 'Accepted') {
        toast.success(`${resetType} Reset uitgevoerd op ${selectedCpId}`);
        setResetDialogOpen(false);
      } else {
        toast.error(`Reset geweigerd: ${data[2]?.status || 'unknown'}`);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const openTriggerDialog = (cpId: string) => {
    setSelectedCpId(cpId);
    setTriggerMessage('StatusNotification');
    setTriggerConnector('0');
    setTriggerDialogOpen(true);
  };

  const handleTriggerMessage = async () => {
    setSending(true);
    try {
      const data = await sendOcppCommand(selectedCpId, 'TriggerMessage', {
        requestedMessage: triggerMessage,
        connectorId: Number(triggerConnector),
      });
      const status = data[2]?.status;
      if (status === 'Accepted') {
        toast.success(`${triggerMessage} getriggerd op ${selectedCpId}`);
        setTriggerDialogOpen(false);
      } else {
        toast.error(`TriggerMessage: ${status}`);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => openConfigDialog(cp.id)}
                        >
                          <Settings className="h-3 w-3" />
                          Config
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => openResetDialog(cp.id)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => openTriggerDialog(cp.id)}
                        >
                          <Radio className="h-3 w-3" />
                          Trigger
                        </Button>
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

      {/* GetConfiguration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Settings className="h-5 w-5" />
              GetConfiguration
            </DialogTitle>
            <p className="text-sm text-muted-foreground font-mono">{selectedCpId}</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-1 py-2">
            {configLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : configKeys.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Geen configuratiesleutels gevonden
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Sleutel</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Waarde</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground w-24">Modus</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground w-24">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configKeys.map((cfg, i) => (
                      <tr key={cfg.key} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="px-4 py-2 font-mono text-xs text-foreground font-medium">{cfg.key}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                          {editingKey === cfg.key ? (
                            <Input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="h-7 font-mono text-xs"
                              maxLength={500}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleChangeConfig(cfg.key, editValue);
                                if (e.key === 'Escape') setEditingKey(null);
                              }}
                            />
                          ) : (
                            cfg.value ?? '—'
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {cfg.readonly ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" /> RO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-primary">
                              <Unlock className="h-3 w-3" /> RW
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {!cfg.readonly && (
                            editingKey === cfg.key ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-primary"
                                  onClick={() => handleChangeConfig(cfg.key, editValue)}
                                  disabled={savingConfig}
                                >
                                  {savingConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Opslaan'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-muted-foreground"
                                  onClick={() => setEditingKey(null)}
                                >
                                  Annuleer
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                                onClick={() => { setEditingKey(cfg.key); setEditValue(cfg.value ?? ''); }}
                              >
                                Wijzigen
                              </Button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {unknownKeys.length > 0 && (
              <div className="mt-3 rounded-lg bg-muted/30 border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1 font-medium">Onbekende sleutels:</p>
                <p className="font-mono text-xs text-destructive">{unknownKeys.join(', ')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Reset Laadpaal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Reset <span className="font-mono font-semibold text-foreground">{selectedCpId}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setResetType('Soft')}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  resetType === 'Soft'
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <p className="text-sm font-semibold text-foreground">Soft Reset</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Herstart firmware, actieve sessies worden netjes afgerond
                </p>
              </button>
              <button
                onClick={() => setResetType('Hard')}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  resetType === 'Hard'
                    ? 'border-destructive/50 bg-destructive/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <p className="text-sm font-semibold text-foreground">Hard Reset</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Volledige herstart, actieve sessies worden direct gestopt
                </p>
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Annuleren</Button>
            <Button
              variant={resetType === 'Hard' ? 'destructive' : 'default'}
              onClick={handleReset}
              disabled={sending}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {sending ? 'Bezig...' : `${resetType} Reset`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TriggerMessage Dialog */}
      <Dialog open={triggerDialogOpen} onOpenChange={setTriggerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Radio className="h-5 w-5" />
              TriggerMessage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Trigger een bericht op <span className="font-mono font-semibold text-foreground">{selectedCpId}</span>
            </p>
            <div className="space-y-3">
              {[
                { value: 'StatusNotification', label: 'StatusNotification', desc: 'Huidige status van de laadpaal/connector opvragen' },
                { value: 'MeterValues', label: 'MeterValues', desc: 'Actuele meterwaarden en vermogen opvragen' },
                { value: 'Heartbeat', label: 'Heartbeat', desc: 'Heartbeat forceren en tijdstempel bijwerken' },
                { value: 'BootNotification', label: 'BootNotification', desc: 'Herregistratie van de laadpaal simuleren' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTriggerMessage(opt.value)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    triggerMessage === opt.value
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <p className="font-mono text-sm font-semibold text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
            {(triggerMessage === 'StatusNotification' || triggerMessage === 'MeterValues') && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Connector ID (0 = hele laadpaal)</Label>
                <Input
                  value={triggerConnector}
                  onChange={e => setTriggerConnector(e.target.value)}
                  className="font-mono text-sm"
                  type="number"
                  min="0"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTriggerDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleTriggerMessage} disabled={sending} className="gap-2">
              <Radio className="h-4 w-4" />
              {sending ? 'Bezig...' : 'Trigger'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Laadpalen;
