import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wifi, WifiOff, Signal, Zap, AlertTriangle } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface ConnectorStatus {
  id: number;
  status: 'Available' | 'Faulted' | 'Charging' | 'Preparing' | 'SuspendedEV' | 'Finishing';
  errorCode: string;
  cpState: string;
  current: number;
  energy: number;
  profile: number;
}

interface Props {
  controller: ControllerState;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const ECCliteDashboard = ({ controller, addLog }: Props) => {
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([
    { id: 1, status: 'Available', errorCode: 'NoError', cpState: 'B1', current: 16, energy: 0, profile: 0 },
    { id: 2, status: 'Available', errorCode: 'NoError', cpState: 'B1', current: 16, energy: 0, profile: 0 },
  ]);
  const [gsmSignal, setGsmSignal] = useState(21);
  const [ipAddress, setIpAddress] = useState('10.109.129.193');
  const [events, setEvents] = useState<Array<{ time: string; msg: string; type: string }>>([]);
  const [tick, setTick] = useState(0);

  // Refresh timer for elapsed display
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = () => {
    addLog('Dashboard data refreshed', 'blue');
    setGsmSignal(15 + Math.floor(Math.random() * 15));
    setEvents(prev => [
      { time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), msg: 'Dashboard vernieuwd', type: 'info' },
      ...prev,
    ].slice(0, 20));
  };

  const signalBars = gsmSignal > 25 ? 5 : gsmSignal > 18 ? 4 : gsmSignal > 12 ? 3 : gsmSignal > 6 ? 2 : 1;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Available': return <Badge className="bg-emerald-600/80 text-white text-[10px] tracking-wider">● BESCHIKBAAR</Badge>;
      case 'Faulted': return <Badge variant="destructive" className="text-[10px] tracking-wider">✕ FOUT</Badge>;
      case 'Charging': return <Badge className="bg-primary text-primary-foreground text-[10px] tracking-wider">⚡ LADEN</Badge>;
      case 'Preparing': return <Badge className="bg-yellow-600/80 text-white text-[10px] tracking-wider">◎ VOORBEREIDING</Badge>;
      default: return <Badge variant="secondary" className="text-[10px] tracking-wider">{status}</Badge>;
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Live Dashboard</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Realtime status van beide laadpunten</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5 text-xs h-8">
          <RefreshCw className="h-3.5 w-3.5" />
          Vernieuwen
        </Button>
      </div>

      <div className="p-5 space-y-5">
        {/* System status cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider mb-2">OCPP STATUS</p>
            {controller.connected ? (
              <Badge className="bg-emerald-600/80 text-white text-[10px] gap-1.5">
                <Wifi className="h-3 w-3" /> VERBONDEN
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] gap-1.5">
                <WifiOff className="h-3 w-3" /> OFFLINE
              </Badge>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider mb-2">GSM SIGNAAL</p>
            <div className="flex items-center gap-2">
              <div className="flex items-end gap-[2px] h-4">
                {[4, 7, 10, 13, 16].map((h, i) => (
                  <div
                    key={i}
                    className={`w-[5px] rounded-sm transition-colors ${i < signalBars ? 'bg-emerald-500' : 'bg-border'}`}
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
              <span className="font-mono text-sm text-foreground">{gsmSignal} dBm</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider mb-2">IP ADRES</p>
            <span className="font-mono text-sm text-foreground">{ipAddress}</span>
          </div>
        </div>

        {/* Connector cards */}
        <div className="grid grid-cols-2 gap-4">
          {connectors.map(c => (
            <div
              key={c.id}
              className={`
                relative rounded-lg border bg-muted/20 p-5 overflow-hidden
                ${c.status === 'Available' ? 'border-emerald-500/30' : ''}
                ${c.status === 'Faulted' ? 'border-destructive/30' : ''}
                ${c.status === 'Charging' ? 'border-primary/30' : ''}
                ${c.status === 'Preparing' ? 'border-yellow-500/30' : ''}
                ${!['Available', 'Faulted', 'Charging', 'Preparing'].includes(c.status) ? 'border-border' : ''}
              `}
            >
              {/* Top accent bar */}
              <div className={`
                absolute top-0 left-0 right-0 h-[2px]
                ${c.status === 'Available' ? 'bg-emerald-500' : ''}
                ${c.status === 'Faulted' ? 'bg-destructive' : ''}
                ${c.status === 'Charging' ? 'bg-primary' : ''}
                ${c.status === 'Preparing' ? 'bg-yellow-500' : ''}
                ${!['Available', 'Faulted', 'Charging', 'Preparing'].includes(c.status) ? 'bg-border' : ''}
              `} />

              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground tracking-wider">LAADPUNT</p>
                  <p className="text-lg font-semibold text-foreground">Connector {c.id}</p>
                </div>
                {statusBadge(c.status)}
              </div>

              <div className="space-y-2">
                {[
                  { label: 'CP Status', value: c.cpState },
                  { label: 'Stroom Limiet', value: `${c.current} A` },
                  { label: 'Energie', value: `${c.energy.toFixed(2)} kWh` },
                  { label: 'OCPP Status', value: `${c.status}${c.errorCode !== 'NoError' ? ` (${c.errorCode})` : ''}` },
                  { label: 'Fase Rotatie', value: 'L1-L2-L3' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-1 border-b border-border/30 last:border-0">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="text-xs font-mono text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Large background number */}
              <span className="absolute right-4 bottom-3 text-5xl font-black text-foreground/5 select-none">{c.id}</span>
            </div>
          ))}
        </div>

        {/* Events log */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            Recente Events
          </h3>
          <div className="max-h-[200px] overflow-y-auto space-y-0.5 font-mono text-[11px]">
            {events.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Geen events — verbind met laadpaal.</p>
            ) : (
              events.map((e, i) => (
                <div key={i} className="flex gap-3 py-0.5">
                  <span className="text-muted-foreground shrink-0">{e.time}</span>
                  <span className={`
                    ${e.type === 'ok' ? 'text-emerald-400' : ''}
                    ${e.type === 'error' ? 'text-destructive' : ''}
                    ${e.type === 'warn' ? 'text-yellow-500' : ''}
                    ${e.type === 'info' ? 'text-muted-foreground' : ''}
                  `}>
                    {e.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ECCliteDashboard;
