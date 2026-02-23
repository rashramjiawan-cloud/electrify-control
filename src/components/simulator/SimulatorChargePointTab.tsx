import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Radio, Zap, Square, Gauge, KeyRound, ChevronRight } from 'lucide-react';
import SimulatorLog, { type LogEntry } from './SimulatorLog';

const OCPP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-handler`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ChargePointConfig {
  id: string;
  label: string;
}

interface Props {
  config: ChargePointConfig;
}

const SimulatorChargePointTab = ({ config }: Props) => {
  const [chargePointId, setChargePointId] = useState(config.id);
  const [vendor, setVendor] = useState('Alfen');
  const [model, setModel] = useState('Eve Single Pro');
  const [serial, setSerial] = useState(`SIM-2026-${config.id}`);
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
  const logCounterRef = useRef(0);

  const addLog = useCallback((action: string, direction: 'send' | 'receive', payload: unknown, status: 'success' | 'error') => {
    const entry: LogEntry = {
      id: Date.now() + logCounterRef.current++,
      time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action,
      direction,
      payload: JSON.stringify(payload, null, 2),
      status,
    };
    setLogs(prev => [entry, ...prev].slice(0, 50));
  }, []);

  const sendOcpp = useCallback(async (action: string, payload: Record<string, unknown>) => {
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
        toast.success(`[${chargePointId}] ${action} → Accepted`);

        if (action === 'StartTransaction' && data[2]?.transactionId) {
          setTransactionId(String(data[2].transactionId));
        }
      } else {
        addLog(action, 'receive', data, 'error');
        toast.error(`[${chargePointId}] ${action} failed`);
      }
    } catch (err) {
      addLog(action, 'receive', { error: (err as Error).message }, 'error');
      toast.error(`[${chargePointId}] ${action} error: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }, [chargePointId, addLog]);

  const runFullFlow = async () => {
    toast.info(`[${chargePointId}] Volledige laadsessie starten...`);
    await sendOcpp('BootNotification', { chargePointVendor: vendor, chargePointModel: model, chargePointSerialNumber: serial, firmwareVersion: firmware });
    await new Promise(r => setTimeout(r, 500));
    await sendOcpp('StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
    await new Promise(r => setTimeout(r, 300));
    await sendOcpp('Authorize', { idTag });
    await new Promise(r => setTimeout(r, 300));

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

    toast.success(`[${chargePointId}] Volledige laadsessie afgerond! (11 kWh)`);
  };

  const ActionButton = ({ icon: Icon, label, onClick, variant = 'outline' as const }: { icon: React.ElementType; label: string; onClick: () => void; variant?: 'outline' | 'default' }) => (
    <Button variant={variant} onClick={onClick} disabled={sending} className="justify-start gap-2 h-auto py-3">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm">{label}</span>
    </Button>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
            <Button onClick={runFullFlow} disabled={sending} className="w-full gap-2 h-12 text-sm font-semibold">
              <Play className="h-4 w-4" />
              Volledige laadsessie simuleren (Boot → Start → Meter → Stop)
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">of individuele acties</span></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <ActionButton icon={Radio} label="BootNotification" onClick={() => sendOcpp('BootNotification', { chargePointVendor: vendor, chargePointModel: model, chargePointSerialNumber: serial, firmwareVersion: firmware })} />
              <ActionButton icon={Zap} label="Heartbeat" onClick={() => sendOcpp('Heartbeat', {})} />
              <ActionButton icon={KeyRound} label="Authorize" onClick={() => sendOcpp('Authorize', { idTag })} />
              <div className="space-y-1.5">
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
                <ActionButton icon={ChevronRight} label="StatusNotification" onClick={() => sendOcpp('StatusNotification', { connectorId: Number(connectorId), status: connectorStatus, errorCode: 'NoError' })} />
              </div>
              <ActionButton icon={Play} label="StartTransaction" onClick={() => sendOcpp('StartTransaction', { connectorId: Number(connectorId), idTag, meterStart: Number(meterStart), timestamp: new Date().toISOString() })} variant="default" />
              <ActionButton icon={Square} label="StopTransaction" onClick={() => sendOcpp('StopTransaction', { transactionId: Number(transactionId), meterStop: Number(meterStop), timestamp: new Date().toISOString(), idTag, reason: 'Local' })} />
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
              <ActionButton icon={Gauge} label="MeterValues verzenden" onClick={() => sendOcpp('MeterValues', {
                connectorId: Number(connectorId),
                transactionId: transactionId ? Number(transactionId) : undefined,
                meterValue: [{
                  timestamp: new Date().toISOString(),
                  sampledValue: [
                    { value: powerValue, measurand: 'Power.Active.Import', unit: 'W' },
                    { value: energyValue, measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
                  ],
                }],
              })} />
            </div>
          </div>
        </div>
      </div>

      {/* Right: Log */}
      <SimulatorLog logs={logs} onClear={() => setLogs([])} />
    </div>
  );
};

export default SimulatorChargePointTab;
