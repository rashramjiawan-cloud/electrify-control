import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Activity, Download, Play, Square, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';
import type { ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

interface SnifferPacket {
  id: number;
  time: string;
  timeMs: number;
  direction: 'A→B' | 'B→A';
  raw: Uint8Array;
  ascii: string;
  hex: string;
  port: 'A' | 'B';
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800];

let packetCounter = 0;

function toHex(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function toAscii(data: Uint8Array): string {
  return Array.from(data).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
}

function parseFrame(data: Uint8Array): string | null {
  if (data.length < 12) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const uid = view.getUint32(0, true);
  const cmd = view.getUint16(4, true);
  const seq = view.getUint16(6, true);
  const len = view.getUint16(8, true);
  const total = view.getUint16(10, true);

  const cmdNames: Record<number, string> = {
    31: 'JSON_COMMAND_REQ',
    100: 'GETVERSION_REQ',
    101: 'LOGOUT_REQ',
    131: 'JSON_COMMAND_RESP',
    200: 'GETVERSION_RESP',
    201: 'LOGOUT_RESP',
  };

  return `uid=${uid} cmd=${cmdNames[cmd] || cmd}(${cmd}) seq=${seq} len=${len} total=${total}`;
}

const ECCliteSniffer = ({ addLog }: Props) => {
  const [baudRate, setBaudRate] = useState('115200');
  const [sniffing, setSniffing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showAscii, setShowAscii] = useState(true);
  const [showDecoded, setShowDecoded] = useState(true);
  const [packets, setPackets] = useState<SnifferPacket[]>([]);
  const [portALabel, setPortALabel] = useState('ECCManager');
  const [portBLabel, setPortBLabel] = useState('Controller');
  const [portAStatus, setPortAStatus] = useState<'disconnected' | 'connected'>('disconnected');
  const [portBStatus, setPortBStatus] = useState<'disconnected' | 'connected'>('disconnected');

  const portARef = useRef<SerialPort | null>(null);
  const portBRef = useRef<SerialPort | null>(null);
  const readerARef = useRef<ReadableStreamDefaultReader | null>(null);
  const readerBRef = useRef<ReadableStreamDefaultReader | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const addPacket = useCallback((direction: 'A→B' | 'B→A', data: Uint8Array, port: 'A' | 'B') => {
    const now = new Date();
    const pkt: SnifferPacket = {
      id: packetCounter++,
      time: now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any),
      timeMs: now.getTime(),
      direction,
      raw: data,
      ascii: toAscii(data),
      hex: toHex(data),
      port,
    };
    setPackets(prev => [...prev, pkt].slice(-500));
  }, []);

  const readPort = useCallback(async (reader: ReadableStreamDefaultReader, direction: 'A→B' | 'B→A', port: 'A' | 'B') => {
    try {
      while (!abortRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          addPacket(direction, value, port);
        }
      }
    } catch (err: any) {
      if (!abortRef.current) {
        addLog(`[SNIFFER] Port ${port} read error: ${err.message}`, 'red');
      }
    }
  }, [addPacket, addLog]);

  const startSniffing = async () => {
    if (!('serial' in navigator)) {
      addLog('[SNIFFER] Web Serial API niet beschikbaar – gebruik Chrome/Edge', 'red');
      return;
    }

    try {
      addLog('[SNIFFER] Selecteer poort A (ECCManager kant)...', 'blue');
      const portA = await (navigator as any).serial.requestPort();
      await portA.open({ baudRate: parseInt(baudRate) });
      portARef.current = portA;
      setPortAStatus('connected');
      addLog(`[SNIFFER] Poort A verbonden @ ${baudRate} baud`, 'green');

      addLog('[SNIFFER] Selecteer poort B (Controller kant)...', 'blue');
      const portB = await (navigator as any).serial.requestPort();
      await portB.open({ baudRate: parseInt(baudRate) });
      portBRef.current = portB;
      setPortBStatus('connected');
      addLog(`[SNIFFER] Poort B verbonden @ ${baudRate} baud`, 'green');

      abortRef.current = false;
      setSniffing(true);

      readerARef.current = portA.readable.getReader();
      readerBRef.current = portB.readable.getReader();

      addLog('[SNIFFER] Dual-port capture gestart – luisteren op beide poorten', 'green');

      // Read both ports in parallel
      readPort(readerARef.current!, 'A→B', 'A');
      readPort(readerBRef.current!, 'B→A', 'B');

    } catch (err: any) {
      addLog(`[SNIFFER] Start mislukt: ${err.message}`, 'red');
      await stopSniffing();
    }
  };

  const stopSniffing = async () => {
    abortRef.current = true;
    setSniffing(false);

    try { await readerARef.current?.cancel(); } catch {}
    try { await readerBRef.current?.cancel(); } catch {}
    try { await portARef.current?.close(); } catch {}
    try { await portBRef.current?.close(); } catch {}

    readerARef.current = null;
    readerBRef.current = null;
    portARef.current = null;
    portBRef.current = null;
    setPortAStatus('disconnected');
    setPortBStatus('disconnected');

    addLog('[SNIFFER] Capture gestopt', 'yellow');
  };

  const exportCapture = () => {
    if (packets.length === 0) return;

    let output = `ECClite USB Sniffer Capture\n`;
    output += `Date: ${new Date().toISOString()}\n`;
    output += `Baud: ${baudRate}\n`;
    output += `Packets: ${packets.length}\n`;
    output += `${'='.repeat(100)}\n\n`;

    for (const pkt of packets) {
      output += `[${pkt.time}] ${pkt.direction} (${pkt.port === 'A' ? portALabel : portBLabel})\n`;
      output += `  HEX: ${pkt.hex}\n`;
      output += `  ASC: ${pkt.ascii}\n`;
      const decoded = parseFrame(pkt.raw);
      if (decoded) output += `  DEC: ${decoded}\n`;
      output += '\n';
    }

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecclite-sniffer-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`[SNIFFER] Exported ${packets.length} packets`, 'green');
  };

  // Auto-scroll effect
  if (autoScroll && scrollRef.current) {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card mt-4 space-y-0">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">USB Sniffer (Dual-Port)</h2>
          <Badge variant={sniffing ? 'default' : 'outline'} className="text-[10px]">
            {sniffing ? 'CAPTURING' : 'IDLE'}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Man-in-the-middle capture via com0com virtuele poorten. Selecteer twee COM-poorten om verkeer te loggen.
        </p>
      </div>

      {/* Setup */}
      <div className="border-b border-border px-5 py-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Baud rate</Label>
            <Select value={baudRate} onValueChange={setBaudRate} disabled={sniffing}>
              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map(r => (
                  <SelectItem key={r} value={String(r)} className="text-xs font-mono">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Poort A label</Label>
            <Input value={portALabel} onChange={e => setPortALabel(e.target.value)} className="h-8 text-xs" disabled={sniffing} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Poort B label</Label>
            <Input value={portBLabel} onChange={e => setPortBLabel(e.target.value)} className="h-8 text-xs" disabled={sniffing} />
          </div>
          <div className="flex items-end gap-2">
            <Badge variant={portAStatus === 'connected' ? 'default' : 'secondary'} className="text-[10px] h-6">
              A: {portAStatus}
            </Badge>
            <Badge variant={portBStatus === 'connected' ? 'default' : 'secondary'} className="text-[10px] h-6">
              B: {portBStatus}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {!sniffing ? (
            <Button size="sm" onClick={startSniffing} className="gap-1.5 text-xs h-8">
              <Play className="h-3.5 w-3.5" />
              Start capture
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={stopSniffing} className="gap-1.5 text-xs h-8">
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCapture} disabled={packets.length === 0} className="gap-1.5 text-xs h-8">
            <Download className="h-3.5 w-3.5" />
            Export ({packets.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPackets([])} className="gap-1.5 text-xs h-8">
            <Trash2 className="h-3.5 w-3.5" />
            Wissen
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <div className="flex items-center gap-1.5">
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} className="scale-75" />
            <span className="text-[11px] text-muted-foreground">Auto-scroll</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch checked={showAscii} onCheckedChange={setShowAscii} className="scale-75" />
            <span className="text-[11px] text-muted-foreground">ASCII</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch checked={showDecoded} onCheckedChange={setShowDecoded} className="scale-75" />
            <span className="text-[11px] text-muted-foreground">Decode</span>
          </div>
        </div>
      </div>

      {/* com0com setup instructions */}
      {!sniffing && packets.length === 0 && (
        <div className="px-5 py-4 bg-muted/30 border-b border-border">
          <h3 className="text-xs font-semibold text-foreground mb-2">Setup: com0com virtuele poort-paar</h3>
          <div className="text-[11px] text-muted-foreground space-y-1 font-mono">
            <p>1. Installeer <span className="text-primary">com0com</span> (gratis, open-source)</p>
            <p>2. Maak een virtueel poort-paar: <span className="text-primary">COM10 ↔ COM11</span></p>
            <p>3. Configureer <span className="text-primary">hub4com</span> om verkeer te splitsen:</p>
            <div className="bg-background rounded p-2 mt-1 border border-border">
              <p className="text-foreground">hub4com --baud={baudRate} \\</p>
              <p className="text-foreground pl-4">--route=0:1,2 --route=1:0 --route=2:All \\</p>
              <p className="text-foreground pl-4">\\.\COM3 \\.\COM10 \\.\COM11</p>
            </div>
            <p className="mt-2">4. ECCManager → <span className="text-primary">COM10</span></p>
            <p>5. Sniffer Poort A → <span className="text-primary">COM11</span> (ziet ECCManager verkeer)</p>
            <p>6. Sniffer Poort B → <span className="text-primary">COM3</span> (ziet Controller verkeer)</p>
          </div>
        </div>
      )}

      {/* Packet list */}
      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto bg-[#1a1a2e]">
        {packets.length === 0 && sniffing && (
          <p className="text-gray-500 text-center py-8 text-xs font-mono">Wachten op data...</p>
        )}
        {packets.map(pkt => {
          const isA = pkt.direction === 'A→B';
          const decoded = showDecoded ? parseFrame(pkt.raw) : null;
          return (
            <div
              key={pkt.id}
              className={`
                px-3 py-1.5 border-b border-white/5 font-mono text-[11px]
                ${isA ? 'bg-blue-950/30' : 'bg-green-950/30'}
              `}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-600 shrink-0">{pkt.time}</span>
                {isA ? (
                  <span className="text-blue-400 shrink-0 flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" />
                    {portALabel}→{portBLabel}
                  </span>
                ) : (
                  <span className="text-green-400 shrink-0 flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" />
                    {portBLabel}→{portALabel}
                  </span>
                )}
                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 border-white/20 text-gray-400">
                  {pkt.raw.length}B
                </Badge>
              </div>
              <div className={`mt-0.5 break-all ${isA ? 'text-blue-300' : 'text-green-300'}`}>
                {pkt.hex}
              </div>
              {showAscii && (
                <div className="text-gray-500 break-all">
                  {pkt.ascii}
                </div>
              )}
              {decoded && (
                <div className="text-yellow-400/80 text-[10px]">
                  ⤷ {decoded}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ECCliteSniffer;
