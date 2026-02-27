import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Plus, X, Shield } from 'lucide-react';
import { useMqttConfigurations, MqttConfiguration } from '@/hooks/useMqttConfigurations';

interface MqttConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: string;
  assetId: string;
  assetName: string;
  existing?: MqttConfiguration | null;
}

const defaultTopics = (type: string, id: string) => {
  const base = `voltcontrol/${type}/${id}`;
  return {
    subscribe: [`${base}/status`, `${base}/telemetry`],
    publish: [`${base}/command`, `${base}/config`],
  };
};

const MqttConfigDialog = ({ open, onOpenChange, assetType, assetId, assetName, existing }: MqttConfigDialogProps) => {
  const { upsert } = useMqttConfigurations();
  const defaults = defaultTopics(assetType, assetId);

  const [form, setForm] = useState({
    enabled: false,
    broker_host: '',
    broker_port: 1883,
    use_tls: false,
    username: '',
    password: '',
    client_id: `voltcontrol-${assetType}-${assetId}`,
    subscribe_topics: defaults.subscribe,
    publish_topics: defaults.publish,
    qos: 1,
    keep_alive_sec: 60,
  });

  const [newSubTopic, setNewSubTopic] = useState('');
  const [newPubTopic, setNewPubTopic] = useState('');

  useEffect(() => {
    if (existing) {
      setForm({
        enabled: existing.enabled,
        broker_host: existing.broker_host,
        broker_port: existing.broker_port,
        use_tls: existing.use_tls,
        username: existing.username || '',
        password: existing.password || '',
        client_id: existing.client_id || `voltcontrol-${assetType}-${assetId}`,
        subscribe_topics: existing.subscribe_topics || defaults.subscribe,
        publish_topics: existing.publish_topics || defaults.publish,
        qos: existing.qos,
        keep_alive_sec: existing.keep_alive_sec,
      });
    }
  }, [existing]);

  const handleSave = () => {
    upsert.mutate({
      ...(existing?.id ? { id: existing.id } : {}),
      asset_type: assetType,
      asset_id: assetId,
      asset_name: assetName,
      ...form,
    });
    onOpenChange(false);
  };

  const addTopic = (type: 'subscribe_topics' | 'publish_topics', topic: string) => {
    if (!topic.trim()) return;
    setForm(f => ({ ...f, [type]: [...f[type], topic.trim()] }));
    type === 'subscribe_topics' ? setNewSubTopic('') : setNewPubTopic('');
  };

  const removeTopic = (type: 'subscribe_topics' | 'publish_topics', idx: number) => {
    setForm(f => ({ ...f, [type]: f[type].filter((_, i) => i !== idx) }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            MQTT Configuratie — {assetName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div>
              <p className="text-sm font-medium">MQTT Inschakelen</p>
              <p className="text-xs text-muted-foreground">Activeer MQTT verbinding voor dit asset</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
          </div>

          {/* Broker settings */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Broker Verbinding</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Host</Label>
                <Input value={form.broker_host} onChange={e => setForm(f => ({ ...f, broker_host: e.target.value }))} placeholder="mqtt.example.com" className="font-mono text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Port</Label>
                <Input type="number" value={form.broker_port} onChange={e => setForm(f => ({ ...f, broker_port: parseInt(e.target.value) || 1883 }))} className="font-mono text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.use_tls} onCheckedChange={v => setForm(f => ({ ...f, use_tls: v, broker_port: v ? 8883 : 1883 }))} />
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">TLS/SSL</span>
              </div>
            </div>
          </div>

          {/* Auth */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Authenticatie</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Gebruikersnaam</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="font-mono text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Wachtwoord</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Client ID</Label>
              <Input value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} className="font-mono text-sm" />
            </div>
          </div>

          {/* Subscribe Topics */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subscribe Topics</h4>
            <div className="flex flex-wrap gap-1.5">
              {form.subscribe_topics.map((t, i) => (
                <Badge key={i} variant="secondary" className="font-mono text-xs gap-1">
                  {t}
                  <button onClick={() => removeTopic('subscribe_topics', i)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newSubTopic} onChange={e => setNewSubTopic(e.target.value)} placeholder="topic/path" className="font-mono text-sm" onKeyDown={e => e.key === 'Enter' && addTopic('subscribe_topics', newSubTopic)} />
              <Button size="sm" variant="outline" onClick={() => addTopic('subscribe_topics', newSubTopic)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Publish Topics */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Publish Topics</h4>
            <div className="flex flex-wrap gap-1.5">
              {form.publish_topics.map((t, i) => (
                <Badge key={i} variant="secondary" className="font-mono text-xs gap-1">
                  {t}
                  <button onClick={() => removeTopic('publish_topics', i)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newPubTopic} onChange={e => setNewPubTopic(e.target.value)} placeholder="topic/path" className="font-mono text-sm" onKeyDown={e => e.key === 'Enter' && addTopic('publish_topics', newPubTopic)} />
              <Button size="sm" variant="outline" onClick={() => addTopic('publish_topics', newPubTopic)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Advanced */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Geavanceerd</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">QoS Level</Label>
                <Select value={String(form.qos)} onValueChange={v => setForm(f => ({ ...f, qos: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 — At most once</SelectItem>
                    <SelectItem value="1">1 — At least once</SelectItem>
                    <SelectItem value="2">2 — Exactly once</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Keep Alive (sec)</Label>
                <Input type="number" value={form.keep_alive_sec} onChange={e => setForm(f => ({ ...f, keep_alive_sec: parseInt(e.target.value) || 60 }))} className="font-mono text-sm" />
              </div>
            </div>
          </div>

          {/* Status */}
          {existing && (
            <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-2">
              {existing.connection_status === 'connected' ? (
                <><Wifi className="h-4 w-4 text-primary" /><span className="text-sm text-primary font-medium">Verbonden</span></>
              ) : (
                <><WifiOff className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Niet verbonden</span></>
              )}
              {existing.last_connected_at && (
                <span className="text-xs text-muted-foreground ml-auto">
                  Laatst: {new Date(existing.last_connected_at).toLocaleString('nl-NL')}
                </span>
              )}
            </div>
          )}

          <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
            {upsert.isPending ? 'Opslaan...' : 'MQTT Configuratie Opslaan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MqttConfigDialog;
