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

  const handleConnect = async () => {
    if (controller.connected) {
      setController(prev => ({ ...prev, connected: false }));
      addLog('COM port disconnected', 'red');
      return;
    }

    addLog(`Opening COM${comPort} at 115200 baud...`, 'blue');
    await new Promise(r => setTimeout(r, 400));
    addLog('USB-TTL adapter detected (FTDI FT232R)', 'blue');
    await new Promise(r => setTimeout(r, 300));

    setController(prev => ({ ...prev, connected: true, model: controllerModel }));

    // Simulate boot sequence
    addLog('Powering on controller...', 'blue');
    await new Promise(r => setTimeout(r, 600));
    addLog('=== ECOTAP CONTROLLER BOOT ===', 'green');
    addLog(`Model: ${controllerModel}`, 'blue');
    addLog(`Firmware: ${controller.firmwareVersion}`, 'blue');
    addLog(`Serial: ${controller.serialNumber}`, 'blue');
    addLog(`OCPP ID: ${controller.ocppId}`, 'blue');
    await new Promise(r => setTimeout(r, 200));
    addLog('Init HW...OK', 'blue');
    addLog('Init RFID Reader 1: sl032...OK', 'blue');
    addLog('Init RFID Reader 2: sl032...OK', 'blue');
    addLog('Init Energy Meter CH1: EASTR_SDM72D addr=1...OK', 'blue');
    addLog('Init Energy Meter CH2: EASTR_SDM72D addr=2...OK', 'blue');
    await new Promise(r => setTimeout(r, 200));
    addLog('Init ETH: DHCP...', 'blue');
    addLog('ETH: IP=192.168.1.45 GW=192.168.1.1', 'blue');
    addLog(`Grid Role: ${controller.config['grid_Role'] || 'Station_ctrl'}`, 'blue');
    addLog(`Station Max Current: ${controller.config['chg_StationMaxCurrent'] || '25'}A`, 'blue');
    addLog(`Rated Current: ${controller.config['chg_RatedCurrent'] || '16,16'}A`, 'blue');
    await new Promise(r => setTimeout(r, 200));
    addLog(`OCPP: Connecting to ${controller.config['com_Endpoint']?.replace('#OSN#', controller.ocppId) || '...'}`, 'blue');
    await new Promise(r => setTimeout(r, 500));
    addLog('OCPP: WebSocket connected', 'green');
    addLog('OCPP: BootNotification sent', 'blue');
    addLog('OCPP: BootNotification Accepted, interval=300', 'green');
    addLog('Controller ready.', 'green');

    if (debugEnabled) {
      addLog('Debug logging enabled', 'yellow');
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
