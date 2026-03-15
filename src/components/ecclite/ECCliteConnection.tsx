import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Wifi, WifiOff, Plug } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  setController: React.Dispatch<React.SetStateAction<ControllerState>>;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const ECCliteConnection = ({ controller, setController, addLog }: Props) => {
  const [comPort, setComPort] = useState('10');
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [controllerModel, setControllerModel] = useState('EVC4.31');

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const handleConnect = async () => {
    if (controller.connected) {
      setController(prev => ({ ...prev, connected: false }));
      addLog('COM port disconnected', 'red');
      return;
    }

    addLog(`Opening COM${comPort} at 115200 baud...`, 'blue');
    await delay(400);
    addLog('USB-TTL adapter detected (FTDI FT232R)', 'blue');
    await delay(300);

    setController(prev => ({ ...prev, connected: true, model: controllerModel }));

    // Realistic boot sequence from real ECC logs
    const sn = controller.serialNumber;
    const ocppId = controller.ocppId;
    const fw = controller.firmwareVersion;
    const meterSn1 = '1736498';
    const meterSn2 = '1734883';

    addLog(`Invalid CRC rec_CFG():160, 890F1A17=890F1A17 (end:298)`, 'yellow');
    await delay(100);
    addLog(`Protocol [CH][TYPE]:[6:ETH][2:OCPP1.6]`, 'blue');
    addLog(`PGrid[0:STATION CTRL]MIN.I[${controller.config['chg_MinChargingCurrent'] || '6'}]STATION[${controller.config['chg_StationMaxCurrent'] || '25'}]INSTALLATION[${controller.config['grid_InstallationMaxcurrent'] || '32'}]SUPERVISOR[0]`, 'blue');
    addLog(`APN:[${controller.config['gsm_APN'] || 'comgate.m2m'}],[],[]`, 'blue');
    addLog(`SMS SERVER:[]`, 'blue');
    addLog(`WS PING:[30s]`, 'blue');
    addLog(`OCPP ID [${ocppId}]`, 'blue');
    addLog(`Model Name [${controllerModel.startsWith('EVC4') ? 'WG' : controllerModel}]`, 'blue');
    addLog(`Vendor Name [Ecotap]`, 'blue');
    addLog(`Chargepoint serial [${sn}]`, 'blue');
    addLog(`Meter0:SN[${meterSn1}]Type[2]Speed[38400]Addr[1]Opt[0]`, 'blue');
    addLog(`Meter1:SN[${meterSn2}]Type[2]Speed[38400]Addr[2]Opt[0]`, 'blue');
    addLog(`DEST:[/${controller.config['com_Endpoint']?.replace('#OSN#', ocppId).replace('#SN#', sn) || '#SN#'}],[ocpp.monta.app:80]`, 'blue');
    addLog(`OPTIONS: APP[353405052], CH[4115,4115]`, 'blue');
    addLog(`OUT1/2 CFG:[1,2]`, 'blue');
    addLog(`RELAY2 CFG:[0,0]`, 'blue');
    await delay(200);

    addLog(`PHASE ORDER (L0=off) [L1L2L3][L1L2L3]`, 'blue');
    addLog(`ENCRYPT KEY:[175B238FCC09BA9A5CCFC24A078FAFBC]`, 'blue');
    addLog(`Save Json CFG to FLASH`, 'blue');
    addLog(`search_json(key):tag not found [0-0][0][0]`, 'blue');
    addLog(`Chk erase 90000-919ED`, 'blue');
    addLog(`X90000X91000`, 'blue');
    addLog(`Chk erase END`, 'blue');
    addLog(`Saved 6637 bytes of Json CFG to FLASH crc:2C76`, 'green');
    await delay(100);

    addLog(`HW4.xFW32R16`, 'green');
    addLog(`MODULES:[OCPP,ETH]`, 'blue');
    addLog(`Chk erase 7F000-7FFA5`, 'blue');
    addLog(`Chk erase END`, 'blue');
    addLog(`CAN RX RINGBUFFER CTX: 0x10005700 block 0x2007c040 length 64 element size 16`, 'blue');
    addLog(`CAN TX RINGBUFFER CTX: 0x10005720 block 0x2007c44a length 300 element size 13`, 'blue');
    addLog(`APP INIT RCU40 ID: ${ocppId}`, 'blue');
    await delay(200);

    addLog(`RAM SIZE/CEILING:128KB/122732`, 'blue');
    addLog(`EEP SIZE/CEILING:64KB/37938`, 'blue');
    addLog(`FLASH SIZE/CEILING:4096KB/3674112`, 'blue');
    addLog(`STACK/HEAP:10007F58/10005734`, 'blue');
    addLog(`CARD MEMORY SIZE:1024`, 'blue');
    addLog(`=========      =======`, 'blue');
    addLog(`Heap Size      : 0k (max:3932138k) (10005734-10005734)`, 'blue');
    addLog(`Stack size     : 0k (10007898), max:1.8kb Gap:8.3kb`, 'blue');
    addLog(`=========      =======`, 'blue');
    await delay(200);

    // Event flash init
    addLog(`INITIALIZING EVENT FLASH MANAGER`, 'blue');
    for (let i = 11; i <= 33; i++) {
      addLog(`ERASING EVPAGE [${i}]`, 'blue');
    }
    await delay(100);
    addLog(`EVENT FLASH MANAGER START [WRID:0][1980/2048]MEM USAGE[96]`, 'green');
    
    addLog(`ADDEV[Heartbeat,181,181]CH[0]IDX[44]CMD[0]SQ[3206]T[${new Date().toISOString().slice(0, 19).replace('T', ' ')}]`, 'blue');
    addLog(`ADDEV[Boot,134,134]CH[0]IDX[45]CMD[0]SQ[3207]T[${new Date().toISOString().slice(0, 19).replace('T', ' ')}]`, 'blue');
    await delay(100);

    // GSM init
    addLog(`GSM MUX start`, 'blue');
    addLog(`GSM Thread active`, 'blue');
    addLog(`GSM RST CAUSE:[REGULAR][GSMNOK]`, 'blue');
    addLog(`GSM POWERED: OFF`, 'blue');
    addLog(`GSM Init`, 'blue');
    addLog(`APPLICATION COMMS INIT`, 'blue');
    const cfgChecksum = Math.random().toString(16).slice(2, 10).toUpperCase();
    addLog(`SV CFG():${cfgChecksum}`, 'green');
    await delay(100);

    addLog(`Lock Thread initialized`, 'blue');
    addLog(`MODBUS Thread active`, 'blue');
    addLog(`=========      =======`, 'blue');
    addLog(`Heap Size      : 0k (max:0k) (10005734-10005734)`, 'blue');
    addLog(`Stack size     : 0k (10006BD0), max:5.0kb Gap:5.2kb`, 'blue');
    addLog(`=========      =======`, 'blue');
    addLog(`SYS:EV[45,0]RX[19,605]CAN[1,2]GSM[60,2]`, 'blue');
    addLog(`GSM PWR ON`, 'blue');
    addLog(`FORCE CHANNEL STATUS UPD [0]`, 'blue');
    addLog(`FORCE CHANNEL STATUS UPD [1]`, 'blue');
    await delay(100);

    // KWH meter timeouts (realistic)
    addLog(`KWH:AD[1]RG[8900]REC[221,221]ERR[TO]`, 'red');
    addLog(`KWH:AD[2]RG[8900]REC[221,221]ERR[TO]`, 'red');
    addLog(`Locks init done`, 'blue');
    addLog(`ADDEV[OCPP status,182,100]CH[0]IDX[46]CMD[0]SQ[3208]T[${new Date().toISOString().slice(0, 19).replace('T', ' ')}]`, 'blue');
    addLog(`LEDSTATE CH[0] state[Boot(111)]`, 'blue');
    addLog(`LEDSTATE CH[1] state[Boot(111)]`, 'blue');
    await delay(200);

    // RFID & GSM
    addLog(`INIT RFID0:0@115200`, 'blue');
    addLog(`PKT found on RFID2 port`, 'blue');
    addLog(`GSM PWR[ON]:[ON]->[OK]`, 'green');
    addLog(`GSM Modem: BG95-M3`, 'blue');
    addLog(`GSM IMEI[AD86690106241717]`, 'blue');
    addLog(`GSM IMSI: 204080822254984`, 'blue');
    addLog(`GSM CCID[8931081721118365551]`, 'blue');
    addLog(`GSM REG:1, SQ:8,`, 'blue');
    await delay(200);

    // WebSocket connect
    addLog(`DNS SERV:1.1.1.1`, 'blue');
    addLog(`HTTP connect to [52.17.114.8][80][1]`, 'blue');
    addLog(`WS CONNECTION OK`, 'green');
    addLog(`FORCE CHANNEL STATUS UPD [0]`, 'blue');
    addLog(`FORCE CHANNEL STATUS UPD [1]`, 'blue');
    await delay(200);

    // BootNotification
    const seqBoot = 3207;
    addLog(`OCPP OUTREQ[Boot,134]`, 'blue');
    addLog(`OCPP OUT:[0][273]---------`, 'blue');
    addLog(`[2,"${seqBoot}","BootNotification",{"chargePointVendor":"Ecotap","chargePointModel":"WG","chargePointSerialNumber":"${sn}","chargeBoxSerialNumber":"${ocppId}","firmwareVersion":"4.3x.32R.16","iccid":"8931081721118365551","imsi":"204080822254984","meterSerialNumber":"${meterSn1}"}]`, 'blue');
    addLog(`END--------------`, 'blue');
    addLog(`Sending 1/1360 (281b) OCPP EVENTS, 0 waiting`, 'blue');
    await delay(300);

    addLog(`OCPP INPUT:[2800][83]---------`, 'blue');
    addLog(`[3,"${seqBoot}",{"currentTime":"${new Date().toISOString()}","interval":240,"status":"Accepted"}`, 'green');
    addLog(`END--------------`, 'blue');
    addLog(`ocpp_process_incoming_request(2800-2853):`, 'blue');
    addLog(`get_delim_str([3,"${seqBoot}",{):OK`, 'blue');
    addLog(`OCPP RESP(280A-2853) Type[3]SQ[${seqBoot}]`, 'blue');
    addLog(`get_json_str(status):[Accepted]`, 'green');
    addLog(`get_json_int32(interval):[240]`, 'blue');
    addLog(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}:OCPP BOOT OK`, 'green');
    addLog(`OCPP RESP [${seqBoot}] OK`, 'green');

    if (debugEnabled) {
      addLog(`Debug logging enabled`, 'yellow');
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Controller Verbinding</h2>
        <Badge variant={controller.connected ? 'default' : 'secondary'} className="gap-1.5">
          {controller.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {controller.connected ? 'Verbonden' : 'Niet verbonden'}
        </Badge>
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">USB Port (COM)</Label>
            <Input value={comPort} onChange={e => setComPort(e.target.value)} className="font-mono text-sm" type="number" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Controller Model</Label>
            <Select value={controllerModel} onValueChange={setControllerModel}>
              <SelectTrigger className="font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EVC4.31">EVC4.31</SelectItem>
                <SelectItem value="EVC5.10">EVC5.10</SelectItem>
                <SelectItem value="ECC.10">ECC.10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Serial Number</Label>
            <Input
              value={controller.serialNumber}
              onChange={e => setController(prev => ({ ...prev, serialNumber: e.target.value }))}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">OCPP ID</Label>
            <Input
              value={controller.ocppId}
              onChange={e => setController(prev => ({ ...prev, ocppId: e.target.value }))}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Firmware</Label>
            <Input value={controller.firmwareVersion} disabled className="font-mono text-sm" />
          </div>
          <div className="flex items-end pb-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="debug"
                checked={debugEnabled}
                onCheckedChange={(v) => setDebugEnabled(!!v)}
              />
              <Label htmlFor="debug" className="text-xs text-muted-foreground cursor-pointer">Debug logging</Label>
            </div>
          </div>
        </div>

        <Button
          onClick={handleConnect}
          className="w-full gap-2 h-11"
          variant={controller.connected ? 'destructive' : 'default'}
        >
          <Plug className="h-4 w-4" />
          {controller.connected ? 'Verbinding verbreken' : 'Verbinden met controller'}
        </Button>
      </div>
    </div>
  );
};

export default ECCliteConnection;
