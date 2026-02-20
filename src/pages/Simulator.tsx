import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Radio, Zap, Square, Gauge, KeyRound, ChevronRight } from 'lucide-react';

const OCPP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-handler`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface LogEntry {
  id: number;
  time: string;
  action: string;
  direction: 'send' | 'receive';
  payload: string;
  status: 'success' | 'error';
}

const Simulator = () => {
  const [chargePointId, setChargePointId] = useState('SIM-001');
  const [vendor, setVendor] = useState('Alfen');
  const [model, setModel] = useState('Eve Single Pro');
  const [serial, setSerial] = useState('SIM-2026-001');
  const [firmware, setFirmware] = useState('5.0.0');
  const [connectorId, setConnectorId] = useState('1');
  const [idTag, setIdTag] = useState('RFID-SIM-001');
  const [meterStart, setMeterStart] = useState('0');
  const [meterStop, setMeterStop] = useState('11000');
  const [transactionId, setTransactionId] = useState('');
  const [connectorStatus, setConnectorStatus] = useState('Available');
  const [powerValue, setPowerValue] = useState('7400');
  const [energyValue, setEnergyValue] = useState('5500');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sending, setSending] = useState(false);

  let logCounter = 0;

  const addLog = (action: string, direction: 'send' | 'receive', payload: unknown, status: 'success' | 'error') => {
    const entry: LogEntry = {
      id: Date.now() + logCounter++,
      time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action,
      direction,
      payload: JSON.stringify(payload, null, 2),
      status,
    };
    setLogs(prev => [entry, ...prev].slice(0, 50));
  };

  const sendOcpp = async (action: string, payload: Record<string, unknown>) => {
    setSending(true);
    const body = {
      chargePointId,
      messageTypeId: 2,
      uniqueId: crypto.randomUUID().slice(0, 8),
      action,
      payload,
    };

    addLog(action, 'send', payload, 'success');

    try {
      const res = await fetch(OCPP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        addLog(action, 'receive', data, 'success');
        toast.success(`${action} → Accepted`);

        // Auto-fill transactionId from StartTransaction response
        if (action === 'StartTransaction' && data[2]?.transactionId) {
          setTransactionId(String(data[2].transactionId));
        }
      } else {
        addLog(action, 'receive', data, 'error');
        toast.error(`${action} failed`);
      }
    } catch (err) {
      addLog(action, 'receive', { error: (err as Error).message }, 'error');
      toast.error(`${action} error: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const sendBootNotification = () =>
    sendOcpp('BootNotification', {
      chargePointVendor: vendor,
      chargePointModel: model,
      chargePointSerialNumber: serial,
      firmwareVersion: firmware,
    });

  const sendHeartbeat = () => sendOcpp('Heartbeat', {});

  const sendStatusNotification = () =>
    sendOcpp('StatusNotification', {
      connectorId: Number(connectorId),
      status: connectorStatus,
      errorCode: 'NoError',
    });

  const sendAuthorize = () =>
    sendOcpp('Authorize', { idTag });

  const sendStartTransaction = () =>
    sendOcpp('StartTransaction', {
      connectorId: Number(connectorId),
      idTag,
      meterStart: Number(meterStart),
      timestamp: new Date().toISOString(),
    });

  const sendStopTransaction = () =>
    sendOcpp('StopTransaction', {
      transactionId: Number(transactionId),
      meterStop: Number(meterStop),
      timestamp: new Date().toISOString(),
      idTag,
      reason: 'Local',
    });

  const sendMeterValues = () =>
    sendOcpp('MeterValues', {
      connectorId: Number(connectorId),
      transactionId: transactionId ? Number(transactionId) : undefined,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: powerValue, measurand: 'Power.Active.Import', unit: 'W' },
            { value: energyValue, measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
          ],
        },
      ],
    });

  const runFullFlow = async () => {
    toast.info('Volledige laadsessie starten...');
    await sendBootNotification();
    await new Promise(r => setTimeout(r, 500));
    await sendOcpp('StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
    await new Promise(r => setTimeout(r, 300));
    await sendOcpp('Authorize', { idTag });
    await new Promise(r => setTimeout(r, 300));

    // StartTransaction
    const startBody = {
      chargePointId,
      messageTypeId: 2,
      uniqueId: crypto.randomUUID().slice(0, 8),
      action: 'StartTransaction',
      payload: { connectorId: 1, idTag, meterStart: 0, timestamp: new Date().toISOString() },
    };
    addLog('StartTransaction', 'send', startBody.payload, 'success');
    const startRes = await fetch(OCPP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify(startBody),
    });
    const startData = await startRes.json();
    addLog('StartTransaction', 'receive', startData, 'success');
    const txId = startData[2]?.transactionId;
    setTransactionId(String(txId));

    await new Promise(r => setTimeout(r, 500));
    await sendOcpp('MeterValues', {
      connectorId: 1, transactionId: txId,
      meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: '7400', measurand: 'Power.Active.Import', unit: 'W' }, { value: '3700', measurand: 'Energy.Active.Import.Register', unit: 'Wh' }] }],
    });

    await new Promise(r => setTimeout(r, 500));
    await sendOcpp('StopTransaction', { transactionId: txId, meterStop: 11000, timestamp: new Date().toISOString(), idTag, reason: 'Local' });
    await new Promise(r => setTimeout(r, 300));
    await sendOcpp('StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });

    toast.success('Volledige laadsessie afgerond! (11 kWh)');
  };

  const ActionButton = ({ icon: Icon, label, onClick, variant = 'outline' as const }: { icon: any; label: string; onClick: () => void; variant?: 'outline' | 'default' }) => (
    <Button variant={variant} onClick={onClick} disabled={sending} className="justify-start gap-2 h-auto py-3">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm">{label}</span>
    </Button>
  );

  return (
    <AppLayout title="OCPP Simulator" subtitle="Test OCPP 1.6J berichten naar je CSMS">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config + Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Charge Point Config */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Charge Point Configuratie</h2>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Charge Point ID</Label>
                <Input value={chargePointId} onChange={e => setChargePointId(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vendor</Label>
                <Input value={vendor} onChange={e => setVendor(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Input value={model} onChange={e => setModel(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Serienummer</Label>
                <Input value={serial} onChange={e => setSerial(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Firmware</Label>
                <Input value={firmware} onChange={e => setFirmware(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Connector ID</Label>
                <Input value={connectorId} onChange={e => setConnectorId(e.target.value)} className="font-mono text-sm" type="number" />
              </div>
            </div>
          </div>

          {/* Transaction Config */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Transactie Parameters</h2>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">RFID Tag</Label>
                <Input value={idTag} onChange={e => setIdTag(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Meter Start (Wh)</Label>
                <Input value={meterStart} onChange={e => setMeterStart(e.target.value)} className="font-mono text-sm" type="number" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Meter Stop (Wh)</Label>
                <Input value={meterStop} onChange={e => setMeterStop(e.target.value)} className="font-mono text-sm" type="number" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Transactie ID</Label>
                <Input value={transactionId} onChange={e => setTransactionId(e.target.value)} className="font-mono text-sm" type="number" placeholder="auto na start" />
              </div>
            </div>
          </div>

          {/* OCPP Actions */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">OCPP Acties</h2>
            </div>
            <div className="p-5 space-y-4">
              {/* Full flow button */}
              <Button onClick={runFullFlow} disabled={sending} className="w-full gap-2 h-12 text-sm font-semibold">
                <Play className="h-4 w-4" />
                Volledige laadsessie simuleren (Boot → Start → Meter → Stop)
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">of individuele acties</span></div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <ActionButton icon={Radio} label="BootNotification" onClick={sendBootNotification} />
                <ActionButton icon={Zap} label="Heartbeat" onClick={sendHeartbeat} />
                <ActionButton icon={KeyRound} label="Authorize" onClick={sendAuthorize} />
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <Select value={connectorStatus} onValueChange={setConnectorStatus}>
                      <SelectTrigger className="font-mono text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['Available', 'Charging', 'Faulted', 'Unavailable', 'Preparing', 'SuspendedEV', 'Finishing'].map(s => (
                          <SelectItem key={s} value={s} className="font-mono text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ActionButton icon={ChevronRight} label="StatusNotification" onClick={sendStatusNotification} />
                </div>
                <ActionButton icon={Play} label="StartTransaction" onClick={sendStartTransaction} variant="default" />
                <ActionButton icon={Square} label="StopTransaction" onClick={sendStopTransaction} />
              </div>

              {/* MeterValues section */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">MeterValues</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Vermogen (W)</Label>
                    <Input value={powerValue} onChange={e => setPowerValue(e.target.value)} className="font-mono text-sm" type="number" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Energie (Wh)</Label>
                    <Input value={energyValue} onChange={e => setEnergyValue(e.target.value)} className="font-mono text-sm" type="number" />
                  </div>
                </div>
                <ActionButton icon={Gauge} label="MeterValues verzenden" onClick={sendMeterValues} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Log */}
        <div className="rounded-xl border border-border bg-card flex flex-col max-h-[calc(100vh-12rem)]">
          <div className="border-b border-border px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Berichtenlog</h2>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setLogs([])}>
              Wissen
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {logs.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">Nog geen berichten verstuurd</p>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    log.status === 'error'
                      ? 'border-destructive/30 bg-destructive/5'
                      : log.direction === 'send'
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${log.direction === 'send' ? 'text-primary' : 'text-foreground'}`}>
                        {log.direction === 'send' ? '→' : '←'}
                      </span>
                      <span className="font-mono font-semibold text-foreground">{log.action}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">{log.time}</span>
                  </div>
                  <pre className="font-mono text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                    {log.payload}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Simulator;
