import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Play, Pause } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const SCENARIOS = [
  { id: 'idle', label: 'Idle – KWH polling + heartbeat' },
  { id: 'charge_session', label: 'Volledige laadsessie (RFID → Start → Meter → Stop)' },
  { id: 'kwh_error', label: 'KWH meter timeout errors' },
  { id: 'ocpp_status_sync', label: 'OCPP Status sync (buffered events)' },
  { id: 'grid_balancing', label: 'Grid load balancing' },
  { id: 'ocpp_disconnect', label: 'WebSocket disconnect/reconnect' },
  { id: 'get_configuration', label: 'OCPP GetConfiguration request' },
  { id: 'error_overcurrent', label: 'Overcurrent fout (Relay OFF)' },
];

const ECCliteDebugLog = ({ controller, addLog }: Props) => {
  const [scenario, setScenario] = useState('idle');
  const [running, setRunning] = useState(false);

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  const ts = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
  const isoTs = () => new Date().toISOString().replace(/\.\d+Z$/, '+00:00');

  const runScenario = async () => {
    if (!controller.connected) return;
    setRunning(true);

    const sn = controller.serialNumber;
    const ocppId = controller.ocppId;
    let sq = 3200 + Math.floor(Math.random() * 100);

    switch (scenario) {
      case 'idle': {
        addLog(`SYS:EV[45,625]CAN[1,2]WS[10]`, 'blue');
        await delay(200);
        addLog(`KWH:AD[1]RG[8900]REC[221,221]ERR[TO]`, 'red');
        await delay(200);
        addLog(`KWH:AD[2]RG[8900]REC[221,221]ERR[TO]`, 'red');
        await delay(300);
        addLog(`=========      =======`, 'blue');
        addLog(`Heap Size      : 0k (max:0k) (10005734-10005734)`, 'blue');
        addLog(`Stack size     : 0k (10006BD0), max:5.0kb Gap:5.2kb`, 'blue');
        addLog(`IP free Heap   : 7k`, 'blue');
        addLog(`=========      =======`, 'blue');
        await delay(300);
        sq++;
        addLog(`OCPP OUTREQ[Heartbeat,181]`, 'blue');
        addLog(`OCPP OUT:[0][25]---------`, 'blue');
        addLog(`[2,"${sq}","Heartbeat",{}]`, 'blue');
        addLog(`END--------------`, 'blue');
        addLog(`Sending 1/1359 (31b) OCPP EVENTS, 0 waiting`, 'blue');
        await delay(200);
        addLog(`OCPP INPUT:[2800][48]---------`, 'blue');
        addLog(`[3,"${sq}",{"currentTime":"${new Date().toISOString()}"}`, 'green');
        addLog(`END--------------`, 'blue');
        addLog(`ocpp_process_incoming_request(2800-2830):`, 'blue');
        addLog(`get_delim_str([3,"${sq}",{):OK`, 'blue');
        addLog(`OCPP RESP(280A-2830) Type[3]SQ[${sq}]`, 'blue');
        addLog(`get_json_str(currentTime):[${new Date().toISOString()}]`, 'blue');
        addLog(`Date valid:${ts()}`, 'blue');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        break;
      }

      case 'charge_session': {
        // CP signal detect
        addLog(`CHGFLAGS[0][0,12000000][RFID][39]`, 'blue');
        addLog(`LEDSTATE CH[0] state[Preparing(112)]`, 'blue');
        await delay(300);

        // StatusNotification Preparing
        sq++;
        addLog(`ADDEV[OCPP status,182,100]CH[1]IDX[46]CMD[0]SQ[${sq}]T[${ts()}]`, 'blue');
        addLog(`OCPP OUTREQ[OCPP status,182]`, 'blue');
        addLog(`OCPP OUT:[0][165]---------`, 'blue');
        addLog(`[2,"${sq}","StatusNotification",{"connectorId":1,"status":"Preparing","errorCode":"NoError","info":"M3[0/0]S[12000000:RFID]","timestamp":"${isoTs()}"}]`, 'blue');
        addLog(`END--------------`, 'blue');
        addLog(`Sending 1/1357 (173b) OCPP EVENTS, 0 waiting`, 'blue');
        await delay(200);
        addLog(`OCPP INPUT:[2800][12]---------`, 'blue');
        addLog(`[3,"${sq}",{}`, 'green');
        addLog(`END--------------`, 'blue');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        await delay(300);

        // Authorize
        sq++;
        const idTag = '04A2B3C4D5E6';
        addLog(`PKT found on RFID2 port`, 'blue');
        addLog(`RFID: Tag read: ${idTag}`, 'blue');
        addLog(`OCPP OUTREQ[Authorize,101]`, 'blue');
        addLog(`OCPP OUT:[0][52]---------`, 'blue');
        addLog(`[2,"${sq}","Authorize",{"idTag":"${idTag}"}]`, 'blue');
        addLog(`END--------------`, 'blue');
        await delay(200);
        addLog(`OCPP INPUT:[2800][42]---------`, 'blue');
        addLog(`[3,"${sq}",{"idTagInfo":{"status":"Accepted"}}`, 'green');
        addLog(`END--------------`, 'blue');
        addLog(`get_json_str(status):[Accepted]`, 'green');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        await delay(200);

        // StartTransaction
        sq++;
        addLog(`LEDSTATE CH[0] state[Charging(113)]`, 'green');
        addLog(`OCPP OUTREQ[StartTransaction,104]`, 'blue');
        addLog(`OCPP OUT:[0][120]---------`, 'blue');
        addLog(`[2,"${sq}","StartTransaction",{"connectorId":1,"idTag":"${idTag}","meterStart":0,"timestamp":"${isoTs()}"}]`, 'blue');
        addLog(`END--------------`, 'blue');
        addLog(`Sending 1/1356 (128b) OCPP EVENTS, 0 waiting`, 'blue');
        await delay(300);
        const txId = 42000 + Math.floor(Math.random() * 1000);
        addLog(`OCPP INPUT:[2800][60]---------`, 'blue');
        addLog(`[3,"${sq}",{"idTagInfo":{"status":"Accepted"},"transactionId":${txId}}`, 'green');
        addLog(`END--------------`, 'blue');
        addLog(`get_json_int32(transactionId):[${txId}]`, 'blue');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        await delay(300);

        // StatusNotification Charging
        sq++;
        addLog(`CHGFLAGS[0][12000000,12000800][KWH error,RFID][28]`, 'yellow');
        addLog(`ADDEV[OCPP status,182,54]CH[1]IDX[50]CMD[0]SQ[${sq}]T[${ts()}]`, 'blue');
        addLog(`OCPP OUTREQ[OCPP status,182]`, 'blue');
        addLog(`OCPP OUT:[0][174]---------`, 'blue');
        addLog(`[2,"${sq}","StatusNotification",{"connectorId":1,"status":"Charging","errorCode":"NoError","info":"M3[0/0]S[12000800:KWH error,RFID]","timestamp":"${isoTs()}"}]`, 'blue');
        addLog(`END--------------`, 'blue');
        await delay(200);
        addLog(`OCPP INPUT:[2800][12]---------`, 'blue');
        addLog(`[3,"${sq}",{}`, 'green');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        await delay(400);

        // MeterValues
        for (let i = 1; i <= 3; i++) {
          sq++;
          const power = (7200 + Math.random() * 400).toFixed(0);
          const energy = (i * 2400).toFixed(0);
          addLog(`KWH:AD[1]RG[FC00]REC[9,9]...OK`, 'blue');
          addLog(`OCPP OUTREQ[MeterValues,108]`, 'blue');
          addLog(`OCPP OUT:[0][180]---------`, 'blue');
          addLog(`[2,"${sq}","MeterValues",{"connectorId":1,"transactionId":${txId},"meterValue":[{"timestamp":"${isoTs()}","sampledValue":[{"value":"${power}","measurand":"Power.Active.Import","unit":"W"},{"value":"${energy}","measurand":"Energy.Active.Import.Register","unit":"Wh"}]}]}]`, 'blue');
          addLog(`END--------------`, 'blue');
          await delay(200);
          addLog(`OCPP INPUT:[2800][12]---------`, 'blue');
          addLog(`[3,"${sq}",{}`, 'green');
          addLog(`OCPP RESP [${sq}] OK`, 'green');
          addLog(`SYS:EV[45,625]CAN[1,2]WS[${10 + i * 5}]`, 'blue');
          await delay(300);
        }

        // StopTransaction
        sq++;
        addLog(`LEDSTATE CH[0] state[Finishing(114)]`, 'yellow');
        addLog(`OCPP OUTREQ[StopTransaction,106]`, 'blue');
        addLog(`OCPP OUT:[0][140]---------`, 'blue');
        addLog(`[2,"${sq}","StopTransaction",{"transactionId":${txId},"meterStop":12000,"timestamp":"${isoTs()}","idTag":"${idTag}","reason":"EVDisconnected"}]`, 'blue');
        addLog(`END--------------`, 'blue');
        addLog(`Sending 1/1354 (148b) OCPP EVENTS, 0 waiting`, 'blue');
        await delay(300);
        addLog(`OCPP INPUT:[2800][35]---------`, 'blue');
        addLog(`[3,"${sq}",{"idTagInfo":{"status":"Accepted"}}`, 'green');
        addLog(`OCPP RESP [${sq}] OK`, 'green');

        // Back to Available
        sq++;
        addLog(`LEDSTATE CH[0] state[Available(110)]`, 'green');
        addLog(`OCPP OUTREQ[OCPP status,182]`, 'blue');
        addLog(`OCPP OUT:[0][165]---------`, 'blue');
        addLog(`[2,"${sq}","StatusNotification",{"connectorId":1,"status":"Available","errorCode":"NoError","info":"M3[0/0]S[12000800:KWH error,RFID]","timestamp":"${isoTs()}"}]`, 'blue');
        addLog(`END--------------`, 'blue');
        await delay(200);
        addLog(`OCPP INPUT:[2800][12]---------`, 'blue');
        addLog(`[3,"${sq}",{}`, 'green');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        addLog(`Session complete: 12.0 kWh delivered in txId=${txId}`, 'green');
        break;
      }

      case 'kwh_error': {
        for (let i = 0; i < 6; i++) {
          addLog(`KWH:AD[${(i % 2) + 1}]RG[8900]REC[221,221]ERR[TO]`, 'red');
          await delay(300);
          addLog(`SYS:EV[45,616]CAN[1,2]GSM[60,2]`, 'blue');
          await delay(200);
        }
        addLog(`CHGFLAGS[0][12000000,12000800][KWH error,RFID][28]`, 'red');
        addLog(`CHGFLAGS[1][0,2000800][KWH error][28]`, 'red');
        addLog(`LEDSTATE CH[0] state[KWH0 error(116)]`, 'red');
        addLog(`LEDSTATE CH[1] state[KWH0 error(116)]`, 'red');
        break;
      }

      case 'ocpp_status_sync': {
        const statuses = ['Preparing', 'Charging', 'Available', 'Available'];
        const connectors = [1, 1, 1, 2];
        let evCount = 1350;
        for (let i = 0; i < statuses.length; i++) {
          sq++;
          evCount--;
          addLog(`OCPP OUTREQ[OCPP status,182]`, 'blue');
          addLog(`OCPP OUT:[0][${165 + i * 4}]---------`, 'blue');
          addLog(`[2,"${sq}","StatusNotification",{"connectorId":${connectors[i]},"status":"${statuses[i]}","errorCode":"NoError","info":"M3[0/0]S[12000800:KWH error,RFID]","timestamp":"${isoTs()}"}]`, 'blue');
          addLog(`END--------------`, 'blue');
          addLog(`Sending 1/${evCount} (${173 + i * 4}b) OCPP EVENTS, 0 waiting`, 'blue');
          await delay(150);
          addLog(`OCPP INPUT:[2800][12]---------`, 'blue');
          addLog(`[3,"${sq}",{}`, 'green');
          addLog(`END--------------`, 'blue');
          addLog(`ocpp_process_incoming_request(2800-280C):`, 'blue');
          addLog(`get_delim_str([3,"${sq}",{):OK`, 'blue');
          addLog(`OCPP RESP(280A-280C) Type[3]SQ[${sq}]`, 'blue');
          addLog(`OCPP RESP [${sq}] OK`, 'green');
          await delay(200);
        }
        addLog(`All buffered OCPP events synced`, 'green');
        break;
      }

      case 'grid_balancing': {
        const maxI = controller.config['chg_StationMaxCurrent'] || '25';
        addLog(`PGrid[0:STATION CTRL]MIN.I[6]STATION[${maxI}]INSTALLATION[${controller.config['grid_InstallationMaxcurrent'] || '32'}]SUPERVISOR[0]`, 'blue');
        addLog(`Grid: CH1 charging at 16A, CH2 charging at 16A`, 'blue');
        addLog(`Grid: Total=32A > Max=${maxI}A → Balancing required`, 'yellow');
        await delay(300);
        addLog(`Grid: Adjusting CH1: 16A → ${Math.ceil(Number(maxI) / 2)}A`, 'yellow');
        addLog(`Grid: Adjusting CH2: 16A → ${Math.floor(Number(maxI) / 2)}A`, 'yellow');
        addLog(`Grid: Total=${maxI}A ≤ Max=${maxI}A → OK`, 'green');
        await delay(300);
        sq++;
        addLog(`OCPP OUTREQ[SetChargingProfile]`, 'blue');
        addLog(`OCPP OUT:[0][95]---------`, 'blue');
        addLog(`[2,"${sq}","SetChargingProfile",{"connectorId":1,"csChargingProfiles":{"chargingProfileId":1,"stackLevel":0,"chargingProfilePurpose":"TxProfile","chargingProfileKind":"Relative","chargingSchedule":{"chargingRateUnit":"A","chargingSchedulePeriod":[{"startPeriod":0,"limit":${Math.ceil(Number(maxI) / 2)}}]}}}]`, 'blue');
        addLog(`END--------------`, 'blue');
        addLog(`Grid: Balance maintained`, 'green');
        break;
      }

      case 'ocpp_disconnect': {
        addLog(`WS CONNECTION LOST`, 'red');
        addLog(`SYS:EV[45,625]CAN[1,2]`, 'blue');
        await delay(500);
        addLog(`HTTP connect to [52.17.114.8][80][1]...TIMEOUT`, 'red');
        addLog(`WS RECONNECT attempt 1/5...`, 'yellow');
        await delay(400);
        addLog(`HTTP connect to [52.17.114.8][80][1]...TIMEOUT`, 'red');
        addLog(`WS RECONNECT attempt 2/5...`, 'yellow');
        await delay(400);
        addLog(`HTTP connect to [52.17.114.8][80][1]`, 'blue');
        addLog(`WS CONNECTION OK`, 'green');
        addLog(`FORCE CHANNEL STATUS UPD [0]`, 'blue');
        addLog(`FORCE CHANNEL STATUS UPD [1]`, 'blue');
        sq++;
        addLog(`OCPP OUTREQ[Boot,134]`, 'blue');
        addLog(`OCPP OUT:[0][273]---------`, 'blue');
        addLog(`[2,"${sq}","BootNotification",{"chargePointVendor":"Ecotap","chargePointModel":"WG","chargePointSerialNumber":"${sn}","chargeBoxSerialNumber":"${ocppId}","firmwareVersion":"4.3x.32R.16"}]`, 'blue');
        addLog(`END--------------`, 'blue');
        await delay(300);
        addLog(`OCPP INPUT:[2800][83]---------`, 'blue');
        addLog(`[3,"${sq}",{"currentTime":"${new Date().toISOString()}","interval":240,"status":"Accepted"}`, 'green');
        addLog(`END--------------`, 'blue');
        addLog(`${ts()}:OCPP BOOT OK`, 'green');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        addLog(`Sending buffered events: 3 waiting...`, 'yellow');
        await delay(300);
        addLog(`All buffered OCPP events synced`, 'green');
        break;
      }

      case 'get_configuration': {
        const uuid = crypto.randomUUID();
        addLog(`OCPP INPUT:[2800][96]---------`, 'blue');
        addLog(`[2,"${uuid}","GetConfiguration",{"key":["GetConfigurationMaxKeys"]}`, 'blue');
        addLog(`END--------------`, 'blue');
        addLog(`ocpp_process_incoming_request(2800-2860):`, 'blue');
        addLog(`get_delim_str([2,"${uuid.slice(0, 8)}..."):OK`, 'blue');
        addLog(`OCPP REQ Type[2] Action[GetConfiguration]`, 'blue');
        await delay(200);
        addLog(`OCPP OUT:[0][85]---------`, 'blue');
        addLog(`[3,"${uuid}",{"configurationKey":[{"key":"GetConfigurationMaxKeys","readonly":true,"value":"40"}],"unknownKey":[]}]`, 'green');
        addLog(`END--------------`, 'blue');
        addLog(`OCPP RESP [${uuid.slice(0, 8)}] OK`, 'green');
        break;
      }

      case 'error_overcurrent': {
        addLog(`KWH:AD[1]RG[FC00]REC[9,9]...OK P=7400W I=16.2A`, 'blue');
        await delay(200);
        addLog(`KWH:AD[1]RG[FC00]REC[9,9]...OK P=8100W I=18.2A`, 'yellow');
        addLog(`CTRL: Overcurrent detected! I=18.2A > max=16A`, 'red');
        addLog(`CTRL: Emergency RELAY OFF CH[0]`, 'red');
        addLog(`LEDSTATE CH[0] state[Faulted(115)]`, 'red');
        sq++;
        addLog(`ADDEV[OCPP status,182,54]CH[1]IDX[53]CMD[0]SQ[${sq}]T[${ts()}]`, 'blue');
        addLog(`OCPP OUTREQ[OCPP status,182]`, 'blue');
        addLog(`OCPP OUT:[0][180]---------`, 'blue');
        addLog(`[2,"${sq}","StatusNotification",{"connectorId":1,"status":"Faulted","errorCode":"OverCurrentFailure","info":"I=18.2A>16A RELAY OFF","timestamp":"${isoTs()}"}]`, 'red');
        addLog(`END--------------`, 'blue');
        await delay(400);
        addLog(`OCPP INPUT:[2800][12]---------`, 'blue');
        addLog(`[3,"${sq}",{}`, 'green');
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        addLog(`CTRL: Cooldown 30s...`, 'yellow');
        await delay(600);
        addLog(`CTRL: Cooldown complete. Resuming CH[0].`, 'green');
        sq++;
        addLog(`LEDSTATE CH[0] state[Available(110)]`, 'green');
        addLog(`OCPP OUTREQ[OCPP status,182]`, 'blue');
        addLog(`[2,"${sq}","StatusNotification",{"connectorId":1,"status":"Available","errorCode":"NoError","timestamp":"${isoTs()}"}]`, 'blue');
        await delay(200);
        addLog(`OCPP RESP [${sq}] OK`, 'green');
        break;
      }
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
          Simuleer operationele scenario's van de Ecotap ECC controller. Output is gebaseerd op echte ECC seriële logbestanden.
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
