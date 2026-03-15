import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Copy, Check, Plus, Trash2, Network, Globe, Webhook, ArrowLeftRight, Shield, Filter } from 'lucide-react';
import {
  useOcppProxyBackends,
  useCreateProxyBackend,
  useUpdateProxyBackend,
  useDeleteProxyBackend,
  OcppProxyBackend,
} from '@/hooks/useOcppProxyBackends';
import { useChargePoints } from '@/hooks/useChargePoints';

const statusColors: Record<string, string> = {
  connected: 'bg-green-500/10 text-green-600 border-green-500/20',
  disconnected: 'bg-muted text-muted-foreground border-border',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
};

const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Gekopieerd');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy}>
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
};

const ChargePointFilter = ({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) => {
  const { data: chargePoints } = useChargePoints();
  const [expanded, setExpanded] = useState(false);

  const allMode = !selected || selected.length === 0;

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between cursor-pointer rounded-md border border-border p-2.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">Laadpalen filter</span>
          <span className="text-muted-foreground">
            {allMode ? '(alle laadpalen)' : `(${selected.length} geselecteerd)`}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="rounded-md border border-border p-3 space-y-2 max-h-40 overflow-y-auto">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={allMode}
              onCheckedChange={() => onChange([])}
            />
            <span className="font-medium">Alle laadpalen</span>
          </label>
          {chargePoints?.map((cp) => (
            <label key={cp.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={selected.includes(cp.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selected, cp.id]);
                  } else {
                    onChange(selected.filter((id) => id !== cp.id));
                  }
                }}
              />
              <span className="font-mono">{cp.id}</span>
              {cp.name !== cp.id && (
                <span className="text-muted-foreground">({cp.name})</span>
              )}
            </label>
          ))}
          {(!chargePoints || chargePoints.length === 0) && (
            <p className="text-[10px] text-muted-foreground">Geen laadpalen gevonden</p>
          )}
        </div>
      )}
    </div>
  );
};

