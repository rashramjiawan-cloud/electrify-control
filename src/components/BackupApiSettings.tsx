import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Copy, Check, Database, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BACKUP_URL = `${SUPABASE_URL}/functions/v1/backup-export`;

const BackupApiSettings = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'backup_api_key')
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
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    const newKey = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'backup_api_key', value: newKey, description: 'API key voor het backup-export endpoint.' });

    if (error) {
      toast.error('Fout bij genereren nieuwe sleutel');
    } else {
      setApiKey(newKey);
      toast.success('Nieuwe Backup API key gegenereerd');
    }
    setRegenerating(false);
  };

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <Button variant="outline" size="icon" className="shrink-0" onClick={() => copy(text, label)}>
      {copied === label ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Database className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Backup / Export API</h2>
          <p className="text-xs text-muted-foreground">API key om alle data op te halen voor backup of kloon-doeleinden</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {/* API Key */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Backup API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                readOnly
                value={apiKey ? (showKey ? apiKey : '••••••••••••••••••••••••') : 'Nog niet gegenereerd'}
                className="font-mono text-sm bg-muted/50 pr-10"
              />
              {apiKey && (
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            {apiKey && <CopyBtn text={apiKey} label="key" />}
            <Button variant="outline" size="icon" className="shrink-0" onClick={regenerateKey} disabled={regenerating}>
              <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Endpoint URL */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Backup Endpoint URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={BACKUP_URL} className="font-mono text-sm bg-muted/50" />
            <CopyBtn text={BACKUP_URL} label="url" />
          </div>
        </div>

        {/* Usage examples */}
        <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gebruik</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground text-sm">Volledige backup ophalen:</p>
            <pre className="bg-muted rounded-md p-3 overflow-x-auto text-[11px] font-mono">
{`curl -H "x-api-key: <KEY>" \\
  ${BACKUP_URL}`}
            </pre>

            <p className="font-medium text-foreground text-sm pt-2">Specifieke tabellen ophalen:</p>
            <pre className="bg-muted rounded-md p-3 overflow-x-auto text-[11px] font-mono">
{`curl -H "x-api-key: <KEY>" \\
  "${BACKUP_URL}?tables=charge_points,transactions"`}
            </pre>
          </div>
        </div>

        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground text-sm">Beschikbare tabellen:</p>
          <div className="flex flex-wrap gap-1.5">
            {['charge_points', 'connectors', 'transactions', 'meter_values', 'energy_meters', 'meter_readings',
              'charging_tariffs', 'charging_invoices', 'authorized_tags', 'virtual_grids', 'system_settings',
              'customers', 'profiles', 'projects'].map(t => (
              <span key={t} className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-mono font-medium">
                {t}
              </span>
            ))}
            <span className="text-muted-foreground text-[11px]">+ 28 meer...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackupApiSettings;
