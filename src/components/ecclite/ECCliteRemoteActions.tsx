import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Play, Square, Unlock, Zap, Clipboard, Radio, RotateCcw, Upload, Send } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry, OcppSendFn } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
  sendOcpp: OcppSendFn;
}

const CONNECTOR_ACTIONS = [
  { id: 'remoteStart', label: 'Remote Start', icon: Play, color: 'text-emerald-500' },
  { id: 'remoteStop', label: 'Remote Stop', icon: Square, color: 'text-destructive' },
  { id: 'unlock', label: 'Ontgrendelen', icon: Unlock, color: 'text-primary' },
  { id: 'availability', label: 'Beschikbaarheid', icon: Zap, color: 'text-yellow-500' },
  { id: 'getConfig', label: 'GetConfiguration', icon: Clipboard, color: 'text-primary' },
  { id: 'trigger', label: 'TriggerMessage', icon: Radio, color: 'text-primary' },
];

const SYSTEM_ACTIONS = [
  { id: 'softReset', label: 'Soft Reset', icon: RotateCcw, color: 'text-yellow-500' },
  { id: 'hardReset', label: 'Hard Reset', icon: Zap, color: 'text-destructive' },
  { id: 'fwUpdate', label: 'FW Update', icon: Upload, color: 'text-primary' },
];

const ECCliteRemoteActions = ({ controller, addLog, sendOcpp }: Props) => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [manualAction, setManualAction] = useState('BootNotification');
  const [manualConnector, setManualConnector] = useState('0');
  const [manualPayload, setManualPayload] = useState('{}');

  const executeAction = async (actionId: string) => {
    if (!controller.connected) {
      addLog('Verbind eerst met de laadpaal!', 'red');
      return;
    }

    setRunning(true);
    setPendingAction(null);

    try {
      switch (actionId) {
        case 'remoteStart':
          await sendOcpp('RemoteStartTransaction', { connectorId: 1, idTag: '04A2B3C4D5E6' });
          addLog('Remote Start Transaction verstuurd', 'green');
          break;
        case 'remoteStop':
          await sendOcpp('RemoteStopTransaction', { transactionId: 1 });
          addLog('Remote Stop Transaction verstuurd', 'green');
          break;
        case 'unlock':
          await sendOcpp('UnlockConnector', { connectorId: 1 });
          addLog('Unlock Connector verstuurd', 'green');
          break;
        case 'availability':
          await sendOcpp('ChangeAvailability', { connectorId: 0, type: 'Operative' });
          addLog('Change Availability verstuurd', 'green');
          break;
        case 'getConfig':
          await sendOcpp('GetConfiguration', { key: [] });
          addLog('GetConfiguration verstuurd', 'green');
          break;
        case 'trigger':
          await sendOcpp('TriggerMessage', { requestedMessage: 'StatusNotification', connectorId: 1 });
          addLog('TriggerMessage verstuurd', 'green');
          break;
        case 'softReset':
          await sendOcpp('Reset', { type: 'Soft' });
          addLog('Soft Reset verstuurd', 'yellow');
          break;
        case 'hardReset':
          await sendOcpp('Reset', { type: 'Hard' });
          addLog('Hard Reset verstuurd', 'red');
          break;
        case 'fwUpdate':
          await sendOcpp('UpdateFirmware', {
            location: 'https://firmware.ecotap.com/EVC4V32R16.bin',
            retrieveDate: new Date().toISOString(),
          });
          addLog('Firmware Update verstuurd', 'green');
          break;
      }
    } catch (err) {
      addLog(`Actie mislukt: ${(err as Error).message}`, 'red');
    }

    setRunning(false);
  };

  const sendManual = async () => {
    if (!controller.connected) {
      addLog('Verbind eerst met de laadpaal!', 'red');
      return;
    }

    setRunning(true);
    try {
      const payload = JSON.parse(manualPayload);
      if (manualConnector !== '0') {
        payload.connectorId = parseInt(manualConnector);
      }
      await sendOcpp(manualAction, payload);
      addLog(`${manualAction} verstuurd`, 'green');
    } catch (err) {
      addLog(`Handmatig bericht mislukt: ${(err as Error).message}`, 'red');
    }
    setRunning(false);
  };

  const ActionCard = ({ action }: { action: typeof CONNECTOR_ACTIONS[0] }) => {
    const Icon = action.icon;
    return (
      <button
        onClick={() => setPendingAction(action.id)}
        disabled={!controller.connected || running}
        className="
          rounded-lg border border-border bg-muted/20 p-4 text-center
          hover:border-primary/50 hover:bg-primary/5 transition-all
          disabled:opacity-40 disabled:cursor-not-allowed
          cursor-pointer
        "
      >
        <Icon className={`h-6 w-6 mx-auto mb-2 ${action.color}`} />
        <p className="text-xs font-medium text-foreground tracking-wider uppercase">{action.label}</p>
      </button>
    );
  };

  const actionLabel = [...CONNECTOR_ACTIONS, ...SYSTEM_ACTIONS].find(a => a.id === pendingAction)?.label || '';

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Remote Actions</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">OCPP remote commando's naar de laadpaal sturen</p>
      </div>

      {!controller.connected && (
        <p className="text-xs text-destructive text-center py-2 bg-destructive/5">
          Verbind eerst met de controller
        </p>
      )}

      <div className="p-5 space-y-5">
        {/* Connector Actions */}
        <div>
          <h3 className="text-xs font-semibold text-foreground tracking-wider uppercase mb-3">Connector Acties</h3>
          <div className="grid grid-cols-3 gap-3">
            {CONNECTOR_ACTIONS.map(a => <ActionCard key={a.id} action={a} />)}
          </div>
        </div>

        {/* System Actions */}
        <div>
          <h3 className="text-xs font-semibold text-foreground tracking-wider uppercase mb-3">Systeem Acties</h3>
          <div className="grid grid-cols-3 gap-3">
            {SYSTEM_ACTIONS.map(a => <ActionCard key={a.id} action={a} />)}
          </div>
        </div>

        {/* Manual OCPP message */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground tracking-wider uppercase">OCPP Handmatig Bericht</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">ACTION</Label>
              <Select value={manualAction} onValueChange={setManualAction}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['BootNotification', 'Heartbeat', 'StatusNotification', 'Authorize', 'StartTransaction', 'StopTransaction', 'MeterValues'].map(a => (
                    <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">CONNECTOR ID</Label>
              <Select value={manualConnector} onValueChange={setManualConnector}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0" className="text-xs">0 (Globaal)</SelectItem>
                  <SelectItem value="1" className="text-xs">1</SelectItem>
                  <SelectItem value="2" className="text-xs">2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">PAYLOAD (JSON)</Label>
            <Textarea
              value={manualPayload}
              onChange={e => setManualPayload(e.target.value)}
              className="font-mono text-xs min-h-[80px] resize-y"
              placeholder="{}"
            />
          </div>

          <Button
            onClick={sendManual}
            disabled={!controller.connected || running}
            className="gap-1.5 text-xs"
          >
            <Send className="h-3.5 w-3.5" />
            Versturen
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{actionLabel}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {actionLabel} versturen naar de laadpaal?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>Annuleren</Button>
            <Button size="sm" onClick={() => pendingAction && executeAction(pendingAction)}>Bevestigen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ECCliteRemoteActions;
