import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Play, Pause, RotateCcw } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const SCENARIOS = [
  { id: 'idle', label: 'Idle (standby)' },
  { id: 'charge_session', label: 'Volledige laadsessie' },
  { id: 'grid_balancing', label: 'Grid load balancing' },
  { id: 'ocpp_disconnect', label: 'OCPP disconnect/reconnect' },
  { id: 'error_overcurrent', label: 'Overcurrent fout' },
  { id: 'kwh_timeout', label: 'KWH meter timeout' },
];

const ECCliteDebugLog = ({ controller, addLog }: Props) => {
  const [scenario, setScenario] = useState('idle');
  const [running, setRunning] = useState(false);

  const runScenario = async () => {
    if (!controller.connected) return;
    setRunning(true);

    switch (scenario) {
      case 'idle':
        addLog('KWH:AD[1]RG[FC00]REC[9,9]...OK', 'blue');
        await new Promise(r => setTimeout(r, 300));
        addLog('KWH:AD[2]RG[FC00]REC[9,9]...OK', 'blue');
        await new Promise(r => setTimeout(r, 300));
        addLog('Heartbeat sent', 'blue');
        addLog('Heartbeat Accepted', 'blue');
        await new Promise(r => setTimeout(r, 200));
        addLog('CH1: Available | CH2: Available', 'blue');
        addLog('Grid: 0.0kW | Station: 0.0kW', 'blue');
        break;

      case 'charge_session':
        addLog('CH1: CP signal detected', 'blue');
        addLog('CH1: State B → Preparing', 'blue');
        await new Promise(r => setTimeout(r, 300));
        addLog('RFID: Tag presented: 04:A2:B3:C4:D5:E6', 'blue');
        addLog('OCPP: Authorize idTag=04A2B3C4D5E6', 'blue');
        await new Promise(r => setTimeout(r, 200));
        addLog('OCPP: Authorize Accepted', 'green');
        addLog('CH1: State C → Charging', 'green');
        addLog('OCPP: StartTransaction connectorId=1 idTag=04A2B3C4D5E6 meterStart=0', 'blue');
        await new Promise(r => setTimeout(r, 200));
        addLog('OCPP: StartTransaction Accepted txId=42001', 'green');
        
        for (let i = 1; i <= 5; i++) {
          await new Promise(r => setTimeout(r, 400));
          const power = (7200 + Math.random() * 400).toFixed(0);
          const energy = (i * 2400).toFixed(0);
          addLog(`KWH:CH1 P=${power}W E=${energy}Wh PF=0.98 V=230.${(Math.random() * 9).toFixed(0)}V`, 'blue');
          addLog(`OCPP: MeterValues txId=42001 P=${power}W E=${energy}Wh`, 'blue');
        }
        
        await new Promise(r => setTimeout(r, 300));
        addLog('CH1: EV stopped charging (State C → B)', 'yellow');
        addLog('OCPP: StopTransaction txId=42001 meterStop=12000 reason=EVDisconnected', 'blue');
        addLog('OCPP: StopTransaction Accepted', 'green');
        addLog('CH1: Cable disconnected → Available', 'blue');
        addLog('Session complete: 12.0 kWh delivered', 'green');
        break;

      case 'grid_balancing':
        addLog('Grid: Role=Station_ctrl MaxCurrent=25A', 'blue');
        addLog('Grid: CH1 charging at 16A, CH2 charging at 16A', 'blue');
        addLog('Grid: Total=32A > Max=25A → Balancing required', 'yellow');
        await new Promise(r => setTimeout(r, 300));
        addLog('Grid: Adjusting CH1: 16A → 13A', 'yellow');
        addLog('Grid: Adjusting CH2: 16A → 12A', 'yellow');
        addLog('Grid: Total=25A ≤ Max=25A → OK', 'green');
        await new Promise(r => setTimeout(r, 300));
        addLog('OCPP: SetChargingProfile CH1 limit=13A', 'blue');
        addLog('OCPP: SetChargingProfile CH2 limit=12A', 'blue');
        addLog('Grid: Balance maintained', 'green');
        break;

      case 'ocpp_disconnect':
        addLog('OCPP: WebSocket connection lost', 'red');
        addLog('OCPP: Reconnecting in 30s...', 'yellow');
        await new Promise(r => setTimeout(r, 600));
        addLog('OCPP: Reconnect attempt 1/5...', 'yellow');
        addLog('OCPP: Connection failed (timeout)', 'red');
        await new Promise(r => setTimeout(r, 400));
        addLog('OCPP: Reconnect attempt 2/5...', 'yellow');
        addLog('OCPP: WebSocket connected', 'green');
        addLog('OCPP: BootNotification sent', 'blue');
        addLog('OCPP: BootNotification Accepted, interval=300', 'green');
        addLog('OCPP: Syncing offline transactions...', 'blue');
        addLog('OCPP: 2 offline transactions synced', 'green');
        break;

      case 'error_overcurrent':
        addLog('CH1: Charging at 16A', 'blue');
        addLog('CTRL: Overcurrent detected! I=18.2A > max=16A', 'red');
        addLog('CTRL: Emergency stop CH1', 'red');
        addLog('CH1: Relay OFF', 'red');
        addLog('OCPP: StatusNotification connectorId=1 status=Faulted errorCode=OverCurrentFailure', 'red');
        await new Promise(r => setTimeout(r, 400));
        addLog('CTRL: Overcurrent cleared. Waiting 30s cooldown...', 'yellow');
        await new Promise(r => setTimeout(r, 500));
        addLog('CTRL: Cooldown complete. CH1 resuming.', 'green');
        addLog('OCPP: StatusNotification connectorId=1 status=Available errorCode=NoError', 'blue');
        break;

      case 'kwh_timeout':
        addLog('KWH:AD[1]RG[FC00]REC[9,9]ERR[TO]', 'red');
        await new Promise(r => setTimeout(r, 300));
        addLog('KWH:AD[2]RG[FC00]REC[9,9]ERR[TO]', 'red');
        addLog('MODBUS: No response from meter addr=1 (timeout 2000ms)', 'red');
        await new Promise(r => setTimeout(r, 300));
        addLog('KWH:AD[1]RG[FC00]REC[9,9]...OK (retry)', 'yellow');
        addLog('MODBUS: Meter addr=1 recovered', 'green');
        addLog('KWH:AD[2]RG[FC00]REC[9,9]...OK (retry)', 'yellow');
        addLog('MODBUS: Meter addr=2 recovered', 'green');
        break;
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
          Simuleer verschillende operationele scenario's van de Ecotap controller. Output verschijnt in de seriële log.
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
            <span className="text-muted-foreground">Serial:</span>
            <span className="text-foreground">{controller.serialNumber}</span>
            <span className="text-muted-foreground">OCPP ID:</span>
            <span className="text-foreground">{controller.ocppId}</span>
            <span className="text-muted-foreground">Grid Role:</span>
            <span className="text-foreground">{controller.config['grid_Role']}</span>
            <span className="text-muted-foreground">Max Current:</span>
            <span className="text-foreground">{controller.config['chg_StationMaxCurrent']}A</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ECCliteDebugLog;
