import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Check, Wifi, Radio, ExternalLink, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEnergyMeters } from '@/hooks/useEnergyMeters';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const CopyBtn = ({ value, label }: { value: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(label ? `${label} gekopieerd` : 'Gekopieerd naar klembord');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="icon" className="shrink-0 h-9 w-9" onClick={copy}>
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
};

const ShellyWsSetupWizard = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { data: meters } = useEnergyMeters();

  const wsMeters = meters?.filter(m => m.connection_type === 'outbound_ws') ?? [];

  useEffect(() => {
    supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ingest_api_key')
      .maybeSingle()
      .then(({ data }) => setApiKey(data?.value || null));
  }, []);

  const wsBaseUrl = SUPABASE_URL?.replace('https://', 'wss://') + '/functions/v1/shelly-ws';

  const buildUrl = (deviceId?: string) => {
    const params = new URLSearchParams();
    if (apiKey) params.set('api_key', apiKey);
    if (deviceId) params.set('device_id', deviceId);
    return `${wsBaseUrl}?${params.toString()}`;
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
          <Radio className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">TecTronic Outbound WebSocket</h2>
          <p className="text-xs text-muted-foreground">Configureer je TecTronic energiemeter voor real-time push data</p>
        </div>
        {wsMeters.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {wsMeters.length} meter{wsMeters.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Per-meter URLs */}
        {wsMeters.length > 0 ? (
          <div className="space-y-3">
            {wsMeters.map(meter => {
              const fullUrl = buildUrl(meter.shelly_device_id || undefined);
              const isConnected = !!meter.last_poll_at;
              const staleMs = meter.last_poll_at
                ? Date.now() - new Date(meter.last_poll_at).getTime()
                : null;
              const isStale = staleMs !== null && staleMs > 5 * 60 * 1000;

              return (
                <div key={meter.id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi className={`h-4 w-4 ${
                        !meter.last_poll_at
                          ? 'text-muted-foreground'
                          : isStale
                          ? 'text-destructive'
                          : 'text-green-600 dark:text-green-400'
                      }`} />
                      <span className="text-sm font-medium text-foreground">{meter.name}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        !meter.last_poll_at
                          ? 'border-muted-foreground/30 text-muted-foreground'
                          : isStale
                          ? 'border-destructive/30 text-destructive'
                          : 'border-green-500/30 text-green-600 dark:text-green-400'
                      }`}
                    >
                      {!meter.last_poll_at ? 'Wacht op verbinding' : isStale ? 'Verbinding verloren' : 'Verbonden'}
                    </Badge>
                  </div>

                  {meter.shelly_device_id && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Device ID</Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={meter.shelly_device_id}
                          className="font-mono text-xs bg-muted/50 cursor-text h-9"
                          onFocus={e => e.target.select()}
                        />
                        <CopyBtn value={meter.shelly_device_id} label="Device ID" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">WebSocket URL (kopieer naar TecTronic UI)</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={fullUrl}
                        className="font-mono text-xs bg-muted/50 cursor-text h-9"
                        onFocus={e => e.target.select()}
                      />
                      <CopyBtn value={fullUrl} label="WebSocket URL" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg bg-muted/30 border border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Geen meters met Outbound WebSocket verbinding gevonden.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Wijzig het verbindingstype van een meter naar "Outbound WebSocket" op de EMS pagina.
            </p>
          </div>
        )}

        {/* Generic URL template */}
        {!apiKey ? (
          <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
            <p className="text-xs text-destructive">
              Geen Ingest API Key geconfigureerd. Stel eerst een API key in via de Ingest API sectie hierboven.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Generiek URL template</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={buildUrl('<DEVICE_ID>')}
                className="font-mono text-xs bg-muted/50 cursor-text h-9"
                onFocus={e => e.target.select()}
              />
              <CopyBtn value={buildUrl('<DEVICE_ID>')} label="Template URL" />
            </div>
          </div>
        )}

        {/* Setup instructions (collapsible) */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Configuratie-instructies voor TecTronic Pro 3EM
        </button>

        {expanded && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium text-foreground text-sm">Stappen om Outbound WebSocket in te stellen:</p>
                <ol className="space-y-2 list-decimal list-inside">
                  <li>
                    Open de <span className="text-foreground font-medium">TecTronic Web UI</span> van je Pro 3EM
                    (ga naar het IP-adres in je browser)
                  </li>
                  <li>
                    Navigeer naar <span className="text-foreground font-medium">Settings → Outbound WebSocket</span>
                  </li>
                  <li>
                    Schakel <span className="text-foreground font-medium">Enable</span> in
                  </li>
                  <li>
                    Plak de <span className="text-foreground font-medium">WebSocket URL</span> hierboven in het Server veld
                  </li>
                  <li>
                    Klik op <span className="text-foreground font-medium">Save</span>
                  </li>
                </ol>
                <p className="pt-1">
                  De TecTronic stuurt automatisch <code className="font-mono text-foreground bg-muted px-1 py-0.5 rounded">NotifyFullStatus</code> berichten
                  met 3-fase vermogensdata. De data verschijnt direct op het dashboard.
                </p>
              </div>
            </div>

            <div className="border-t border-primary/10 pt-3 space-y-1">
              <p className="font-medium text-foreground text-xs">Ondersteunde TecTronic modellen:</p>
              <div className="flex flex-wrap gap-1.5">
                {['TecTronic Pro 3EM', 'TecTronic PRO EM-50'].map(model => (
                  <span
                    key={model}
                    className="inline-flex items-center rounded-md bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-0.5 text-[11px] font-medium"
                  >
                    {model}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShellyWsSetupWizard;
