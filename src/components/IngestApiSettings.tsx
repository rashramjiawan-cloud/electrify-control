import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Copy, Check, Globe, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ocpp-ingest`;

const IngestApiSettings = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ingest_api_key')
      .maybeSingle()
      .then(({ data }) => setApiKey(data?.value || null));
  }, []);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success('Gekopieerd naar klembord');
    setTimeout(() => setCopied(null), 2000);
  };

  const regenerateKey = async () => {
    setRegenerating(true);
    // Generate a new random key client-side
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    const newKey = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'ingest_api_key', value: newKey, description: 'API key for the ocpp-ingest endpoint.' });

    if (error) {
      toast.error('Fout bij genereren nieuwe sleutel');
    } else {
      setApiKey(newKey);
      toast.success('Nieuwe API key gegenereerd');
    }
    setRegenerating(false);
  };

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <Button variant="outline" size="icon" className="shrink-0" onClick={() => copy(text, label)}>
      {copied === label ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );

  const examplePayload = JSON.stringify({
    event: "StatusNotification",
    chargePointId: "CP-001",
    connectorId: 1,
    timestamp: new Date().toISOString(),
    data: { status: "Available", errorCode: "NoError" }
  }, null, 2);

  const exampleBatch = JSON.stringify({
    events: [
      { event: "Heartbeat", chargePointId: "CP-001" },
      { event: "StatusNotification", chargePointId: "CP-002", connectorId: 1, data: { status: "Charging" } },
    ]
  }, null, 2);

  const curlExample = `curl -X POST ${INGEST_URL} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey || '<YOUR_API_KEY>'}" \\
  -d '${JSON.stringify({ event: "Heartbeat", chargePointId: "CP-001" })}'`;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Globe className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Ingest API</h2>
          <p className="text-xs text-muted-foreground">REST endpoint voor externe OCPP servers</p>
        </div>
      </div>
      <div className="p-5 space-y-5">
        {/* Endpoint URL */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Endpoint URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={INGEST_URL} className="font-mono text-sm bg-muted/50" onFocus={e => e.target.select()} />
            <CopyBtn text={INGEST_URL} label="url" />
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">API Key</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={apiKey ? (showKey ? apiKey : '••••••••••••••••••••') : 'Laden...'}
              className="font-mono text-sm bg-muted/50"
              onFocus={e => e.target.select()}
            />
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            {apiKey && showKey && <CopyBtn text={apiKey} label="key" />}
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={regenerateKey}
              disabled={regenerating}
            >
              <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Stuur deze key mee als <code className="font-mono text-foreground">x-api-key</code> header.
          </p>
        </div>

        {/* Supported events */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Ondersteunde events</Label>
          <div className="flex flex-wrap gap-1.5">
            {['BootNotification', 'Heartbeat', 'StatusNotification', 'StartTransaction', 'StopTransaction', 'MeterValues'].map(ev => (
              <span key={ev} className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-mono font-medium">
                {ev}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Onbekende events worden gelogd in de audit log.</p>
        </div>

        {/* Example payloads */}
        <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voorbeeld: Single event</h3>
          <pre className="text-[11px] font-mono bg-background rounded-md p-3 overflow-x-auto border border-border text-foreground">
            {examplePayload}
          </pre>

          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Voorbeeld: Batch events</h3>
          <pre className="text-[11px] font-mono bg-background rounded-md p-3 overflow-x-auto border border-border text-foreground">
            {exampleBatch}
          </pre>

          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">cURL voorbeeld</h3>
          <div className="relative">
            <pre className="text-[11px] font-mono bg-background rounded-md p-3 overflow-x-auto border border-border text-foreground">
              {curlExample}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6"
              onClick={() => copy(curlExample, 'curl')}
            >
              {copied === 'curl' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Integration guide */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground text-sm">Integratie met je externe OCPP server:</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Installeer een OCPP server (bijv. SteVe, CitrineOS, of custom Node.js)</li>
            <li>Configureer een webhook/callback naar bovenstaande URL</li>
            <li>Stuur events als JSON POST met de <code className="font-mono text-foreground">x-api-key</code> header</li>
            <li>Je dashboard ontvangt de data realtime</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default IngestApiSettings;
