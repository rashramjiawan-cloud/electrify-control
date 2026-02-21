import { useState, useEffect } from 'react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Loader2, Gauge } from 'lucide-react';

const GTV_KEYS = [
  { key: 'gtv_import_kw', label: 'Afname (import)', unit: 'kW', type: 'number' as const },
  { key: 'gtv_export_kw', label: 'Teruglevering (export)', unit: 'kW', type: 'number' as const },
  { key: 'gtv_warning_pct', label: 'Waarschuwingsdrempel', unit: '%', type: 'number' as const },
  { key: 'gtv_grid_operator', label: 'Netbeheerder', unit: '', type: 'select' as const },
];

const GRID_OPERATORS = ['Stedin', 'Enexis', 'Liander', 'Westland Infra', 'Coteq', 'Rendo', 'Anders'];

const GtvSettings = () => {
  const { settings, isLoading, updateSetting, getSetting } = useSystemSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.length) return;
    const v: Record<string, string> = {};
    GTV_KEYS.forEach(({ key }) => {
      v[key] = getSetting(key)?.value ?? '';
    });
    setValues(v);
    setDirty(new Set());
  }, [settings]);

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setDirty(prev => new Set(prev).add(key));
  };

  const handleSave = async (key: string) => {
    setSavingKey(key);
    await updateSetting.mutateAsync({ key, value: values[key] });
    setDirty(prev => { const n = new Set(prev); n.delete(key); return n; });
    setSavingKey(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Gauge className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">Gecontracteerd Transportvermogen (GTV)</h2>
          <p className="text-xs text-muted-foreground">Maximaal afname- en terugleveringsvermogen volgens netcontract</p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : (
          <>
            {GTV_KEYS.map(({ key, label, unit, type }) => (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                </div>
                <div className="flex items-center gap-2">
                  {type === 'select' ? (
                    <Select value={values[key] || ''} onValueChange={(v) => handleChange(key, v)}>
                      <SelectTrigger className="w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GRID_OPERATORS.map(op => (
                          <SelectItem key={op} value={op}>{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Input
                        type="number"
                        min="1"
                        value={values[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="w-24 h-9 text-sm text-center"
                      />
                      {unit && <span className="text-xs text-muted-foreground whitespace-nowrap">{unit}</span>}
                    </>
                  )}
                  <Button
                    size="sm"
                    variant={dirty.has(key) ? 'default' : 'outline'}
                    disabled={!dirty.has(key) || savingKey === key}
                    onClick={() => handleSave(key)}
                    className="shrink-0"
                  >
                    {savingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground pt-2">
              Het GTV is het maximaal gecontracteerde transportvermogen met je netbeheerder. Bij structurele overschrijding kunnen sancties of verzwaringen volgen.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default GtvSettings;
