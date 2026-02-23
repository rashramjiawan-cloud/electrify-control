import { Button } from '@/components/ui/button';

export interface LogEntry {
  id: number;
  time: string;
  action: string;
  direction: 'send' | 'receive';
  payload: string;
  status: 'success' | 'error';
}

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

const SimulatorLog = ({ logs, onClear }: Props) => (
  <div className="rounded-xl border border-border bg-card flex flex-col max-h-[calc(100vh-12rem)]">
    <div className="border-b border-border px-5 py-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">Berichtenlog</h2>
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onClear}>
        Wissen
      </Button>
    </div>
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {logs.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-8">Nog geen berichten verstuurd</p>
      ) : (
        logs.map(log => (
          <div
            key={log.id}
            className={`rounded-lg border px-3 py-2 text-xs ${
              log.status === 'error'
                ? 'border-destructive/30 bg-destructive/5'
                : log.direction === 'send'
                ? 'border-primary/30 bg-primary/5'
                : 'border-border bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold ${log.direction === 'send' ? 'text-primary' : 'text-foreground'}`}>
                  {log.direction === 'send' ? '→' : '←'}
                </span>
                <span className="font-mono font-semibold text-foreground">{log.action}</span>
              </div>
              <span className="font-mono text-muted-foreground">{log.time}</span>
            </div>
            <pre className="font-mono text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {log.payload}
            </pre>
          </div>
        ))
      )}
    </div>
  </div>
);

export default SimulatorLog;
