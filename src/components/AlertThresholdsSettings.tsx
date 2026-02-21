import { useState, useEffect } from 'react';
import { useGridAlertThresholds, GridAlertThreshold } from '@/hooks/useGridAlertThresholds';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Gauge, Save, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const ThresholdRow = ({
  threshold,
  onSave,
  isSaving,
}: {
  threshold: GridAlertThreshold;
  onSave: (t: Partial<GridAlertThreshold> & { id: string }) => void;
  isSaving: boolean;
}) => {
  const [min, setMin] = useState(String(threshold.min_value));
  const [max, setMax] = useState(String(threshold.max_value));
  const [enabled, setEnabled] = useState(threshold.enabled);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setMin(String(threshold.min_value));
    setMax(String(threshold.max_value));
    setEnabled(threshold.enabled);
    setDirty(false);
  }, [threshold]);

  const handleSave = () => {
    onSave({
      id: threshold.id,
      min_value: parseFloat(min),
      max_value: parseFloat(max),
      enabled,
    });
  };

  const markDirty = () => setDirty(true);

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center gap-3 sm:min-w-[160px]">
        <Switch
          checked={enabled}
          onCheckedChange={(v) => { setEnabled(v); markDirty(); }}
        />
        <div>
          <p className="text-sm font-medium text-foreground">{threshold.label}</p>
          {threshold.unit && (
            <p className="text-[10px] text-muted-foreground">{threshold.unit}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-1">
        <div className="space-y-1 flex-1">
          <Label className="text-[10px] text-muted-foreground">Minimum</Label>
          <Input
            type="number"
            step="any"
            value={min}
            onChange={(e) => { setMin(e.target.value); markDirty(); }}
            className="text-sm h-9"
          />
        </div>
        <div className="space-y-1 flex-1">
          <Label className="text-[10px] text-muted-foreground">Maximum</Label>
          <Input
            type="number"
            step="any"
            value={max}
            onChange={(e) => { setMax(e.target.value); markDirty(); }}
            className="text-sm h-9"
          />
        </div>
      </div>

      <Button
        size="sm"
        variant={dirty ? 'default' : 'outline'}
        disabled={!dirty || isSaving}
        onClick={handleSave}
        className="shrink-0"
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      </Button>
    </div>
  );
};

const AlertThresholdsSettings = () => {
  const { thresholds, isLoading, updateThreshold } = useGridAlertThresholds();

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Gauge className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Alert Drempelwaarden</h2>
          <p className="text-xs text-muted-foreground">Configureer wanneer netspanning alerts worden gegenereerd</p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : thresholds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen drempelwaarden gevonden.</p>
        ) : (
          thresholds.map((t) => (
            <ThresholdRow
              key={t.id}
              threshold={t}
              onSave={(data) => updateThreshold.mutate(data)}
              isSaving={updateThreshold.isPending}
            />
          ))
        )}

        <p className="text-[10px] text-muted-foreground pt-2">
          Alerts worden getriggerd wanneer een meting buiten het min/max bereik valt. Uitgeschakelde metrics genereren geen alerts.
        </p>
      </div>
    </div>
  );
};

export default AlertThresholdsSettings;
