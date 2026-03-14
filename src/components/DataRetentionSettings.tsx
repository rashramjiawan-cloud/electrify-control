import { useState, useEffect } from 'react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Save, Loader2, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import CleanupConfirmDialog from '@/components/CleanupConfirmDialog';

const RETENTION_KEYS = [
  { key: 'meter_data_retention_days', label: 'Meterdata & heartbeats', icon: '📊' },
  { key: 'grid_alerts_retention_days', label: 'Grid alerts', icon: '⚡' },
  { key: 'audit_log_retention_days', label: 'Audit logs', icon: '📝' },
  { key: 'load_balance_logs_retention_days', label: 'Load balance logs', icon: '⚖️' },
  { key: 'device_health_retention_days', label: 'Device health', icon: '🌡️' },
];

const RetentionRow = ({
  settingKey,
  label,
  icon,
  currentValue,
  onSave,
  isSaving,
}: {
  settingKey: string;
  label: string;
  icon: string;
  currentValue: string;
  onSave: (key: string, value: string) => void;
  isSaving: boolean;
}) => {
  const [value, setValue] = useState(currentValue);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(currentValue);
    setDirty(false);
  }, [currentValue]);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="1"
          max="3650"
          value={value}
          onChange={(e) => { setValue(e.target.value); setDirty(true); }}
          className="w-20 h-9 text-sm text-center"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">dagen</span>
        <Button
          size="sm"
          variant={dirty ? 'default' : 'outline'}
          disabled={!dirty || isSaving}
          onClick={() => onSave(settingKey, value)}
          className="shrink-0"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const DataRetentionSettings = () => {
  const { settings, isLoading, updateSetting, getSetting } = useSystemSettings();
  const [running, setRunning] = useState(false);

  const runCleanupNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-old-data');
      if (error) throw error;
      const result = data as Record<string, number>;
      const total =
        (result.meter_readings_deleted ?? 0) +
        (result.grid_alerts_deleted ?? 0) +
        (result.audit_log_deleted ?? 0) +
        (result.meter_values_deleted ?? 0) +
        (result.heartbeats_deleted ?? 0) +
        (result.load_balance_logs_deleted ?? 0) +
        (result.device_health_deleted ?? 0);
      toast.success(`Cleanup voltooid: ${total} records verwijderd`);
    } catch (err: any) {
      toast.error('Cleanup mislukt: ' + err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Trash2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">Data Retentie</h2>
          <p className="text-xs text-muted-foreground">Automatisch opschonen van oude data</p>
        </div>
        <CleanupConfirmDialog
          onConfirm={runCleanupNow}
          trigger={
            <Button variant="outline" size="sm" disabled={running} className="gap-1.5">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Nu opschonen
            </Button>
          }
        />
      </div>
      <div className="p-5 space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : (
          RETENTION_KEYS.map(({ key, label, icon }) => {
            const setting = getSetting(key);
            return (
              <RetentionRow
                key={key}
                settingKey={key}
                label={label}
                icon={icon}
                currentValue={setting?.value ?? '90'}
                onSave={(k, v) => updateSetting.mutate({ key: k, value: v })}
                isSaving={updateSetting.isPending}
              />
            );
          })
        )}

        <p className="text-[10px] text-muted-foreground pt-2">
          De cleanup draait automatisch elke nacht om 03:00 UTC. Je kunt ook handmatig opschonen met de knop hierboven.
        </p>
      </div>
    </div>
  );
};

export default DataRetentionSettings;
