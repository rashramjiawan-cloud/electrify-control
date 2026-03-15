import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Usb, UsbIcon, Send, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  setController: React.Dispatch<React.SetStateAction<ControllerState>>;
  updateConfig: (key: string, value: string) => void;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800];

const ECCliteSerial = ({ controller, setController, updateConfig, addLog }: Props) => {
  const [supported, setSupported] = useState(false);
  const [connected, setConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [autoScroll, setAutoScroll] = useState(true);
  const [rawCommand, setRawCommand] = useState('');
  const [sending, setSending] = useState(false);

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const lineBufferRef = useRef('');
  const readLoopRunningRef = useRef(false);

  useEffect(() => {
    setSupported('serial' in navigator);
  }, []);

  const readLoop = useCallback(async () => {
    if (readLoopRunningRef.current) return;
    readLoopRunningRef.current = true;
    const reader = readerRef.current;
    if (!reader) return;

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        const text = decoder.decode(value, { stream: true });
        lineBufferRef.current += text;

        // Process complete lines
        const lines = lineBufferRef.current.split('\n');
        lineBufferRef.current = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.replace(/\r$/, '').trim();
          if (!trimmed) continue;

          // Color-code based on content
          let color: ECCliteLogEntry['color'] = 'blue';
          if (trimmed.includes('ERROR') || trimmed.includes('FAIL') || trimmed.includes('error')) {
            color = 'red';
          } else if (trimmed.includes('OK') || trimmed.includes('Accepted') || trimmed.includes('success')) {
            color = 'green';
          } else if (trimmed.includes('WARN') || trimmed.includes('warn') || trimmed.includes('TIMEOUT')) {
            color = 'yellow';
          }

          addLog(`[TTL] ${trimmed}`, color);

          // Try to parse JSON responses for config updates
          tryParseConfigResponse(trimmed);
        }
      }
    } catch (err) {
      if ((err as Error).message !== 'The device has been lost.') {
        addLog(`[TTL] Read error: ${(err as Error).message}`, 'red');
      }
    } finally {
      readLoopRunningRef.current = false;
    }
  }, [addLog]);

  const tryParseConfigResponse = useCallback((line: string) => {
    try {
      const data = JSON.parse(line);
      if (data.configurationKey && Array.isArray(data.configurationKey)) {
        for (const item of data.configurationKey) {
          if (item.key && item.value !== undefined) {
            updateConfig(item.key, String(item.value));
          }
        }
        addLog(`[TTL] Parsed ${data.configurationKey.length} config keys from response`, 'green');
      }
      if (data.status) {
        addLog(`[TTL] Response status: ${data.status}`, data.status === 'Accepted' ? 'green' : 'yellow');
      }
    } catch {
      // Not JSON, that's fine
    }
  }, [updateConfig, addLog]);

  const handleConnect = async () => {
    if (connected) {
      await handleDisconnect();
      return;
    }

    if (!('serial' in navigator)) {
      addLog('[TTL] Web Serial API not supported in this browser', 'red');
      return;
    }

    try {
      addLog(`[TTL] Requesting serial port...`, 'blue');
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });

      portRef.current = port;
      addLog(`[TTL] Port opened at ${baudRate} baud`, 'green');

      // Set up reader
      if (port.readable) {
        readerRef.current = port.readable.getReader();
        readLoop();
      }

      // Set up writer
      if (port.writable) {
        writerRef.current = port.writable.getWriter();
      }

      setConnected(true);
      setController(prev => ({ ...prev, connected: true }));
      addLog(`[TTL] USB-TTL verbinding actief — klaar om te communiceren`, 'green');

      // Listen for disconnect
      port.addEventListener('disconnect', () => {
        addLog('[TTL] Device disconnected', 'red');
        cleanup();
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('No port selected')) {
        addLog('[TTL] Geen poort geselecteerd', 'yellow');
      } else {
        addLog(`[TTL] Verbinding mislukt: ${msg}`, 'red');
      }
    }
  };

  const cleanup = useCallback(() => {
    setConnected(false);
    portRef.current = null;
    readerRef.current = null;
    writerRef.current = null;
  }, []);

  const handleDisconnect = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
        readerRef.current = null;
      }
      if (writerRef.current) {
        await writerRef.current.close();
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (err) {
      addLog(`[TTL] Disconnect error: ${(err as Error).message}`, 'yellow');
    }
    setConnected(false);
    setController(prev => ({ ...prev, connected: false }));
    addLog('[TTL] Verbinding gesloten', 'yellow');
  };

  const sendRaw = async (data: string) => {
    const writer = writerRef.current;
    if (!writer) {
      addLog('[TTL] Geen writer beschikbaar', 'red');
      return;
    }

    try {
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(data + '\r\n'));
      addLog(`[TTL] TX: ${data}`, 'blue');
    } catch (err) {
      addLog(`[TTL] Send error: ${(err as Error).message}`, 'red');
    }
  };

  const sendJsonCommand = async (action: string, payload: Record<string, unknown>) => {
    const cmd = JSON.stringify([2, String(Date.now()), action, payload]);
    await sendRaw(cmd);
  };

  const handleSendRawCommand = async () => {
    if (!rawCommand.trim()) return;
    await sendRaw(rawCommand.trim());
    setRawCommand('');
  };

  const handleGetConfiguration = async () => {
    setSending(true);
    addLog('[TTL] Requesting full configuration from controller...', 'blue');
    await sendJsonCommand('GetConfiguration', {});
    setSending(false);
  };

  const handleSendProductionConfig = async () => {
    setSending(true);
    addLog('[TTL] Loading production.json profile...', 'blue');

    try {
      const resp = await fetch('/ecclite/production.json');
      const data = await resp.json();

      if (data.configurationKey && Array.isArray(data.configurationKey)) {
        for (const item of data.configurationKey) {
          addLog(`[TTL] Setting ${item.key} = ${item.value}`, 'blue');
          await sendJsonCommand('ChangeConfiguration', { key: item.key, value: item.value });
          updateConfig(item.key, String(item.value));
          await new Promise(r => setTimeout(r, 150));
        }
        addLog(`[TTL] Production config: ${data.configurationKey.length} keys sent`, 'green');
      }
    } catch (err) {
      addLog(`[TTL] Failed to load production.json: ${(err as Error).message}`, 'red');
    }

    setSending(false);
  };

  const handleResetController = async () => {
    addLog('[TTL] Sending Reset command (Soft)...', 'yellow');
    await sendJsonCommand('Reset', { type: 'Soft' });
  };

  if (!supported) {
    return (
      <div className="rounded-xl border border-border bg-card mt-4">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">USB-TTL Seriële Verbinding</h2>
        </div>
        <div className="p-5">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Web Serial API niet beschikbaar</p>
              <p className="text-xs text-muted-foreground">
                Je browser ondersteunt geen Web Serial API. Gebruik <strong>Google Chrome</strong> of <strong>Microsoft Edge</strong> (versie 89+) om een fysieke TTL-kabel te verbinden.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">USB-TTL Seriële Verbinding</h2>
        <Badge variant={connected ? 'default' : 'secondary'} className="gap-1.5">
          {connected ? <CheckCircle2 className="h-3 w-3" /> : <Usb className="h-3 w-3" />}
          {connected ? 'Verbonden' : 'Niet verbonden'}
        </Badge>
      </div>
      <div className="p-5 space-y-5">
        {/* Info banner */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <UsbIcon className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">Fysieke verbinding via USB-TTL kabel</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Sluit een USB-TTL adapter (FTDI / CP2102 / CH340) aan op de TTL-poort van de Ecotap controller.
            De browser communiceert direct via de Web Serial API met de controller — geen extra software nodig.
          </p>
        </div>

        {/* Connection settings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Baudrate</Label>
            <Select value={String(baudRate)} onValueChange={v => setBaudRate(Number(v))} disabled={connected}>
              <SelectTrigger className="font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map(rate => (
                  <SelectItem key={rate} value={String(rate)}>{rate.toLocaleString()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <div className="flex items-center gap-2">
              <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
              <Label className="text-xs text-muted-foreground cursor-pointer">Auto-scroll log</Label>
            </div>
          </div>
        </div>

        {/* Connect button */}
        <Button
          onClick={handleConnect}
          className="w-full gap-2 h-11"
          variant={connected ? 'destructive' : 'default'}
        >
          <Usb className="h-4 w-4" />
          {connected ? 'Verbinding verbreken' : 'Verbinden met USB-TTL poort'}
        </Button>

        {connected && (
          <>
            {/* Quick actions */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Snelcommando's</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={handleGetConfiguration} disabled={sending} className="gap-1.5 text-xs h-9">
                  <Download className="h-3.5 w-3.5" />
                  Configuratie ophalen
                </Button>
                <Button variant="outline" size="sm" onClick={handleSendProductionConfig} disabled={sending} className="gap-1.5 text-xs h-9">
                  <Upload className="h-3.5 w-3.5" />
                  Production config laden
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetController} disabled={sending} className="gap-1.5 text-xs h-9 text-yellow-600 hover:text-yellow-700">
                  Soft Reset
                </Button>
                <Button variant="outline" size="sm" onClick={() => sendRaw('AT')} disabled={sending} className="gap-1.5 text-xs h-9">
                  AT Ping
                </Button>
              </div>
            </div>

            {/* Raw command input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Handmatig commando</Label>
              <div className="flex gap-2">
                <Input
                  value={rawCommand}
                  onChange={e => setRawCommand(e.target.value)}
                  placeholder='bijv. {"key":"com_OCPPID"} of AT+INFO'
                  className="font-mono text-xs flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleSendRawCommand()}
                />
                <Button size="sm" onClick={handleSendRawCommand} disabled={!rawCommand.trim()} className="gap-1.5 h-9">
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
            </div>

            {/* Controller info if available */}
            <div className="rounded-lg bg-muted/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Verbindingsstatus</h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <span className="text-muted-foreground">Baudrate:</span>
                <span className="text-foreground">{baudRate.toLocaleString()}</span>
                <span className="text-muted-foreground">Status:</span>
                <span className="text-emerald-500">Actief</span>
                <span className="text-muted-foreground">Protocol:</span>
                <span className="text-foreground">JSON over Serial (ECClite)</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ECCliteSerial;
