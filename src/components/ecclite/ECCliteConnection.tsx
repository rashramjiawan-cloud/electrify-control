import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Wifi, WifiOff, Plug, Radio } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry, OcppSendFn } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  setController: React.Dispatch<React.SetStateAction<ControllerState>>;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
  wsRef: React.MutableRefObject<WebSocket | null>;
  onWsMessage: (event: MessageEvent) => void;
  sendOcpp: OcppSendFn;
}

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'lxdjtwxumzsyowdkahrt';

const ECCliteConnection = ({ controller, setController, addLog, wsRef, onWsMessage, sendOcpp }: Props) => {
  const [comPort, setComPort] = useState('10');
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [controllerModel, setControllerModel] = useState('EVC4.31');
  const [liveMode, setLiveMode] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const simulateBootLog = async () => {
    const sn = controller.serialNumber;
    const ocppId = controller.ocppId;

    addLog(`Invalid CRC rec_CFG():160, 890F1A17=890F1A17 (end:298)`, 'yellow');
    await delay(80);
    addLog(`Protocol [CH][TYPE]:[6:ETH][2:OCPP1.6]`, 'blue');
    addLog(`PGrid[0:STATION CTRL]MIN.I[${controller.config['chg_MinChargingCurrent'] || '6'}]STATION[${controller.config['chg_StationMaxCurrent'] || '25'}]INSTALLATION[${controller.config['grid_InstallationMaxcurrent'] || '32'}]SUPERVISOR[0]`, 'blue');
    addLog(`APN:[${controller.config['gsm_APN'] || 'comgate.m2m'}],[],[]`, 'blue');
    addLog(`OCPP ID [${ocppId}]`, 'blue');
    addLog(`Model Name [${controllerModel.startsWith('EVC4') ? 'WG' : controllerModel}]`, 'blue');
    addLog(`Vendor Name [Ecotap]`, 'blue');
    addLog(`Chargepoint serial [${sn}]`, 'blue');
    addLog(`Meter0:SN[1736498]Type[2]Speed[38400]Addr[1]Opt[0]`, 'blue');
    addLog(`Meter1:SN[1734883]Type[2]Speed[38400]Addr[2]Opt[0]`, 'blue');
    await delay(100);

    addLog(`HW4.xFW32R16`, 'green');
    addLog(`MODULES:[OCPP,ETH]`, 'blue');
    addLog(`CAN RX RINGBUFFER CTX: 0x10005700 block 0x2007c040 length 64 element size 16`, 'blue');
    addLog(`APP INIT RCU40 ID: ${ocppId}`, 'blue');
    await delay(100);

    addLog(`RAM SIZE/CEILING:128KB/122732`, 'blue');
    addLog(`EEP SIZE/CEILING:64KB/37938`, 'blue');
    addLog(`FLASH SIZE/CEILING:4096KB/3674112`, 'blue');
    addLog(`=========      =======`, 'blue');
    addLog(`Heap Size      : 0k (max:3932138k) (10005734-10005734)`, 'blue');
    addLog(`Stack size     : 0k (10007898), max:1.8kb Gap:8.3kb`, 'blue');
    addLog(`=========      =======`, 'blue');
    await delay(100);

    addLog(`INITIALIZING EVENT FLASH MANAGER`, 'blue');
    for (let i = 11; i <= 20; i++) {
      addLog(`ERASING EVPAGE [${i}]`, 'blue');
    }
    addLog(`EVENT FLASH MANAGER START [WRID:0][1980/2048]MEM USAGE[96]`, 'green');
    await delay(80);

    addLog(`GSM MUX start`, 'blue');
    addLog(`GSM Thread active`, 'blue');
    addLog(`GSM IMEI[AD86690106241717]`, 'blue');
    addLog(`GSM IMSI: 204080822254984`, 'blue');
    addLog(`Lock Thread initialized`, 'blue');
    addLog(`MODBUS Thread active`, 'blue');
  };

  const connectLive = async () => {
    const ocppId = controller.ocppId;
    const wsUrl = `wss://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ocpp-ws/${encodeURIComponent(ocppId)}`;

    addLog(`Connecting to VoltControl OCPP gateway...`, 'blue');
    addLog(`WS URL: ${wsUrl}`, 'blue');

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl, 'ocpp1.6');
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout (10s)'));
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        wsRef.current = ws;
        addLog(`WS CONNECTION OK (ocpp1.6)`, 'green');
        resolve();
      };

      ws.onmessage = onWsMessage;

      ws.onerror = () => {
        clearTimeout(timeout);
        addLog(`WS CONNECTION FAILED`, 'red');
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = (ev) => {
        wsRef.current = null;
        setController(prev => ({ ...prev, connected: false }));
        addLog(`WS DISCONNECTED (code=${ev.code} reason=${ev.reason || 'none'})`, 'red');
      };
    });
  };

  const sendBootNotification = async () => {
    const sn = controller.serialNumber;
    const ocppId = controller.ocppId;

    try {
      const result = await sendOcpp('BootNotification', {
        chargePointVendor: 'Ecotap',
        chargePointModel: controllerModel.startsWith('EVC4') ? 'WG' : controllerModel,
        chargePointSerialNumber: sn,
        chargeBoxSerialNumber: ocppId,
        firmwareVersion: `4.3x.32R.${controller.firmwareVersion.replace(/V\d+R/, '')}`,
        iccid: '8931081721118365551',
        imsi: '204080822254984',
        meterSerialNumber: '1736498',
      }) as { status?: string; interval?: number; currentTime?: string };

      if (result?.status === 'Accepted') {
        addLog(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}:OCPP BOOT OK`, 'green');
        addLog(`Heartbeat interval: ${result.interval || 300}s`, 'blue');
      } else {
        addLog(`OCPP BOOT REJECTED: ${result?.status || 'Unknown'}`, 'red');
      }
      return result;
    } catch (err) {
      addLog(`BootNotification failed: ${(err as Error).message}`, 'red');
      throw err;
    }
  };

  const sendInitialStatus = async () => {
    for (const connectorId of [0, 1, 2]) {
      try {
        await sendOcpp('StatusNotification', {
          connectorId,
          status: 'Available',
          errorCode: 'NoError',
          timestamp: new Date().toISOString(),
        });
        addLog(`FORCE CHANNEL STATUS UPD [${connectorId}]`, 'blue');
      } catch (err) {
        addLog(`StatusNotification failed for connector ${connectorId}: ${(err as Error).message}`, 'red');
      }
    }
  };

  const handleConnect = async () => {
    if (controller.connected) {
      // Disconnect
      if (wsRef.current) {
        wsRef.current.close(1000, 'User disconnect');
        wsRef.current = null;
      }
      setController(prev => ({ ...prev, connected: false }));
      addLog('Connection closed by user', 'red');
      return;
    }

    setConnecting(true);

    try {
      addLog(`Opening COM${comPort} at 115200 baud...`, 'blue');
      await delay(200);
      addLog('USB-TTL adapter detected (FTDI FT232R)', 'blue');
      await delay(200);

      // Simulate boot log
      await simulateBootLog();

      if (liveMode) {
        // Real WebSocket connection to VoltControl
        addLog(`--- LIVE MODE: Connecting to VoltControl ---`, 'green');
        await connectLive();

        setController(prev => ({ ...prev, connected: true, model: controllerModel }));

        // Send BootNotification
        await sendBootNotification();

        // Send initial StatusNotifications
        await sendInitialStatus();

        if (debugEnabled) {
          addLog(`Debug logging enabled`, 'yellow');
        }

        addLog(`=== LIVE CONNECTION ESTABLISHED ===`, 'green');
        addLog(`Charge point ${controller.ocppId} is now visible in VoltControl`, 'green');

        // Start heartbeat loop
        startHeartbeat();
      } else {
        // Simulation mode (original behavior)
        setController(prev => ({ ...prev, connected: true, model: controllerModel }));
        addLog(`--- SIMULATION MODE (no real connection) ---`, 'yellow');

        if (debugEnabled) {
          addLog(`Debug logging enabled`, 'yellow');
        }
      }
    } catch (err) {
      addLog(`Connection failed: ${(err as Error).message}`, 'red');
      setController(prev => ({ ...prev, connected: false }));
    } finally {
      setConnecting(false);
    }
  };

  const heartbeatRef = { current: null as ReturnType<typeof setInterval> | null };

  const startHeartbeat = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    heartbeatRef.current = setInterval(async () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        return;
      }
      try {
        await sendOcpp('Heartbeat', {});
      } catch {
        addLog(`Heartbeat failed`, 'red');
      }
    }, 60000); // Every 60 seconds
  };

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Controller Verbinding</h2>
        <div className="flex items-center gap-3">
          {controller.connected && liveMode && (
            <Badge variant="default" className="gap-1.5 bg-emerald-600">
              <Radio className="h-3 w-3 animate-pulse" />
              LIVE
            </Badge>
          )}
          <Badge variant={controller.connected ? 'default' : 'secondary'} className="gap-1.5">
            {controller.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {controller.connected ? 'Verbonden' : 'Niet verbonden'}
          </Badge>
        </div>
      </div>
      <div className="p-5 space-y-5">
        {/* Live mode toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">VoltControl Live Verbinding</p>
            <p className="text-xs text-muted-foreground">
              {liveMode
                ? 'De emulator verbindt via WebSocket met VoltControl en verschijnt als echte laadpaal'
                : 'Simulatiemodus – geen echte verbinding, alleen lokale log-output'}
            </p>
          </div>
          <Switch
            checked={liveMode}
            onCheckedChange={setLiveMode}
            disabled={controller.connected}
          />
        </div>

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
              disabled={controller.connected}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">OCPP ID</Label>
            <Input
              value={controller.ocppId}
              onChange={e => setController(prev => ({ ...prev, ocppId: e.target.value }))}
              className="font-mono text-sm"
              disabled={controller.connected}
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
          disabled={connecting}
        >
          <Plug className="h-4 w-4" />
          {connecting
            ? 'Verbinden...'
            : controller.connected
              ? 'Verbinding verbreken'
              : liveMode
                ? 'Verbinden met VoltControl (LIVE)'
                : 'Verbinden met controller (Simulatie)'}
        </Button>

        {liveMode && !controller.connected && (
          <p className="text-xs text-muted-foreground text-center">
            In live-modus verbindt de emulator via OCPP 1.6J WebSocket met VoltControl.
            De laadpaal verschijnt in het dashboard onder het opgegeven OCPP ID.
          </p>
        )}
      </div>
    </div>
  );
};

export default ECCliteConnection;
