import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Euro, Download } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import StatCard from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useChargePoints, useConnectors, useUpdateChargePointCustomer } from '@/hooks/useChargePoints';
import { useTransactions } from '@/hooks/useTransactions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

import { Zap, Plug, AlertTriangle, CheckCircle, Play, Square, Settings, Lock, Unlock, Loader2, RotateCcw, Radio, Trash2, Wifi, WifiOff, RefreshCw, Maximize2, Minimize2, Plus, Search, Pencil, Save, X } from 'lucide-react';
import { downloadAsCsv } from '@/lib/csvExport';
import AuditLogTable from '@/components/AuditLogTable';
import ChargePointDonutCharts from '@/components/ChargePointDonutCharts';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ChargePointStatus } from '@/types/energy';
import MqttStatusBadge from '@/components/MqttStatusBadge';
import MqttConfigDialog from '@/components/MqttConfigDialog';
import ChargePointLoadBalance from '@/components/ChargePointLoadBalance';
import OcppProxyStatusBar from '@/components/OcppProxyStatusBar';
import { useMqttConfigForAsset } from '@/hooks/useMqttConfigurations';
import { useCustomers } from '@/hooks/useUsers';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

const OCPP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-handler`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Commands that should be sent TO the physical charger via pending_ocpp_commands table
const CHARGER_COMMANDS = new Set(['GetConfiguration', 'ChangeConfiguration', 'Reset', 'TriggerMessage', 'UnlockConnector', 'RemoteStartTransaction', 'RemoteStopTransaction']);

const sendOcppCommand = async (chargePointId: string, action: string, payload: Record<string, unknown>) => {
  // For commands targeting the physical charger, insert into pending_ocpp_commands
  if (CHARGER_COMMANDS.has(action)) {
    const { data: cmd, error: insertError } = await supabase
      .from('pending_ocpp_commands' as any)
      .insert({
        charge_point_id: chargePointId,
        action,
        payload,
      })
      .select()
      .single();

    if (insertError) {
      return [4, '0', 'InternalError', insertError.message, {}];
    }

    // Poll for command completion (max 15 seconds)
    const commandId = (cmd as any).id;
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      await new Promise(r => setTimeout(r, 1000));
      const { data: updated } = await supabase
        .from('pending_ocpp_commands' as any)
        .select('*')
        .eq('id', commandId)
        .single();

      if (updated && (updated as any).status === 'completed') {
        const response = (updated as any).response;
        if (Array.isArray(response)) return response;
        return [3, '0', response || {}];
      }
      if (updated && (updated as any).status === 'error') {
        return [4, '0', 'InternalError', 'Command failed', {}];
      }
    }
    return [4, '0', 'InternalError', 'Timeout waiting for charger response', {}];
  }

  // For charger-initiated messages (BootNotification, etc.), use ocpp-handler
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
  const { data: dbChargePoints, isLoading: cpLoading, refetch: refetchChargePoints } = useChargePoints();
  const { data: dbConnectors } = useConnectors();
  const { data: dbTransactions } = useTransactions(100);
  const { data: auditLogs } = useAuditLog(200);
  useRealtimeSubscription();
  const { data: customers } = useCustomers();
  const { isAdmin } = useAuth();
  const updateCustomer = useUpdateChargePointCustomer();

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
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockConnector, setUnlockConnector] = useState('1');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCpId, setDeleteCpId] = useState('');
  const [deleteCpName, setDeleteCpName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [mqttDialogOpen, setMqttDialogOpen] = useState(false);
  const [mqttCpId, setMqttCpId] = useState('');
  const [mqttCpName, setMqttCpName] = useState('');
  const [enovatesSyncing, setEnovatesSyncing] = useState(false);
  const [configFullscreen, setConfigFullscreen] = useState(false);
  const [configSearch, setConfigSearch] = useState('');
  const [addingNewKey, setAddingNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const queryClient = useQueryClient();

  const handleDeleteChargePoint = async () => {
    setDeleting(true);
    try {
      // Delete related data first, then the charge point
      const tables = ['connectors', 'heartbeats', 'meter_values', 'status_notifications', 'transactions', 'ocpp_audit_log', 'charge_point_config'] as const;
      for (const table of tables) {
        await supabase.from(table).delete().eq('charge_point_id', deleteCpId);
      }
      const { error } = await supabase.from('charge_points').delete().eq('id', deleteCpId);
      if (error) throw error;
      toast.success(`Laadpaal ${deleteCpId} verwijderd`);
      setDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['charge-points'] });
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
    } catch (err) {
      toast.error(`Fout bij verwijderen: ${(err as Error).message}`);
    } finally {
      setDeleting(false);
    }
  };

  const chargePoints = (dbChargePoints || []).map(cp => ({
    ...cp,
    connectors: (dbConnectors || []).filter(c => c.charge_point_id === cp.id),
  }));

  const available = chargePoints.filter(cp => cp.status === 'Available').length;
  const charging = chargePoints.filter(cp => cp.status === 'Charging').length;
  const faulted = chargePoints.filter(cp => cp.status === 'Faulted').length;

  const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const isOnline = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return false;
    return Date.now() - new Date(lastHeartbeat).getTime() < HEARTBEAT_TIMEOUT_MS;
  };
  const onlineCount = chargePoints.filter(cp => isOnline(cp.last_heartbeat)).length;

  // Find active transactions for a charge point
  const getActiveTransactions = (cpId: string) =>
    (dbTransactions || []).filter(tx => tx.charge_point_id === cpId && tx.status === 'Active');

  // Find recent completed transactions for a charge point
  const getRecentCompletedTransactions = (cpId: string) =>
    (dbTransactions || []).filter(tx => tx.charge_point_id === cpId && tx.status === 'Completed').slice(0, 3);

  const formatCurrency = (val: number | null) => {
    if (val == null) return '—';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(val);
  };

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

    // First load from database (always available)
    const { data: dbConfig } = await supabase
      .from('charge_point_config')
      .select('key, value, readonly')
      .eq('charge_point_id', cpId)
      .order('key');

    if (dbConfig && dbConfig.length > 0) {
      setConfigKeys(dbConfig.map(c => ({ key: c.key, value: c.value, readonly: c.readonly })));
    }

    // Then try live fetch from charger (updates DB keys if successful)
    try {
      const data = await sendOcppCommand(cpId, 'GetConfiguration', {});
      const result = data[2] || {};
      if (result.configurationKey && result.configurationKey.length > 0) {
        setConfigKeys(result.configurationKey);
      }
      setUnknownKeys(result.unknownKey || []);
    } catch (err) {
      // Silently fall back to DB data already loaded
      console.warn('Live config fetch failed, using cached data:', (err as Error).message);
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
      // For RW keys, try ChangeConfiguration on charger first
      const cfgItem = configKeys.find(c => c.key === key);
      if (cfgItem && !cfgItem.readonly) {
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
      } else {
        // For readonly keys or DB-only edits, update directly in DB
        const { error } = await supabase
          .from('charge_point_config')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('charge_point_id', selectedCpId)
          .eq('key', key);
        if (error) throw error;
        toast.success(`${key} lokaal bijgewerkt`);
        setConfigKeys(prev => prev.map(c => c.key === key ? { ...c, value } : c));
        setEditingKey(null);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddNewKey = async () => {
    if (!newKeyName.trim()) { toast.error('Vul een sleutelnaam in'); return; }
    try {
      const { error } = await supabase
        .from('charge_point_config')
        .upsert({
          charge_point_id: selectedCpId,
          key: newKeyName.trim(),
          value: newKeyValue,
          readonly: false,
        }, { onConflict: 'charge_point_id,key' });
      if (error) throw error;
      setConfigKeys(prev => [...prev, { key: newKeyName.trim(), value: newKeyValue, readonly: false }]);
      setNewKeyName('');
      setNewKeyValue('');
      setAddingNewKey(false);
      toast.success(`Sleutel "${newKeyName.trim()}" toegevoegd`);
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    }
  };

  const handleDeleteConfigKey = async (key: string) => {
    try {
      const { error } = await supabase
        .from('charge_point_config')
        .delete()
        .eq('charge_point_id', selectedCpId)
        .eq('key', key);
      if (error) throw error;
      setConfigKeys(prev => prev.filter(c => c.key !== key));
      toast.success(`Sleutel "${key}" verwijderd`);
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
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

  const openUnlockDialog = (cpId: string) => {
    setSelectedCpId(cpId);
    setUnlockConnector('1');
    setUnlockDialogOpen(true);
  };

  const handleUnlockConnector = async () => {
    setSending(true);
    try {
      const data = await sendOcppCommand(selectedCpId, 'UnlockConnector', {
        connectorId: Number(unlockConnector),
      });
      const status = data[2]?.status;
      if (status === 'Unlocked') {
        toast.success(`Connector ${unlockConnector} ontgrendeld op ${selectedCpId}`);
        setUnlockDialogOpen(false);
      } else {
        toast.error(`UnlockConnector: ${status}`);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
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

  const handleTriggerAll = async () => {
    setSending(true);
    const messages = ['BootNotification', 'Heartbeat', 'StatusNotification', 'MeterValues'];
    const results: { msg: string; ok: boolean; status?: string }[] = [];
    for (const msg of messages) {
      try {
        const connId = (msg === 'StatusNotification' || msg === 'MeterValues') ? 1 : 0;
        const data = await sendOcppCommand(selectedCpId, 'TriggerMessage', {
          requestedMessage: msg,
          connectorId: connId,
        });
        const status = data[2]?.status;
        results.push({ msg, ok: status === 'Accepted', status });
      } catch {
        results.push({ msg, ok: false, status: 'Error' });
      }
    }
    const ok = results.filter(r => r.ok).length;
    const fail = results.filter(r => !r.ok);
    if (ok > 0) toast.success(`${ok}/${messages.length} triggers geaccepteerd op ${selectedCpId}`);
    if (fail.length > 0) toast.error(`Mislukt: ${fail.map(f => `${f.msg} (${f.status})`).join(', ')}`);
    setSending(false);
    if (fail.length === 0) setTriggerDialogOpen(false);
  };
  const handleExportCsv = () => {
    const exportData = chargePoints.map(cp => ({
      id: cp.id,
      naam: cp.name,
      status: cp.status,
      online: isOnline(cp.last_heartbeat) ? 'Ja' : 'Nee',
      model: cp.model ?? '',
      fabrikant: cp.vendor ?? '',
      serienummer: cp.serial_number ?? '',
      firmware: cp.firmware_version ?? '',
      locatie: cp.location ?? '',
      max_vermogen_kw: cp.max_power ?? '',
      energie_geleverd_kwh: cp.energy_delivered ?? '',
      laatste_heartbeat: cp.last_heartbeat ?? '',
      connectors: (cp.connectors || []).length,
    }));

    downloadAsCsv(exportData, `laadpalen_${new Date().toISOString().slice(0, 10)}.csv`, [
      { key: 'id', label: 'ID' },
      { key: 'naam', label: 'Naam' },
      { key: 'status', label: 'Status' },
      { key: 'online', label: 'Online' },
      { key: 'model', label: 'Model' },
      { key: 'fabrikant', label: 'Fabrikant' },
      { key: 'serienummer', label: 'Serienummer' },
      { key: 'firmware', label: 'Firmware' },
      { key: 'locatie', label: 'Locatie' },
      { key: 'max_vermogen_kw', label: 'Max Vermogen (kW)' },
      { key: 'energie_geleverd_kwh', label: 'Energie Geleverd (kWh)' },
      { key: 'laatste_heartbeat', label: 'Laatste Heartbeat' },
      { key: 'connectors', label: 'Connectors' },
    ]);
    toast.success('CSV gedownload');
  };


  return (
    <AppLayout title="Laadpalen" subtitle="OCPP 1.6J Charge Point Management">
      {chargePoints.length === 0 && !cpLoading && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          📡 Geen laadpalen gevonden — verbind een laadpaal via de OCPP endpoint of gebruik de Simulator
        </div>
      )}

      {/* OCPP Connection Info */}
      <div className="flex items-center gap-2 mb-4">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <Plug className="h-3.5 w-3.5" />
              Laadpaal verbinden (OCPP 1.6J)
            </Button>
          </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mb-6 rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Verbind een laadpaal via OCPP 1.6J WebSocket</h3>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">WebSocket URL (configureer in je laadpaal)</span>
                <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-xs text-primary select-all break-all">
                  wss://{import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ocpp-ws/<span className="text-muted-foreground">JOUW_CHARGE_POINT_ID</span>
                </code>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Subprotocol</span>
                <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">ocpp1.6</code>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 pt-1">
              <p>📌 Vervang <code className="text-foreground">JOUW_CHARGE_POINT_ID</code> door een uniek ID voor je laadpaal (bijv. <code className="text-foreground">CP-KANTOOR-01</code>)</p>
              <p>📌 De laadpaal wordt automatisch aangemaakt bij de eerste <code className="text-foreground">BootNotification</code></p>
              <p>📌 Ondersteunde berichten: BootNotification, Heartbeat, StatusNotification, Start/StopTransaction, MeterValues, Authorize</p>
            </div>
          </div>
        </CollapsibleContent>
        </Collapsible>
        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExportCsv}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
      <OcppProxyStatusBar />
      <ChargePointDonutCharts chargePoints={chargePoints as any} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Online" value={onlineCount} icon={Wifi} variant="primary" />
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
            const online = isOnline(cp.last_heartbeat);

            return (
              <div key={cp.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Zap className="h-5 w-5 text-primary" />
                      <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-card ${online ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{cp.name}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${online ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                          {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                          {online ? 'Online' : 'Offline'}
                        </span>
                        <MqttStatusBadge assetType="charge_point" assetId={cp.id} onClick={() => { setMqttCpId(cp.id); setMqttCpName(cp.name); setMqttDialogOpen(true); }} />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{cp.id} · {cp.vendor} {cp.model}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Remote Start/Stop buttons */}
                    {dbChargePoints && dbChargePoints.length > 0 && (
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => openUnlockDialog(cp.id)}
                        >
                        <Unlock className="h-3 w-3" />
                          Unlock
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setDeleteCpId(cp.id);
                            setDeleteCpName(cp.name);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Verwijder
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
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
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
                    {isAdmin && (
                      <div>
                        <span className="text-muted-foreground text-xs flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          Klant
                        </span>
                        <Select
                          value={(cp as any).customer_id || '__none__'}
                          onValueChange={(v) => updateCustomer.mutate({
                            chargePointId: cp.id,
                            customerId: v === '__none__' ? null : v,
                          })}
                        >
                          <SelectTrigger className="h-7 mt-1 text-xs">
                            <SelectValue placeholder="Geen klant" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Geen klant</SelectItem>
                            {customers?.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Load Balance Visualization */}
                  <div className="mt-4">
                    <ChargePointLoadBalance
                      chargePointId={cp.id}
                      chargePointName={cp.name}
                      maxPower={cp.max_power}
                      currentPower={
                        (cp.connectors || []).reduce((sum: number, c: any) => sum + (Number(c.current_power) || 0), 0)
                      }
                      status={cp.status}
                    />
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
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-xs text-muted-foreground">
                              {new Date(tx.start_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="font-mono text-xs text-primary">{tx.energy_delivered} kWh</span>
                            {tx.cost != null && tx.cost > 0 && (
                              <span className="font-mono text-xs font-semibold text-foreground flex items-center gap-1">
                                <Euro className="h-3 w-3" />
                                {formatCurrency(tx.cost)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent completed transactions */}
                  {(() => {
                    const recentCompleted = getRecentCompletedTransactions(cp.id);
                    if (recentCompleted.length === 0) return null;
                    return (
                      <div className="mt-3 space-y-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recente sessies</span>
                        {recentCompleted.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between rounded-lg bg-muted/30 border border-border px-4 py-2">
                            <div className="flex items-center gap-3">
                              <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-mono text-xs text-muted-foreground">TX #{tx.id}</span>
                              <span className="font-mono text-xs text-muted-foreground">{tx.id_tag}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-xs text-muted-foreground">
                                {new Date(tx.start_time).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
                              </span>
                              <span className="font-mono text-xs text-primary">{tx.energy_delivered} kWh</span>
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {formatCurrency(tx.cost)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

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

      {/* Audit Log Section */}
      {auditLogs && auditLogs.length > 0 && (
        <AuditLogTable
          logs={auditLogs as any}
          chargePointIds={chargePoints.map(cp => cp.id)}
        />
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
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setTriggerDialogOpen(false)}>Annuleren</Button>
            <Button variant="secondary" onClick={handleTriggerAll} disabled={sending} className="gap-2">
              <Zap className="h-4 w-4" />
              {sending ? 'Bezig...' : 'Test alle triggers'}
            </Button>
            <Button onClick={handleTriggerMessage} disabled={sending} className="gap-2">
              <Radio className="h-4 w-4" />
              {sending ? 'Bezig...' : 'Trigger'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UnlockConnector Dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5" />
              Unlock Connector — {selectedCpId}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Connector ID</Label>
              <Input
                type="number"
                min={1}
                value={unlockConnector}
                onChange={e => setUnlockConnector(e.target.value)}
                className="font-mono mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ontgrendelt de connector en stopt eventuele actieve transacties.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleUnlockConnector} disabled={sending} className="gap-2">
              <Unlock className="h-4 w-4" />
              {sending ? 'Bezig...' : 'Ontgrendelen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Laadpaal verwijderen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je <strong>{deleteCpName}</strong> ({deleteCpId}) wilt verwijderen? Alle bijbehorende data (transacties, meterwaarden, logs) wordt permanent verwijderd.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleDeleteChargePoint} disabled={deleting} className="gap-2">
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Verwijderen...' : 'Definitief verwijderen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MQTT Config Dialog */}
      <MqttConfigDialog
        open={mqttDialogOpen}
        onOpenChange={setMqttDialogOpen}
        assetType="charge_point"
        assetId={mqttCpId}
        assetName={mqttCpName}
      />
    </AppLayout>
  );
};

export default Laadpalen;
