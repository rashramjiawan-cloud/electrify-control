import { useState } from 'react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database, HardDrive, ShieldAlert, FileText, Zap, Heart, Trash2, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CleanupConfirmDialog from '@/components/CleanupConfirmDialog';

interface TableCount {
  label: string;
  count: number;
  retentionDays: number | null;
  icon: React.ElementType;
}

const useTableCounts = () =>
  useQuery({
    queryKey: ['data-retention-counts'],
    queryFn: async () => {
      const [mr, ga, al, mv, hb] = await Promise.all([
        supabase.from('meter_readings').select('id', { count: 'exact', head: true }),
        supabase.from('grid_alerts').select('id', { count: 'exact', head: true }),
        supabase.from('ocpp_audit_log').select('id', { count: 'exact', head: true }),
        supabase.from('meter_values').select('id', { count: 'exact', head: true }),
        supabase.from('heartbeats').select('id', { count: 'exact', head: true }),
      ]);
      return {
        meter_readings: mr.count ?? 0,
        grid_alerts: ga.count ?? 0,
        audit_log: al.count ?? 0,
        meter_values: mv.count ?? 0,
        heartbeats: hb.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

const DataRetentionWidget = () => {
  const queryClient = useQueryClient();
  const [cleaning, setCleaning] = useState(false);
  const { settings, isLoading: settingsLoading, getSetting } = useSystemSettings();
  const { data: counts, isLoading: countsLoading } = useTableCounts();

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-old-data');
      if (error) throw error;
      const result = data as Record<string, number>;
      const totalDeleted = Object.values(result).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
      toast.success(`Cleanup voltooid: ${totalDeleted} records verwijderd`);
      queryClient.invalidateQueries({ queryKey: ['data-retention-counts'] });
    } catch (err: any) {
      toast.error('Cleanup mislukt: ' + (err.message || 'Onbekende fout'));
    } finally {
      setCleaning(false);
    }
  };

  const isLoading = settingsLoading || countsLoading;

  const meterDays = Number(getSetting('meter_data_retention_days')?.value ?? 90);
  const alertDays = Number(getSetting('grid_alerts_retention_days')?.value ?? 180);
  const auditDays = Number(getSetting('audit_log_retention_days')?.value ?? 365);

  const tables: TableCount[] = counts
    ? [
        { label: 'Meterdata', count: counts.meter_readings, retentionDays: meterDays, icon: Zap },
        { label: 'Meterwaarden', count: counts.meter_values, retentionDays: meterDays, icon: Database },
        { label: 'Grid Alerts', count: counts.grid_alerts, retentionDays: alertDays, icon: ShieldAlert },
        { label: 'Audit Log', count: counts.audit_log, retentionDays: auditDays, icon: FileText },
        { label: 'Heartbeats', count: counts.heartbeats, retentionDays: meterDays, icon: Heart },
      ]
    : [];

  const totalRecords = tables.reduce((a, t) => a + t.count, 0);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Dataopslag &amp; Retentie</h2>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Total summary */}
            <div className="flex items-baseline gap-2 mb-4">
              <span className="font-mono text-2xl font-bold text-foreground">{totalRecords.toLocaleString('nl-NL')}</span>
              <span className="text-sm text-muted-foreground">records totaal</span>
            </div>

            {/* Per-table breakdown */}
            <div className="space-y-2.5">
              {tables.map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground truncate">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm text-foreground">{t.count.toLocaleString('nl-NL')}</span>
                      {t.retentionDays && (
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {t.retentionDays}d
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Retention legend + cleanup */}
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Meterdata <span className="font-mono">{meterDays}d</span> · Alerts <span className="font-mono">{alertDays}d</span> · Audit <span className="font-mono">{auditDays}d</span>
              </p>
              <CleanupConfirmDialog
                onConfirm={handleCleanup}
                trigger={
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 shrink-0" disabled={cleaning}>
                    {cleaning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Cleanup
                  </Button>
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DataRetentionWidget;
