import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Zap, ZapOff, Activity } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry, OcppSendFn } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
  sendOcpp: OcppSendFn;
}

interface ActiveTransaction {
  txId: number;
  idTag: string;
  connectorId: number;
  meterStart: number;
  startTime: number;
  totalEnergy: number; // Wh cumulative
}

const SCENARIOS = [
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'start_session', label: 'Start laadsessie (Authorize → Start → Charging)' },
  { id: 'stop_session', label: 'Stop actieve laadsessie' },
  { id: 'status_available', label: 'StatusNotification → Available' },
  { id: 'status_preparing', label: 'StatusNotification → Preparing' },
  { id: 'status_charging', label: 'StatusNotification → Charging' },
  { id: 'status_faulted', label: 'StatusNotification → Faulted (OverCurrent)' },
  { id: 'meter_values', label: 'MeterValues (eenmalig)' },
  { id: 'authorize', label: 'Authorize RFID tag' },
];

const ECCliteDebugLog = ({ controller, addLog, sendOcpp }: Props) => {
  const [scenario, setScenario] = useState('heartbeat');
  const [running, setRunning] = useState(false);
  const [activeTx, setActiveTx] = useState<ActiveTransaction | null>(null);
  const [pollInterval, setPollInterval] = useState(30);
  const [pollCount, setPollCount] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTxRef = useRef<ActiveTransaction | null>(null);

  // Keep ref in sync with state for use in interval callback
  useEffect(() => {
    activeTxRef.current = activeTx;
  }, [activeTx]);

  // Cleanup poll timer on unmount or disconnect
  useEffect(() => {
    if (!controller.connected && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      setActiveTx(null);
      setPollCount(0);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [controller.connected]);

  const isoTs = () => new Date().toISOString();

  const sendMeterPoll = useCallback(async () => {
    const tx = activeTxRef.current;
    if (!tx) return;

    const elapsed = (Date.now() - tx.startTime) / 1000; // seconds
    const chargePowerW = 7200 + Math.random() * 600; // ~7.2-7.8 kW
    const energyIncrement = (chargePowerW / 3600) * pollInterval; // Wh added per interval
    const newTotalEnergy = tx.totalEnergy + energyIncrement;

    // Update cumulative energy
    setActiveTx(prev => prev ? { ...prev, totalEnergy: newTotalEnergy } : null);

    const voltage = (228 + Math.random() * 6).toFixed(1);
    const current = (chargePowerW / 230).toFixed(1);

    addLog(`KWH:AD[1]RG[FC00]REC[9,9]...OK P=${chargePowerW.toFixed(0)}W I=${current}A`, 'blue');

    try {
      await sendOcpp('MeterValues', {
        connectorId: tx.connectorId,
        transactionId: tx.txId,
        meterValue: [{
          timestamp: isoTs(),
          sampledValue: [
            { value: chargePowerW.toFixed(0), measurand: 'Power.Active.Import', unit: 'W' },
            { value: newTotalEnergy.toFixed(0), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
            { value: voltage, measurand: 'Voltage', unit: 'V', phase: 'L1' },
            { value: current, measurand: 'Current.Import', unit: 'A', phase: 'L1' },
          ],
        }],
      });
      setPollCount(prev => prev + 1);
      addLog(`MeterValues OK [${(newTotalEnergy / 1000).toFixed(2)} kWh | ${Math.round(elapsed)}s]`, 'green');
    } catch (err) {
      addLog(`MeterValues poll failed: ${(err as Error).message}`, 'red');
    }
  }, [addLog, sendOcpp, pollInterval]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    addLog(`MeterValues auto-polling started (every ${pollInterval}s)`, 'green');
    // Send first immediately
    sendMeterPoll();
    pollTimerRef.current = setInterval(sendMeterPoll, pollInterval * 1000);
  }, [pollInterval, sendMeterPoll, addLog]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    addLog(`MeterValues auto-polling stopped`, 'yellow');
  }, [addLog]);

  const runScenario = async () => {
    if (!controller.connected) return;
    setRunning(true);

    try {
      switch (scenario) {
        case 'heartbeat': {
          addLog(`Sending Heartbeat...`, 'blue');
          const result = await sendOcpp('Heartbeat', {}) as { currentTime?: string };
          if (result?.currentTime) {
            addLog(`Server time: ${result.currentTime}`, 'green');
          }
          break;
        }

        case 'start_session': {
          if (activeTx) {
            addLog(`Er is al een actieve sessie (txId=${activeTx.txId}). Stop deze eerst.`, 'red');
            break;
          }

          const idTag = '04A2B3C4D5E6';

          // StatusNotification Preparing
          addLog(`CHGFLAGS[0][0,12000000][RFID][39]`, 'blue');
          addLog(`LEDSTATE CH[0] state[Preparing(112)]`, 'blue');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Preparing',
            errorCode: 'NoError',
            info: 'M3[0/0]S[12000000:RFID]',
            timestamp: isoTs(),
          });

          // Authorize
          addLog(`PKT found on RFID2 port`, 'blue');
          addLog(`RFID: Tag read: ${idTag}`, 'blue');
          const authResult = await sendOcpp('Authorize', { idTag }) as { idTagInfo?: { status?: string } };
          const authStatus = authResult?.idTagInfo?.status || 'Unknown';
          addLog(`Authorize: ${authStatus}`, authStatus === 'Accepted' ? 'green' : 'red');

          if (authStatus !== 'Accepted') {
            addLog(`Authorization rejected, aborting session`, 'red');
            await sendOcpp('StatusNotification', {
              connectorId: 1, status: 'Available', errorCode: 'NoError', timestamp: isoTs(),
            });
            break;
          }

          // StartTransaction
          addLog(`LEDSTATE CH[0] state[Charging(113)]`, 'green');
          const startResult = await sendOcpp('StartTransaction', {
            connectorId: 1,
            idTag,
            meterStart: 0,
            timestamp: isoTs(),
          }) as { transactionId?: number; idTagInfo?: { status?: string } };

          const txId = startResult?.transactionId || Math.floor(Math.random() * 90000) + 10000;
          addLog(`Transaction started: txId=${txId}`, 'green');

          // StatusNotification Charging
          addLog(`CHGFLAGS[0][12000000,12000800][KWH error,RFID][28]`, 'yellow');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Charging',
            errorCode: 'NoError',
            info: 'M3[0/0]S[12000800:KWH error,RFID]',
            timestamp: isoTs(),
          });

          // Set active transaction and start auto-polling
          const tx: ActiveTransaction = {
            txId,
            idTag,
            connectorId: 1,
            meterStart: 0,
            startTime: Date.now(),
            totalEnergy: 0,
          };
          setActiveTx(tx);
          activeTxRef.current = tx;

          // Start MeterValues polling
          setTimeout(() => startPolling(), 500);
          break;
        }

        case 'stop_session': {
          if (!activeTx) {
            addLog(`Geen actieve sessie om te stoppen`, 'red');
            break;
          }

          // Stop polling
          stopPolling();

          const elapsed = (Date.now() - activeTx.startTime) / 1000;
          const finalEnergy = activeTx.totalEnergy;

          // StopTransaction
          addLog(`LEDSTATE CH[0] state[Finishing(114)]`, 'yellow');
          await sendOcpp('StopTransaction', {
            transactionId: activeTx.txId,
            meterStop: Math.round(finalEnergy),
            timestamp: isoTs(),
            idTag: activeTx.idTag,
            reason: 'EVDisconnected',
          });
          addLog(`Transaction stopped: ${(finalEnergy / 1000).toFixed(2)} kWh in ${Math.round(elapsed)}s`, 'green');

          // StatusNotification Available
          addLog(`LEDSTATE CH[0] state[Available(110)]`, 'green');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Available',
            errorCode: 'NoError',
            timestamp: isoTs(),
          });

          setActiveTx(null);
          setPollCount(0);
          addLog(`Session complete`, 'green');
          break;
        }

        case 'status_available': {
          addLog(`LEDSTATE CH[0] state[Available(110)]`, 'green');
          await sendOcpp('StatusNotification', {
            connectorId: 1, status: 'Available', errorCode: 'NoError', timestamp: isoTs(),
          });
          break;
        }

        case 'status_preparing': {
          addLog(`LEDSTATE CH[0] state[Preparing(112)]`, 'blue');
          await sendOcpp('StatusNotification', {
            connectorId: 1, status: 'Preparing', errorCode: 'NoError',
            info: 'M3[0/0]S[12000000:RFID]', timestamp: isoTs(),
          });
          break;
        }

        case 'status_charging': {
          addLog(`LEDSTATE CH[0] state[Charging(113)]`, 'green');
          await sendOcpp('StatusNotification', {
            connectorId: 1, status: 'Charging', errorCode: 'NoError', timestamp: isoTs(),
          });
          break;
        }

        case 'status_faulted': {
          addLog(`CTRL: Overcurrent detected! I=18.2A > max=16A`, 'red');
          addLog(`CTRL: Emergency RELAY OFF CH[0]`, 'red');
          addLog(`LEDSTATE CH[0] state[Faulted(115)]`, 'red');
          await sendOcpp('StatusNotification', {
            connectorId: 1, status: 'Faulted', errorCode: 'OverCurrentFailure',
            info: 'I=18.2A>16A RELAY OFF', timestamp: isoTs(),
          });
          break;
        }

        case 'meter_values': {
          const power = (7200 + Math.random() * 800).toFixed(0);
          const energy = (Math.random() * 50000).toFixed(0);
          addLog(`KWH:AD[1]RG[FC00]REC[9,9]...OK P=${power}W E=${energy}Wh`, 'blue');
          await sendOcpp('MeterValues', {
            connectorId: 1,
            ...(activeTx ? { transactionId: activeTx.txId } : {}),
            meterValue: [{
              timestamp: isoTs(),
              sampledValue: [
                { value: power, measurand: 'Power.Active.Import', unit: 'W' },
                { value: energy, measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
              ],
            }],
          });
          break;
        }

        case 'authorize': {
          const idTag = '04A2B3C4D5E6';
          addLog(`PKT found on RFID2 port`, 'blue');
          addLog(`RFID: Tag read: ${idTag}`, 'blue');
          const result = await sendOcpp('Authorize', { idTag }) as { idTagInfo?: { status?: string } };
          const status = result?.idTagInfo?.status || 'Unknown';
          addLog(`Authorize: ${status}`, status === 'Accepted' ? 'green' : 'red');
          break;
        }
      }
    } catch (err) {
      addLog(`Scenario error: ${(err as Error).message}`, 'red');
    }

    setRunning(false);
  };

  const elapsedStr = activeTx
    ? `${Math.round((Date.now() - activeTx.startTime) / 1000)}s`
    : '-';

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Debug Scenario's</h2>
        {activeTx && (
          <Badge variant="default" className="gap-1.5 bg-emerald-600 animate-pulse">
            <Activity className="h-3 w-3" />
            Sessie actief (txId={activeTx.txId})
          </Badge>
        )}
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground">
          Voer OCPP scenario's uit. In live-modus worden echte OCPP berichten verstuurd naar VoltControl.
        </p>

        {/* Active transaction panel */}
        {activeTx && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-foreground">Actieve Laadsessie</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <span className="text-muted-foreground block">TxId</span>
                <span className="text-foreground font-semibold">{activeTx.txId}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Energie</span>
                <span className="text-foreground font-semibold">{(activeTx.totalEnergy / 1000).toFixed(2)} kWh</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Duur</span>
                <span className="text-foreground font-semibold">{elapsedStr}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Polls</span>
                <span className="text-foreground font-semibold">{pollCount}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1 flex-1">
                <Label className="text-xs text-muted-foreground">Poll interval (seconden)</Label>
                <Input
                  type="number"
                  min={5}
                  max={300}
                  value={pollInterval}
                  onChange={e => setPollInterval(Math.max(5, Number(e.target.value)))}
                  className="font-mono text-xs h-8 w-24"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { stopPolling(); startPolling(); }}
                className="gap-1.5 text-xs mt-5"
              >
                <Activity className="h-3 w-3" />
                Herstart polling
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { setScenario('stop_session'); }}
                className="gap-1.5 text-xs mt-5"
              >
                <ZapOff className="h-3 w-3" />
                Stop sessie
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Scenario</Label>
            <Select value={scenario} onValueChange={setScenario}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={runScenario}
            disabled={!controller.connected || running}
            className="w-full gap-2 h-11"
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? 'Scenario draait...' : 'Scenario uitvoeren'}
          </Button>
        </div>

        {!controller.connected && (
          <p className="text-xs text-destructive text-center">
            Verbind eerst met de controller
          </p>
        )}

        <div className="rounded-lg bg-muted/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Controller Status</h3>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <span className="text-muted-foreground">Model:</span>
            <span className="text-foreground">{controller.model}</span>
            <span className="text-muted-foreground">Firmware:</span>
            <span className="text-foreground">{controller.firmwareVersion}</span>
            <span className="text-muted-foreground">OCPP ID:</span>
            <span className="text-foreground">{controller.ocppId}</span>
            <span className="text-muted-foreground">Serial:</span>
            <span className="text-foreground">{controller.serialNumber}</span>
            <span className="text-muted-foreground">Status:</span>
            <span className={controller.connected ? 'text-emerald-500' : 'text-destructive'}>
              {controller.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ECCliteDebugLog;