const BackendCard = ({ backend }: { backend: OcppProxyBackend }) => {
  const update = useUpdateProxyBackend();
  const remove = useDeleteProxyBackend();

  const PROXY_CMD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-ws`;

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {backend.backend_type === 'ocpp_ws' ? (
            <Network className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <Webhook className="h-4 w-4 text-primary shrink-0" />
          )}
          <span className="font-medium text-sm truncate">{backend.name}</span>
          <Badge variant="outline" className={`text-[10px] ${statusColors[backend.connection_status] || statusColors.disconnected}`}>
            {backend.connection_status}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {backend.backend_type === 'ocpp_ws' ? 'OCPP WS' : 'HTTP Webhook'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={backend.enabled}
            onCheckedChange={(enabled) => update.mutate({ id: backend.id, enabled })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`Backend "${backend.name}" verwijderen?`)) {
                remove.mutate(backend.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground font-mono truncate" title={backend.url}>
        {backend.url}
      </div>

      {backend.last_error && (
        <div className="text-xs text-destructive bg-destructive/5 rounded p-2">
          Laatste fout: {backend.last_error}
        </div>
      )}

      {/* Charge Point Filter */}
      <ChargePointFilter
        selected={backend.charge_point_filter || []}
        onChange={(ids) => update.mutate({ id: backend.id, charge_point_filter: ids })}
      />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <ArrowLeftRight className="h-3 w-3" />
          Bidirectioneel: {backend.allow_commands ? 'Ja' : 'Nee'}
        </div>
        {backend.last_connected_at && (
          <div>
            Laatst verbonden: {new Date(backend.last_connected_at).toLocaleString('nl-NL')}
          </div>
        )}
      </div>

      {backend.allow_commands && backend.command_api_key && (
        <div className="rounded bg-muted/30 border border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Shield className="h-3 w-3" />
            Command API
          </div>
          <div className="flex items-center gap-1">
            <code className="text-[11px] font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
              {backend.command_api_key}
            </code>
            <CopyButton value={backend.command_api_key} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            POST naar <code className="font-mono">{PROXY_CMD_URL}</code> met:
            <code className="block mt-1 font-mono bg-muted p-1.5 rounded whitespace-pre">
{`{
  "api_key": "<key>",
  "charge_point_id": "CP-001",
  "message": [2, "uuid", "RemoteStartTransaction", {"idTag": "TAG1"}]
}`}
            </code>
          </div>
        </div>
      )}
    </div>
  );
};

const AddBackendDialog = () => {
  const [open, setOpen] = useState(false);
  const create = useCreateProxyBackend();
  const [form, setForm] = useState({
    name: '',
    backend_type: 'ocpp_ws',
    url: '',
    auth_header: '',
    allow_commands: false,
    charge_point_filter: [] as string[],
  });

  const handleSubmit = () => {
    if (!form.name || !form.url) {
      toast.error('Naam en URL zijn verplicht');
      return;
    }
    create.mutate(
      {
        name: form.name,
        backend_type: form.backend_type,
        url: form.url,
        auth_header: form.auth_header || null,
        allow_commands: form.allow_commands,
        charge_point_filter: form.charge_point_filter,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ name: '', backend_type: 'ocpp_ws', url: '', auth_header: '', allow_commands: false, charge_point_filter: [] });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Backend toevoegen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proxy Backend toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Naam</Label>
            <Input
              placeholder="Bijv. Netbeheerder CMS"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={form.backend_type} onValueChange={(v) => setForm({ ...form, backend_type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ocpp_ws">OCPP WebSocket (extern CSMS)</SelectItem>
                <SelectItem value="http_webhook">HTTP Webhook (REST API)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {form.backend_type === 'ocpp_ws' ? 'WebSocket URL (zonder Charge Point ID)' : 'Webhook URL'}
            </Label>
            <Input
              placeholder={
                form.backend_type === 'ocpp_ws'
                  ? 'wss://extern-csms.example.com/ocpp'
                  : 'https://api.example.com/ocpp-webhook'
              }
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            {form.backend_type === 'ocpp_ws' && (
              <p className="text-[10px] text-muted-foreground">
                Het Charge Point ID wordt automatisch aan de URL toegevoegd
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Authorization header (optioneel)</Label>
            <Input
              placeholder={form.backend_type === 'ocpp_ws' ? 'Basic dXNlcjpwYXNz...' : 'Bearer sk-...'}
              value={form.auth_header}
              onChange={(e) => setForm({ ...form, auth_header: e.target.value })}
            />
            {form.backend_type === 'ocpp_ws' && (
              <p className="text-[10px] text-muted-foreground">
                Wordt als HTTP header meegestuurd bij het opzetten van de WebSocket-verbinding
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-xs font-medium">Bidirectioneel</Label>
              <p className="text-[10px] text-muted-foreground">
                Sta dit backend toe om commando's naar laadpalen te sturen
              </p>
            </div>
            <Switch
              checked={form.allow_commands}
              onCheckedChange={(v) => setForm({ ...form, allow_commands: v })}
            />
          </div>

          {/* Charge Point Filter */}
          <ChargePointFilter
            selected={form.charge_point_filter}
            onChange={(ids) => setForm({ ...form, charge_point_filter: ids })}
          />

          <Button onClick={handleSubmit} className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Bezig...' : 'Toevoegen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const OcppProxySettings = () => {
  const { data: backends, isLoading } = useOcppProxyBackends();

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">OCPP Proxy</h2>
            <p className="text-xs text-muted-foreground">
              Fan-out: OCPP-berichten doorsturen naar meerdere backends
            </p>
          </div>
        </div>
        <AddBackendDialog />
      </div>

      <div className="p-5 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Laden...</p>}

        {!isLoading && (!backends || backends.length === 0) && (
          <div className="text-center py-8 space-y-2">
            <Globe className="h-8 w-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Geen proxy backends geconfigureerd</p>
            <p className="text-xs text-muted-foreground">
              Voeg een backend toe om OCPP-berichten door te sturen naar externe systemen
            </p>
          </div>
        )}

        {backends?.map((backend) => (
          <BackendCard key={backend.id} backend={backend} />
        ))}

        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground text-sm">Hoe werkt de OCPP Proxy?</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Elk OCPP-bericht van een laadpaal wordt <span className="text-foreground font-medium">gelijktijdig</span> doorgestuurd naar alle actieve backends</li>
            <li><span className="text-foreground font-medium">OCPP WS</span>: Opent een parallelle WebSocket-verbinding met het externe CSMS</li>
            <li><span className="text-foreground font-medium">HTTP Webhook</span>: Stuurt berichten als JSON POST naar je API endpoint</li>
            <li><span className="text-foreground font-medium">Bidirectioneel</span>: Externe backends kunnen commando's (RemoteStart, Reset, etc.) terugsturen via de Command API</li>
            <li>VoltControl blijft altijd het primaire systeem en beantwoordt de laadpaal</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OcppProxySettings;
