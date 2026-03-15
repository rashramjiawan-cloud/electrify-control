import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Play, Pause } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry, OcppSendFn } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
  sendOcpp: OcppSendFn;
}

const SCENARIOS = [
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'charge_session', label: 'Volledige laadsessie (RFID → Start → Meter → Stop)' },
  { id: 'status_available', label: 'StatusNotification → Available' },
  { id: 'status_preparing', label: 'StatusNotification → Preparing' },
  { id: 'status_charging', label: 'StatusNotification → Charging' },
  { id: 'status_faulted', label: 'StatusNotification → Faulted (OverCurrent)' },
  { id: 'meter_values', label: 'MeterValues (sample reading)' },
  { id: 'authorize', label: 'Authorize RFID tag' },
];

const ECCliteDebugLog = ({ controller, addLog, sendOcpp }: Props) => {
  const [scenario, setScenario] = useState('heartbeat');
  const [running, setRunning] = useState(false);

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  const isoTs = () => new Date().toISOString();

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

        case 'charge_session': {
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
          await delay(300);

          // Authorize
          addLog(`PKT found on RFID2 port`, 'blue');
          addLog(`RFID: Tag read: ${idTag}`, 'blue');
          const authResult = await sendOcpp('Authorize', { idTag }) as { idTagInfo?: { status?: string } };
          const authStatus = authResult?.idTagInfo?.status || 'Unknown';
          addLog(`Authorize result: ${authStatus}`, authStatus === 'Accepted' ? 'green' : 'red');

          if (authStatus !== 'Accepted') {
            addLog(`Authorization rejected, aborting session`, 'red');
            break;
          }
          await delay(200);

          // StartTransaction
          addLog(`LEDSTATE CH[0] state[Charging(113)]`, 'green');
          const startResult = await sendOcpp('StartTransaction', {
            connectorId: 1,
            idTag,
            meterStart: 0,
            timestamp: isoTs(),
          }) as { transactionId?: number; idTagInfo?: { status?: string } };

          const txId = startResult?.transactionId;
          addLog(`Transaction started: txId=${txId}`, 'green');
          await delay(200);

          // StatusNotification Charging
          addLog(`CHGFLAGS[0][12000000,12000800][KWH error,RFID][28]`, 'yellow');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Charging',
            errorCode: 'NoError',
            info: 'M3[0/0]S[12000800:KWH error,RFID]',
            timestamp: isoTs(),
          });
          await delay(400);

          // MeterValues (3 rounds)
          for (let i = 1; i <= 3; i++) {
            const power = (7200 + Math.random() * 400).toFixed(0);
            const energy = (i * 2400).toFixed(0);
            addLog(`KWH:AD[1]RG[FC00]REC[9,9]...OK P=${power}W`, 'blue');
            await sendOcpp('MeterValues', {
              connectorId: 1,
              transactionId: txId,
              meterValue: [{
                timestamp: isoTs(),
                sampledValue: [
                  { value: power, measurand: 'Power.Active.Import', unit: 'W' },
                  { value: energy, measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
                ],
              }],
            });
            await delay(300);
          }

          // StopTransaction
          addLog(`LEDSTATE CH[0] state[Finishing(114)]`, 'yellow');
          await sendOcpp('StopTransaction', {
            transactionId: txId,
            meterStop: 12000,
            timestamp: isoTs(),
            idTag,
            reason: 'EVDisconnected',
          });
          addLog(`Transaction stopped: 12.0 kWh delivered`, 'green');

          // StatusNotification Available
          addLog(`LEDSTATE CH[0] state[Available(110)]`, 'green');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Available',
            errorCode: 'NoError',
            timestamp: isoTs(),
          });
          addLog(`Session complete`, 'green');
          break;
        }

        case 'status_available': {
          addLog(`LEDSTATE CH[0] state[Available(110)]`, 'green');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Available',
            errorCode: 'NoError',
            timestamp: isoTs(),
          });
          break;
        }

        case 'status_preparing': {
          addLog(`LEDSTATE CH[0] state[Preparing(112)]`, 'blue');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Preparing',
            errorCode: 'NoError',
            info: 'M3[0/0]S[12000000:RFID]',
            timestamp: isoTs(),
          });
          break;
        }

        case 'status_charging': {
          addLog(`LEDSTATE CH[0] state[Charging(113)]`, 'green');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Charging',
            errorCode: 'NoError',
            timestamp: isoTs(),
          });
          break;
        }

        case 'status_faulted': {
          addLog(`CTRL: Overcurrent detected! I=18.2A > max=16A`, 'red');
          addLog(`CTRL: Emergency RELAY OFF CH[0]`, 'red');
          addLog(`LEDSTATE CH[0] state[Faulted(115)]`, 'red');
          await sendOcpp('StatusNotification', {
            connectorId: 1,
            status: 'Faulted',
            errorCode: 'OverCurrentFailure',
            info: 'I=18.2A>16A RELAY OFF',
            timestamp: isoTs(),
          });
          break;
        }

        case 'meter_values': {
          const power = (7200 + Math.random() * 800).toFixed(0);
          const energy = (Math.random() * 50000).toFixed(0);
          addLog(`KWH:AD[1]RG[FC00]REC[9,9]...OK P=${power}W E=${energy}Wh`, 'blue');
          await sendOcpp('MeterValues', {
            connectorId: 1,
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

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Debug Scenario's</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground">
          Voer OCPP scenario's uit. In live-modus worden echte OCPP berichten verstuurd naar VoltControl.
        </p>

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
            <span className={controller.connected ? 'text-green-500' : 'text-red-500'}>
              {controller.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ECCliteDebugLog;
