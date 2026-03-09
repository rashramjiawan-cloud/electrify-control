import { useState } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useChargePoints } from '@/hooks/useChargePoints';
import { Clock, CheckCircle2, XCircle, AlertTriangle, FileCode2, ArrowDownToLine, ArrowUpFromLine, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const OCPP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-handler`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const FirmwareOcppProtocol = () => {
  const { data: auditLogs, isLoading, refetch } = useAuditLog();
  const { data: chargePoints } = useChargePoints();

  const [selectedCp, setSelectedCp] = useState('');
  const [action, setAction] = useState<'UpdateFirmware' | 'GetDiagnostics'>('UpdateFirmware');
  const [location, setLocation] = useState('');
  const [retrieveDate, setRetrieveDate] = useState('');
  const [retries, setRetries] = useState('3');
  const [retryInterval, setRetryInterval] = useState('30');
  const [sending, setSending] = useState(false);

  const firmwareActions = ['UpdateFirmware', 'GetDiagnostics', 'FirmwareStatusNotification', 'DiagnosticsStatusNotification'];
  const firmwareLogs = auditLogs?.filter(log => firmwareActions.includes(log.action)) || [];

  const sendOcppCommand = async () => {
    if (!selectedCp) { toast.error('Selecteer een laadpaal'); return; }
    if (!location) { toast.error('Voer een URL/locatie in'); return; }

    setSending(true);
    const payload = action === 'UpdateFirmware'
      ? { location, retrieveDate: retrieveDate || new Date().toISOString(), retries: Number(retries), retryInterval: Number(retryInterval) }
      : { location, retries: Number(retries), retryInterval: Number(retryInterval) };

    try {
      const res = await fetch(OCPP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          chargePointId: selectedCp,
          messageTypeId: 2,
          uniqueId: crypto.randomUUID().slice(0, 8),
          action,
          payload,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${action} verstuurd naar ${selectedCp}`);
        refetch();
      } else {
        toast.error(`${action} mislukt: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const getActionIcon = (a: string) => {
    switch (a) {
      case 'UpdateFirmware': return <ArrowDownToLine className="h-4 w-4 text-primary" />;
      case 'GetDiagnostics': return <ArrowUpFromLine className="h-4 w-4 text-blue-400" />;
      case 'FirmwareStatusNotification': return <FileCode2 className="h-4 w-4 text-amber-500" />;
      case 'DiagnosticsStatusNotification': return <FileCode2 className="h-4 w-4 text-cyan-500" />;
      default: return <FileCode2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'Accepted') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (status === 'Rejected') return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* Send OCPP Command */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Send className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">OCPP Firmware commando versturen</h3>
            <p className="text-xs text-muted-foreground">Stuur UpdateFirmware of GetDiagnostics direct via OCPP</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <Label className="text-xs">Laadpaal</Label>
            <Select value={selectedCp} onValueChange={setSelectedCp}>
              <SelectTrigger className="font-mono text-xs"><SelectValue placeholder="Kies..." /></SelectTrigger>
              <SelectContent>
                {chargePoints?.map(cp => (
                  <SelectItem key={cp.id} value={cp.id} className="font-mono text-xs">{cp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Actie</Label>
            <Select value={action} onValueChange={v => setAction(v as 'UpdateFirmware' | 'GetDiagnostics')}>
              <SelectTrigger className="font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UpdateFirmware" className="font-mono text-xs">UpdateFirmware</SelectItem>
                <SelectItem value="GetDiagnostics" className="font-mono text-xs">GetDiagnostics</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{action === 'UpdateFirmware' ? 'Firmware URL' : 'Upload locatie'}</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="https://..." className="font-mono text-xs" />
          </div>
          {action === 'UpdateFirmware' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Ophaal datum/tijd</Label>
              <Input type="datetime-local" value={retrieveDate} onChange={e => setRetrieveDate(e.target.value)} className="font-mono text-xs" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Retries</Label>
            <Input value={retries} onChange={e => setRetries(e.target.value)} type="number" className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Retry interval (s)</Label>
            <Input value={retryInterval} onChange={e => setRetryInterval(e.target.value)} type="number" className="font-mono text-xs" />
          </div>
        </div>

        <Button onClick={sendOcppCommand} disabled={sending} className="mt-4 gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {action} versturen
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowDownToLine className="h-3.5 w-3.5 text-primary" /><span>UpdateFirmware</span></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowUpFromLine className="h-3.5 w-3.5 text-blue-400" /><span>GetDiagnostics</span></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileCode2 className="h-3.5 w-3.5 text-amber-500" /><span>FirmwareStatusNotification</span></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileCode2 className="h-3.5 w-3.5 text-cyan-500" /><span>DiagnosticsStatusNotification</span></div>
      </div>

      {/* Audit log */}
      <div className="flex items-center gap-3 mb-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FileCode2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">OCPP Protocol berichten</h3>
          <p className="text-xs text-muted-foreground">Firmware-gerelateerde OCPP berichten log</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : firmwareLogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <FileCode2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Geen firmware OCPP berichten gevonden</p>
          <p className="text-xs text-muted-foreground mt-1">Stuur een firmware update om OCPP protocol verkeer te zien</p>
        </div>
      ) : (
        <div className="space-y-2">
          {firmwareLogs.map(log => (
            <div key={log.id} className="rounded-xl border border-border bg-card px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getActionIcon(log.action)}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground font-mono">{log.action}</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">{log.charge_point_id}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(log.status)}
                    <span className="text-xs font-medium text-foreground">{log.status}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(log.created_at)}
                  </span>
                </div>
              </div>
              {log.payload && Object.keys(log.payload as object).length > 0 && (
                <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
                  <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap overflow-hidden">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FirmwareOcppProtocol;
