import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, ArrowUp, ArrowDown, RotateCw, CheckCircle2, XCircle } from 'lucide-react';
import { useOcppProxyLog } from '@/hooks/useOcppProxyLog';
import { useOcppProxyBackends } from '@/hooks/useOcppProxyBackends';

const directionIcon = (dir: string) => {
  if (dir === 'upstream') return <ArrowUp className="h-3 w-3 text-primary" />;
  if (dir === 'downstream') return <ArrowDown className="h-3 w-3 text-accent-foreground" />;
  return <RotateCw className="h-3 w-3 text-muted-foreground" />;
};

const directionLabel = (dir: string) => {
  if (dir === 'upstream') return 'CP → Backend';
  if (dir === 'downstream') return 'Backend → CP';
  if (dir === 'response') return 'CSMS → Backend';
  return dir;
};

const OcppProxyLogWidget = () => {
  const [backendFilter, setBackendFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: backends } = useOcppProxyBackends();
  const { data: logs, isLoading } = useOcppProxyLog({
    backendId: backendFilter !== 'all' ? backendFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 200,
  });

  const successCount = logs?.filter(l => l.status === 'success').length || 0;
  const errorCount = logs?.filter(l => l.status === 'error').length || 0;
  const avgLatency = logs?.length
    ? Math.round(
        logs.filter(l => l.latency_ms != null).reduce((sum, l) => sum + (l.latency_ms || 0), 0) /
          Math.max(1, logs.filter(l => l.latency_ms != null).length)
      )
    : 0;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Proxy Audit Log</h2>
            <p className="text-xs text-muted-foreground">Doorgestuurde OCPP-berichten per backend</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            {successCount}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            {errorCount}
          </div>
          {avgLatency > 0 && (
            <div className="text-muted-foreground">
              Ø {avgLatency}ms
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <Select value={backendFilter} onValueChange={setBackendFilter}>
          <SelectTrigger className="h-8 text-xs w-48">
            <SelectValue placeholder="Alle backends" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle backends</SelectItem>
            {backends?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="success">Succes</SelectItem>
            <SelectItem value="error">Fout</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="h-[360px]">
        <div className="divide-y divide-border">
          {isLoading && (
            <div className="p-8 text-center text-sm text-muted-foreground">Laden...</div>
          )}

          {!isLoading && (!logs || logs.length === 0) && (
            <div className="p-8 text-center space-y-1">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">Geen proxy logs gevonden</p>
              <p className="text-xs text-muted-foreground">
                Logs verschijnen zodra OCPP-berichten worden doorgestuurd
              </p>
            </div>
          )}

          {logs?.map((entry) => (
            <div key={entry.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
              {/* Direction */}
              <div className="shrink-0" title={directionLabel(entry.direction)}>
                {directionIcon(entry.direction)}
              </div>

              {/* Status */}
              <div className="shrink-0">
                {entry.status === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                )}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{entry.backend_name}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-mono text-muted-foreground">{entry.charge_point_id}</span>
                  {entry.action && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {entry.action}
                    </Badge>
                  )}
                  {entry.message_type && (
                    <span className="text-[10px] text-muted-foreground">{entry.message_type}</span>
                  )}
                </div>
                {entry.error_message && (
                  <p className="text-[10px] text-destructive truncate">{entry.error_message}</p>
                )}
              </div>

              {/* Meta */}
              <div className="shrink-0 text-right space-y-0.5">
                {entry.latency_ms != null && (
                  <div className="text-[10px] text-muted-foreground">{entry.latency_ms}ms</div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  {new Date(entry.created_at).toLocaleTimeString('nl-NL')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default OcppProxyLogWidget;
