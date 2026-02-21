import { useState } from 'react';
import { useNotificationChannels, NotificationChannel } from '@/hooks/useNotificationChannels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bell, Plus, Trash2, Send, Loader2, Webhook, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; fields: { key: string; label: string; placeholder: string; type?: string }[] }> = {
  webhook: {
    label: 'Webhook',
    icon: <Webhook className="h-4 w-4" />,
    fields: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://example.com/webhook' },
    ],
  },
  slack: {
    label: 'Slack',
    icon: <Send className="h-4 w-4" />,
    fields: [
      { key: 'webhook_url', label: 'Slack Incoming Webhook URL', placeholder: 'https://hooks.slack.com/services/...' },
    ],
  },
  email: {
    label: 'Email',
    icon: <Mail className="h-4 w-4" />,
    fields: [
      { key: 'to', label: 'Email adres(sen)', placeholder: 'alert@example.com' },
      { key: 'from', label: 'Van adres (optioneel)', placeholder: 'alerts@yourdomain.com' },
    ],
  },
};

const ChannelCard = ({
  channel,
  onUpdate,
  onDelete,
  isUpdating,
}: {
  channel: NotificationChannel;
  onUpdate: (data: Partial<NotificationChannel> & { id: string }) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
}) => {
  const meta = TYPE_META[channel.type];
  const [testing, setTesting] = useState(false);

  const testChannel = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-alert-notification', {
        body: {
          metric: 'voltage',
          label: 'Spanning',
          value: 205,
          unit: 'V',
          direction: 'low',
          channel: 0,
          threshold_min: 207,
          threshold_max: 253,
        },
      });
      if (error) throw error;
      toast.success(`Test verzonden naar ${channel.name}`);
    } catch (err: any) {
      toast.error('Test mislukt: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {meta?.icon}
          <span className="text-sm font-medium text-foreground">{channel.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{meta?.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={channel.enabled}
            onCheckedChange={(enabled) => onUpdate({ id: channel.id, enabled })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(channel.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {meta?.fields.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
          <Input
            type={field.type || 'text'}
            value={(channel.config as any)?.[field.key] || ''}
            placeholder={field.placeholder}
            className="text-sm h-9"
            onChange={(e) => {
              const newConfig = { ...channel.config, [field.key]: e.target.value };
              onUpdate({ id: channel.id, config: newConfig });
            }}
          />
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={testChannel} disabled={testing} className="gap-1.5">
        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Test versturen
      </Button>
    </div>
  );
};

const NotificationChannelsSettings = () => {
  const { channels, isLoading, createChannel, updateChannel, deleteChannel } = useNotificationChannels();
  const [newType, setNewType] = useState<string>('webhook');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    if (!newName.trim()) {
      toast.error('Geef een naam op');
      return;
    }
    createChannel.mutate(
      { type: newType as any, name: newName.trim(), enabled: true, config: {} },
      { onSuccess: () => { setNewName(''); setAdding(false); } },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">Notificatiekanalen</h2>
          <p className="text-xs text-muted-foreground">Ontvang grid alerts via webhook, Slack of email</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(!adding)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Kanaal
        </Button>
      </div>

      <div className="p-5 space-y-3">
        {adding && (
          <div className="p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
            <div className="flex gap-3">
              <div className="space-y-1 flex-1">
                <Label className="text-[10px] text-muted-foreground">Naam</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Bijv. Mijn Webhook"
                  className="text-sm h-9"
                />
              </div>
              <div className="space-y-1 w-36">
                <Label className="text-[10px] text-muted-foreground">Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={createChannel.isPending}>
                {createChannel.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Toevoegen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Annuleren</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : channels.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nog geen notificatiekanalen geconfigureerd. Klik op "Kanaal" om er een toe te voegen.
          </p>
        ) : (
          channels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              onUpdate={(data) => updateChannel.mutate(data)}
              onDelete={(id) => deleteChannel.mutate(id)}
              isUpdating={updateChannel.isPending}
            />
          ))
        )}

        <div className="text-[10px] text-muted-foreground space-y-1 pt-2">
          <p><strong>Webhook:</strong> POST request met JSON body naar je eigen URL (bijv. Home Assistant, Zapier)</p>
          <p><strong>Slack:</strong> Gebruik een Slack Incoming Webhook URL (apps.slack.com → Incoming Webhooks)</p>
          <p><strong>Email:</strong> Vereist een Resend API key als Cloud secret (RESEND_API_KEY)</p>
        </div>
      </div>
    </div>
  );
};

export default NotificationChannelsSettings;
