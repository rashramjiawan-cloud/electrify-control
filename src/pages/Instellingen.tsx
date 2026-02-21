import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Copy, Check, Wifi, Server, Shield, Info } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const WS_URL = SUPABASE_URL?.replace('https://', 'wss://') + '/functions/v1/ocpp-ws';

const CopyField = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Gekopieerd naar klembord');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className={`${mono ? 'font-mono' : ''} text-sm bg-muted/50 cursor-text`}
          onFocus={e => e.target.select()}
        />
        <Button variant="outline" size="icon" className="shrink-0" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const Instellingen = () => {
  return (
    <AppLayout title="Instellingen" subtitle="OCPP configuratie en systeeminstellingen">
      <div className="max-w-3xl space-y-6">
        {/* OCPP Connection */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Wifi className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">OCPP Verbinding</h2>
              <p className="text-xs text-muted-foreground">WebSocket URL voor je laadpalen</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <CopyField
              label="WebSocket URL (vul je Charge Point ID aan)"
              value={`${WS_URL}/<CHARGE_POINT_ID>`}
            />

            <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Voorbeelden
              </h3>
              <div className="space-y-2">
                <CopyField label="Voorbeeld: Ecotap laadpaal" value={`${WS_URL}/ECOTAP-001`} />
                <CopyField label="Voorbeeld: Alfen Eve" value={`${WS_URL}/ALFEN-EVE-01`} />
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground text-sm">Configuratie in je laadpaal:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><span className="text-foreground font-medium">Protocol:</span> OCPP 1.6J (WebSocket / JSON)</li>
                <li><span className="text-foreground font-medium">URL:</span> De WebSocket URL hierboven</li>
                <li><span className="text-foreground font-medium">Charge Point ID:</span> Een uniek ID naar keuze</li>
                <li><span className="text-foreground font-medium">Subprotocol:</span> <code className="font-mono text-foreground">ocpp1.6</code> (wordt automatisch ondersteund)</li>
              </ul>
              <p className="pt-1">De laadpaal verschijnt automatisch op het dashboard na de eerste <code className="font-mono text-foreground">BootNotification</code>.</p>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Server className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Systeem</h2>
              <p className="text-xs text-muted-foreground">CSMS informatie</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Protocol</Label>
                <p className="text-sm font-medium text-foreground">OCPP 1.6J</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Transport</Label>
                <p className="text-sm font-medium text-foreground">WebSocket (WSS)</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Heartbeat interval</Label>
                <p className="text-sm font-medium text-foreground">300 seconden (5 min)</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Online timeout</Label>
                <p className="text-sm font-medium text-foreground">600 seconden (10 min)</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ondersteunde OCPP acties</Label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['BootNotification', 'Heartbeat', 'StatusNotification', 'Authorize', 'StartTransaction', 'StopTransaction', 'MeterValues', 'GetConfiguration', 'ChangeConfiguration', 'Reset', 'TriggerMessage', 'UnlockConnector', 'RemoteStartTransaction', 'RemoteStopTransaction'].map(action => (
                  <span key={action} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono font-medium text-foreground">
                    {action}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Beveiliging</h2>
              <p className="text-xs text-muted-foreground">Autorisatie-instellingen</p>
            </div>
          </div>
          <div className="p-5 space-y-2 text-sm text-muted-foreground">
            <p>• RFID-tags worden gevalideerd via de <span className="text-foreground font-medium">RFID Tags</span> pagina</p>
            <p>• Onbekende tags worden geweigerd als er geautoriseerde tags geconfigureerd zijn</p>
            <p>• Tags kunnen beperkt worden tot specifieke laadpalen</p>
            <p>• Verlopen tags worden automatisch geblokkeerd</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Instellingen;
