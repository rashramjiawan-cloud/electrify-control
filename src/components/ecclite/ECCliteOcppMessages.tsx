import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Download, ArrowUp, ArrowDown } from 'lucide-react';
import type { ECCliteLogEntry } from '@/pages/ECCliteEmulator';

export interface OcppMessage {
  id: number;
  dir: 'OUT' | 'IN';
  action: string;
  seq: string;
  ts: string;
  type: 'req' | 'resp' | 'err';
  payload: string;
}

interface Props {
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

let msgCounter = 0;

const ECCliteOcppMessages = ({ addLog }: Props) => {
  const [messages, setMessages] = useState<OcppMessage[]>([]);
  const [filter, setFilter] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback((msg: Omit<OcppMessage, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: msgCounter++ }].slice(-200));
  }, []);

  // Expose addMessage for parent — use via ref or context
  // For now messages are added internally from demo data

  useEffect(() => {
    // Load demo messages
    const demoMsgs: Omit<OcppMessage, 'id'>[] = [
      { dir: 'OUT', action: 'BootNotification', seq: '13347', ts: '20:08:11', type: 'req',
        payload: '{"chargePointVendor":"LMS","chargePointModel":"EVC2.2",\n"chargePointSerialNumber":"11761346","firmwareVersion":"4.3x.32.R18.P3",\n"iccid":"8931084725025260281"}' },
      { dir: 'IN', action: 'BootNotification [Response]', seq: '13347', ts: '20:08:20', type: 'resp',
        payload: '{"currentTime":"2026-03-17T20:08:20.864Z","interval":300,"status":"Accepted"}' },
      { dir: 'IN', action: 'SetChargingProfile', seq: 'bd21aa0a', ts: '20:08:20', type: 'req',
        payload: '{"connectorId":1,"csChargingProfiles":{"chargingProfileId":1,"stackLevel":0,\n"chargingProfilePurpose":"TxDefaultProfile","chargingProfileKind":"Absolute",\n"chargingSchedule":{"chargingRateUnit":"A","chargingSchedulePeriod":[{"startPeriod":0,"limit":0.0,"numberPhases":3}]}}}' },
      { dir: 'OUT', action: 'StatusNotification', seq: '13348', ts: '20:08:21', type: 'req',
        payload: '{"connectorId":0,"status":"Available","errorCode":"NoError","timestamp":"2026-03-17T20:07:42Z"}' },
      { dir: 'OUT', action: 'StatusNotification', seq: '13349', ts: '20:08:24', type: 'req',
        payload: '{"connectorId":1,"status":"Faulted","errorCode":"ReaderFailure",\n"info":"M3[0/-112]S[12000800:KWH error,RFID]"}' },
      { dir: 'OUT', action: 'StatusNotification', seq: '13351', ts: '20:08:28', type: 'req',
        payload: '{"connectorId":2,"status":"Faulted","errorCode":"PowerMeterFailure",\n"info":"M3[0/-118]S[2000800:KWH error]"}' },
      { dir: 'OUT', action: 'Heartbeat', seq: '13354', ts: '20:13:20', type: 'req', payload: '{}' },
      { dir: 'IN', action: 'Heartbeat [Response]', seq: '13354', ts: '20:13:21', type: 'resp',
        payload: '{"currentTime":"2026-03-17T20:13:20.000Z"}' },
    ];
    setMessages(demoMsgs.map(m => ({ ...m, id: msgCounter++ })));
  }, []);

  const filtered = messages.filter(m => {
    if (filter === 'all') return true;
    if (filter === 'req') return m.type === 'req' && m.dir === 'OUT';
    if (filter === 'resp') return m.type === 'resp';
    if (filter === 'status') return m.action.includes('StatusNotification');
    if (filter === 'heartbeat') return m.action.includes('Heartbeat');
    return true;
  });

  const handleClear = () => {
    setMessages([]);
    addLog('OCPP messages cleared', 'yellow');
  };

  const handleExport = () => {
    const txt = messages.map(m => `[${m.ts}] ${m.dir} ${m.action} #${m.seq}\n${m.payload}`).join('\n\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocpp_trace_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`Exported ${messages.length} OCPP messages`, 'green');
  };

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">OCPP Berichten</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">OCPP 1.6 communicatie trace</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 text-xs h-8">
            <Trash2 className="h-3.5 w-3.5" />
            Wissen
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={messages.length === 0} className="gap-1.5 text-xs h-8">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="border-b border-border px-5 py-2">
        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Alle' },
            { id: 'req', label: 'Requests' },
            { id: 'resp', label: 'Responses' },
            { id: 'status', label: 'StatusNotification' },
            { id: 'heartbeat', label: 'Heartbeat' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                ${filter === f.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'}
              `}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[500px] overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 text-xs">Geen berichten</p>
        ) : (
          filtered.map(msg => (
            <div
              key={msg.id}
              className={`
                rounded-lg border p-3 font-mono text-[11px]
                ${msg.type === 'req' ? 'border-primary/20 border-l-2 border-l-primary' : ''}
                ${msg.type === 'resp' ? 'border-emerald-500/20 border-l-2 border-l-emerald-500' : ''}
                ${msg.type === 'err' ? 'border-destructive/20 border-l-2 border-l-destructive' : ''}
                bg-muted/20
              `}
            >
              <div className="flex items-center gap-3 mb-1.5">
                {msg.dir === 'OUT' ? (
                  <span className="text-primary flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" /> UIT
                  </span>
                ) : (
                  <span className="text-emerald-500 flex items-center gap-1">
                    <ArrowDown className="h-3 w-3" /> IN
                  </span>
                )}
                <span className="font-semibold text-foreground">{msg.action}</span>
                <span className="text-muted-foreground">#{msg.seq}</span>
                <span className="text-muted-foreground ml-auto">{msg.ts}</span>
              </div>
              <pre className="text-muted-foreground whitespace-pre-wrap break-all text-[10px]">
                {msg.payload}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ECCliteOcppMessages;
