import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Zap, Send, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const EnovatesApiSettings = () => {
  const [testPath, setTestPath] = useState('/chargers');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; data?: unknown; error?: string } | null>(null);
  const [commandPath, setCommandPath] = useState('');
  const [commandBody, setCommandBody] = useState('');
  const [sending, setSending] = useState(false);

  const callProxy = async (path: string, method = 'GET', body?: unknown) => {
    const { data, error } = await supabase.functions.invoke('enovates-proxy', {
      body: { path, method, body, action: method === 'GET' ? 'poll' : 'command' },
    });
    if (error) throw error;
    return data;
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await callProxy(testPath);
      setTestResult({ ok: true, data: result.data });
      toast.success('Verbinding succesvol');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout';
      setTestResult({ ok: false, error: msg });
      toast.error('Verbinding mislukt');
    }
    setTesting(false);
  };

  const sendCommand = async () => {
    if (!commandPath) {
      toast.error('Vul een endpoint pad in');
      return;
    }
    setSending(true);
    try {
      let body: unknown = undefined;
      if (commandBody.trim()) {
        body = JSON.parse(commandBody);
      }
      const result = await callProxy(commandPath, 'POST', body);
      toast.success('Commando verzonden');
      setTestResult({ ok: true, data: result.data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout';
      toast.error(`Fout: ${msg}`);
      setTestResult({ ok: false, error: msg });
    }
    setSending(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Enovates API</h2>
          <p className="text-xs text-muted-foreground">REST verbinding met Enovates laadpalen</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Connection Test */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Verbinding testen</Label>
          <div className="flex gap-2">
            <Input
              value={testPath}
              onChange={(e) => setTestPath(e.target.value)}
              placeholder="/chargers"
              className="font-mono text-sm"
            />
            <Button onClick={runTest} disabled={testing} variant="outline" className="shrink-0 gap-2">
              <RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
              Test
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Voer een API pad in om de verbinding te testen (bijv. <code className="font-mono text-foreground">/chargers</code>)
          </p>
        </div>

        {/* Send Command */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Commando versturen (POST)</Label>
          <div className="flex gap-2">
            <Input
              value={commandPath}
              onChange={(e) => setCommandPath(e.target.value)}
              placeholder="/chargers/{id}/start"
              className="font-mono text-sm"
            />
            <Button onClick={sendCommand} disabled={sending} variant="outline" className="shrink-0 gap-2">
              <Send className={`h-4 w-4 ${sending ? 'animate-pulse' : ''}`} />
              Verstuur
            </Button>
          </div>
          <Input
            value={commandBody}
            onChange={(e) => setCommandBody(e.target.value)}
            placeholder='{"connector_id": 1} (optioneel JSON body)'
            className="font-mono text-sm"
          />
        </div>

        {/* Result */}
        {testResult && (
          <div className={`rounded-lg border p-4 space-y-2 ${testResult.ok ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
            <div className="flex items-center gap-2 text-sm font-medium">
              {testResult.ok ? (
                <><CheckCircle2 className="h-4 w-4 text-green-500" /> Succes</>
              ) : (
                <><XCircle className="h-4 w-4 text-destructive" /> Fout</>
              )}
            </div>
            <pre className="text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto text-foreground">
              {JSON.stringify(testResult.ok ? testResult.data : testResult.error, null, 2)}
            </pre>
          </div>
        )}

        {/* Info */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground text-sm">Hoe werkt het?</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Alle requests worden veilig doorgestuurd via een backend functie</li>
            <li>Je API key wordt nooit aan de browser blootgesteld</li>
            <li>Elke request wordt gelogd in de audit log</li>
            <li>Gebruik <strong>Test</strong> om data op te halen (GET) en <strong>Verstuur</strong> om commando's te sturen (POST)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default EnovatesApiSettings;
