import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Zap, Database, ShieldAlert, FileText, Heart } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CleanupPreview {
  meter_readings: number;
  grid_alerts: number;
  audit_log: number;
  meter_values: number;
  heartbeats: number;
}

const TABLES = [
  { key: 'meter_readings', label: 'Meterdata', icon: Zap },
  { key: 'meter_values', label: 'Meterwaarden', icon: Database },
  { key: 'grid_alerts', label: 'Grid Alerts', icon: ShieldAlert },
  { key: 'audit_log', label: 'Audit Log', icon: FileText },
  { key: 'heartbeats', label: 'Heartbeats', icon: Heart },
] as const;

interface Props {
  trigger: React.ReactNode;
  onConfirm: () => void;
}

const CleanupConfirmDialog = ({ trigger, onConfirm }: Props) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setPreview(null); return; }
    setLoading(true);
    supabase.functions.invoke('cleanup-old-data', { body: { dry_run: true } })
      .then(({ data }) => setPreview(data as CleanupPreview))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [open]);

  const total = preview
    ? TABLES.reduce((sum, t) => sum + (preview[t.key] ?? 0), 0)
    : 0;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Data opschonen?</AlertDialogTitle>
          <AlertDialogDescription>
            Records ouder dan de ingestelde retentieperiodes worden permanent verwijderd.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Te verwijderen records:</p>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Berekenen…</span>
            </div>
          ) : preview ? (
            <>
              {TABLES.map(({ key, label, icon: Icon }) => {
                const count = preview[key] ?? 0;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm text-foreground">{label}</span>
                    </div>
                    <span className={`font-mono text-sm ${count > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                      {count.toLocaleString('nl-NL')}
                    </span>
                  </div>
                );
              })}
              <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Totaal</span>
                <span className={`font-mono text-sm font-bold ${total > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {total.toLocaleString('nl-NL')}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Preview niet beschikbaar</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { setOpen(false); onConfirm(); }}
            disabled={loading || total === 0}
          >
            {total > 0 ? `${total.toLocaleString('nl-NL')} records verwijderen` : 'Niets te verwijderen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CleanupConfirmDialog;
