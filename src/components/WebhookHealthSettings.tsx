import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wifi, Save } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';

const WebhookHealthSettings = () => {
  const { getSetting, updateSetting, isLoading } = useSystemSettings();
  const [staleMin, setStaleMin] = useState('5');
  const [cooldownMin, setCooldownMin] = useState('15');

  useEffect(() => {
    const s = getSetting('webhook_stale_threshold_min');
    const c = getSetting('webhook_alert_cooldown_min');
    if (s) setStaleMin(s.value);
    if (c) setCooldownMin(c.value);
  }, [getSetting]);

  const save = () => {
    updateSetting.mutate({ key: 'webhook_stale_threshold_min', value: staleMin });
    updateSetting.mutate({ key: 'webhook_alert_cooldown_min', value: cooldownMin });
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-2/10">
          <Wifi className="h-4 w-4 text-chart-2" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Webhook Health Monitor</h2>
          <p className="text-xs text-muted-foreground">Instellingen voor offline detectie van webhook meters</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Offline drempel (minuten)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={staleMin}
              onChange={e => setStaleMin(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Na hoeveel minuten zonder data een webhook meter als offline wordt beschouwd.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notificatie cooldown (minuten)</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={cooldownMin}
              onChange={e => setCooldownMin(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Minimale tijd tussen herhaalde offline notificaties voor dezelfde meter.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={updateSetting.isPending || isLoading}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Opslaan
        </Button>
      </div>
    </div>
  );
};

export default WebhookHealthSettings;
