import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RefreshCw, CloudDownload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ExternalSyncSettings = () => {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<{ synced: number; errors: string[] } | null>(null);

  const runSync = async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('sync-external-chargepoints', {
        method: 'POST',
        body: {},
      });
      if (error) throw error;
      setLastResult(data);
      if (data.ok) {
        toast.success(`${data.synced} laadpalen gesynchroniseerd`);
      } else {
        toast.error(data.error || 'Sync mislukt');
      }
    } catch (e: any) {
      toast.error(`Sync fout: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <CloudDownload className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">Externe Laadpaal Sync</h2>
          <p className="text-xs text-muted-foreground">Importeer laadpalen van externe OCPP server</p>
        </div>
        <Button onClick={runSync} disabled={syncing} size="sm" className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchroniseren...' : 'Nu synchroniseren'}
        </Button>
      </div>

      <div className="p-5 space-y-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Haalt laadpalen en connectors op van de externe API</p>
          <p>• Bestaande laadpalen worden bijgewerkt, nieuwe worden aangemaakt</p>
          <p>• Status en connector-info worden gesynchroniseerd</p>
        </div>

        {lastResult && (
          <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
            lastResult.errors.length === 0
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-warning/10 border-warning/30 text-warning'
          }`}>
            {lastResult.errors.length === 0
              ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            }
            <div>
              <p className="font-medium">{lastResult.synced} laadpalen gesynchroniseerd</p>
              {lastResult.errors.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {lastResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                  {lastResult.errors.length > 5 && (
                    <li>• ...en {lastResult.errors.length - 5} meer</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExternalSyncSettings;
