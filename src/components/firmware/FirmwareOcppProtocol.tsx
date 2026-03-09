import { useAuditLog } from '@/hooks/useAuditLog';
import { Clock, CheckCircle2, XCircle, AlertTriangle, FileCode2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

const FirmwareOcppProtocol = () => {
  const { data: auditLogs, isLoading } = useAuditLog();

  const firmwareActions = ['UpdateFirmware', 'GetDiagnostics', 'FirmwareStatusNotification', 'DiagnosticsStatusNotification'];
  const firmwareLogs = auditLogs?.filter(log => firmwareActions.includes(log.action)) || [];

  const getActionIcon = (action: string) => {
    switch (action) {
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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FileCode2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">OCPP Protocol berichten</h3>
          <p className="text-xs text-muted-foreground">
            Firmware-gerelateerde OCPP berichten: UpdateFirmware, GetDiagnostics, StatusNotifications
          </p>
        </div>
      </div>

      {/* OCPP Actions legend */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowDownToLine className="h-3.5 w-3.5 text-primary" />
          <span>UpdateFirmware</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowUpFromLine className="h-3.5 w-3.5 text-blue-400" />
          <span>GetDiagnostics</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5 text-amber-500" />
          <span>FirmwareStatusNotification</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5 text-cyan-500" />
          <span>DiagnosticsStatusNotification</span>
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
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground font-mono">{log.action}</span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                        {log.charge_point_id}
                      </span>
                    </div>
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
