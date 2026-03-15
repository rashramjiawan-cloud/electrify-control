import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Usb, Send, Download, Upload, AlertTriangle, CheckCircle2, RotateCcw, FileCode } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  setController: React.Dispatch<React.SetStateAction<ControllerState>>;
  updateConfig: (key: string, value: string) => void;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800];

/* ── ECClite Binary Frame Protocol ──────────────────────────────
 * From goodsession.log analysis:
 *
 * Commands use a binary frame with structure:
 *   Header (12 bytes) + payload
 *   uid[0] cmd[ID] seq[N] len[N]
 *
 * Command IDs:
 *   100 = cmd_GETVERSION_REQ  (get firmware/hw version)
 *   101 = cmd_LOGOUT_REQ      (end session)
 *   31  = JSON_COMMAND_REQ    (OCPP-style JSON commands)
 *
 * JSON_COMMAND_REQ payload format:
 *   0x13 + "ActionName" + "ActionName" + JSON payload
 *   e.g.: 0x13 + "ChangeConfiguration" + "ChangeConfiguration" + '{"key":"com_ProtCh","value":"GSM"}'
 *
 * Response: JSON text on serial, e.g. {"status":"Accepted"}
 * After all config writes: SV CFG():CHECKSUM
 * ──────────────────────────────────────────────────────────────── */

const CMD_GETVERSION_REQ = 100;
const CMD_LOGOUT_REQ = 101;
const CMD_JSON_COMMAND_REQ = 31;

let seqCounter = 0;

/** Build a binary frame for the ECClite serial protocol */
function buildFrame(cmd: number, payload: Uint8Array): Uint8Array {
  const uid = 0;
  seqCounter += 1;
  const seq = seqCounter;
  const len = payload.length;
  const totalBytes = 12 + len;

  // Header: 4-byte uid, 2-byte cmd, 2-byte seq, 2-byte len, 2-byte totalBytes
  const frame = new Uint8Array(totalBytes);
  const view = new DataView(frame.buffer);

  view.setUint32(0, uid, true);      // uid LE
  view.setUint16(4, cmd, true);       // cmd LE
  view.setUint16(6, seq, true);       // seq LE
  view.setUint16(8, len, true);       // payload len LE
  view.setUint16(10, totalBytes, true); // total bytes LE

  frame.set(payload, 12);
  return frame;
}

/** Build a JSON_COMMAND_REQ payload: 0x13 + action + action + json */
function buildJsonCommandPayload(action: string, jsonPayload: string): Uint8Array {
  const encoder = new TextEncoder();
  const actionBytes = encoder.encode(action);
  const jsonBytes = encoder.encode(jsonPayload);

  // Format: 0x13 + action + action + json
  const total = 1 + actionBytes.length + actionBytes.length + jsonBytes.length;
  const buf = new Uint8Array(total);
  let offset = 0;

  buf[offset++] = 0x13;
  buf.set(actionBytes, offset); offset += actionBytes.length;
  buf.set(actionBytes, offset); offset += actionBytes.length;
  buf.set(jsonBytes, offset);

  return buf;
}

function toHexDump(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

const ECCliteSerial = ({ controller, setController, updateConfig, addLog }: Props) => {
  const [supported, setSupported] = useState(false);
  const [connected, setConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [autoScroll, setAutoScroll] = useState(true);
  const [rawCommand, setRawCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [hwVersion, setHwVersion] = useState('');
  const [configCount, setConfigCount] = useState(0);

  const portRef = useRef<any>(null);
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

        const lines = lineBufferRef.current.split('\n');
        lineBufferRef.current = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.replace(/\r$/, '').trim();
          if (!trimmed) continue;

          // Color-code based on real ECClite log patterns
          let color: ECCliteLogEntry['color'] = 'blue';
          if (trimmed.includes('ERROR') || trimmed.includes('FAIL') || trimmed.includes('error') || trimmed.includes('FAULTED')) {
            color = 'red';
          } else if (trimmed.includes('OK') || trimmed.includes('Accepted') || trimmed.includes('success') || trimmed.includes('Done')) {
            color = 'green';
          } else if (trimmed.includes('WARN') || trimmed.includes('TIMEOUT') || trimmed.includes('RETRY') || trimmed.includes('RCD')) {
            color = 'yellow';
          } else if (trimmed.startsWith('HW') || trimmed.includes('BOOT') || trimmed.includes('Version')) {
            color = 'green';
          }

          addLog(`[TTL] ${trimmed}`, color);

          // Parse specific responses
          parseSerialResponse(trimmed);
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

  const parseSerialResponse = useCallback((line: string) => {
    // Detect hardware/firmware version: "EVCHARGER BOOTLOADER 04HW20 HWTYPE:20"
    if (line.includes('BOOTLOADER') || line.match(/HW\d+FW\d+R\d+/)) {
      const hwMatch = line.match(/HW(\d+)FW(\d+)R(\d+)/);
      if (hwMatch) {
        const ver = `V${hwMatch[2]}R${hwMatch[3]}`;
        setHwVersion(`HW${hwMatch[1]} ${ver}`);
        setController(prev => ({ ...prev, firmwareVersion: ver }));
      }
    }

    // Detect OCPP ID: "OCPP ID [NL*ECO*1000]" or "APP INIT RCU40 ID: 11735675"
    const ocppIdMatch = line.match(/OCPP ID \[([^\]]+)\]/);
    if (ocppIdMatch) {
      setController(prev => ({ ...prev, ocppId: ocppIdMatch[1] }));
    }

    const snMatch = line.match(/Chargepoint serial \[([^\]]+)\]/);
    if (snMatch) {
      setController(prev => ({ ...prev, serialNumber: snMatch[1] }));
    }

    const modelMatch = line.match(/Model Name \[([^\]]+)\]/);
    if (modelMatch) {
      setController(prev => ({ ...prev, model: modelMatch[1] }));
    }

    // Parse JSON responses
    try {
      const data = JSON.parse(line);
      if (data.configurationKey && Array.isArray(data.configurationKey)) {
        for (const item of data.configurationKey) {
          if (item.key && item.value !== undefined) {
            updateConfig(item.key, String(item.value));
          }
        }
        addLog(`[TTL] Parsed ${data.configurationKey.length} config keys`, 'green');
      }
    } catch {
      // Not JSON
    }
  }, [updateConfig, addLog, setController]);

  const handleConnect = async () => {
    if (connected) {
      await handleDisconnect();
      return;
    }

    if (!('serial' in navigator)) {
      addLog('[TTL] Web Serial API not supported', 'red');
      return;
    }

    try {
      addLog(`[TTL] Requesting serial port...`, 'blue');
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });

      portRef.current = port;
      addLog(`[TTL] Port opened at ${baudRate} baud`, 'green');

      if (port.readable) {
        readerRef.current = port.readable.getReader();
        readLoop();
      }

      if (port.writable) {
        writerRef.current = port.writable.getWriter();
      }

      setConnected(true);
      setController(prev => ({ ...prev, connected: true }));
      addLog(`[TTL] USB-TTL verbinding actief`, 'green');

      port.addEventListener('disconnect', () => {
        addLog('[TTL] Device disconnected', 'red');
        cleanup();
      });

      // Auto-request version on connect
      setTimeout(() => sendGetVersion(), 500);
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
      // Send logout first
      await sendLogout();

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

  /** Send raw bytes to the serial port */
  const sendBytes = async (data: Uint8Array) => {
    const writer = writerRef.current;
    if (!writer) {
      addLog('[TTL] Geen writer beschikbaar', 'red');
      return;
    }
    await writer.write(data);
  };

  /** Send a text string (legacy / debug) */
  const sendText = async (text: string) => {
    const encoder = new TextEncoder();
    await sendBytes(encoder.encode(text + '\r\n'));
    addLog(`[TTL] TX: ${text}`, 'blue');
  };

  /** cmd_GETVERSION_REQ[100] — get hardware/firmware version */
  const sendGetVersion = async () => {
    const frame = buildFrame(CMD_GETVERSION_REQ, new Uint8Array(0));
    addLog(`[TTL] Snd uid[0] cmd[cmd_GETVERSION_REQ[${CMD_GETVERSION_REQ}]]seq[${seqCounter}]len[0]`, 'blue');
    addLog(`[TTL] TX HEX: ${toHexDump(frame)}`, 'blue');
    await sendBytes(frame);
  };

  /** cmd_LOGOUT_REQ[101] — end communication session */
  const sendLogout = async () => {
    const frame = buildFrame(CMD_LOGOUT_REQ, new Uint8Array(0));
    addLog(`[TTL] Snd uid[0] cmd[cmd_LOGOUT_REQ[${CMD_LOGOUT_REQ}]]seq[${seqCounter}]len[0]`, 'blue');
    await sendBytes(frame);
  };

  /** JSON_COMMAND_REQ[31] — send an OCPP-style JSON command */
  const sendJsonCommand = async (action: string, payload: Record<string, unknown>) => {
    const jsonStr = JSON.stringify(payload);
    const cmdPayload = buildJsonCommandPayload(action, jsonStr);
    const frame = buildFrame(CMD_JSON_COMMAND_REQ, cmdPayload);

    addLog(`[TTL] ${action}${jsonStr}`, 'blue');
    addLog(`[TTL] Snd uid[0] cmd[JSON_COMMAND_REQ[${CMD_JSON_COMMAND_REQ}]]seq[${seqCounter}]len[${cmdPayload.length}]tobytes[${frame.length}]`, 'blue');
    addLog(`[TTL] Data[${toHexDump(cmdPayload)}]`, 'blue');

    await sendBytes(frame);
  };

  const handleSendRawCommand = async () => {
    if (!rawCommand.trim()) return;
    await sendText(rawCommand.trim());
    setRawCommand('');
  };

  /** Get full configuration from controller via GetConfiguration */
  const handleGetConfiguration = async () => {
    setSending(true);
    addLog('[TTL] Requesting configuration (GetConfiguration)...', 'blue');
    await sendJsonCommand('GetConfiguration', {});
    setSending(false);
  };

  /** Send production.json config items one by one */
  const handleSendProductionConfig = async () => {
    setSending(true);
    addLog('[TTL] Loading production.json profile...', 'blue');

    try {
      const resp = await fetch('/ecclite/production.json');
      const data = await resp.json();

      if (data.configurationKey && Array.isArray(data.configurationKey)) {
        let count = 0;
        for (const item of data.configurationKey) {
          await sendJsonCommand('ChangeConfiguration', { key: item.key, value: item.value });
          updateConfig(item.key, String(item.value));
          count++;
          setConfigCount(count);
          // Wait for controller to process (as seen in the log: sequential sends)
          await new Promise(r => setTimeout(r, 200));
        }
        addLog(`[TTL] Send ${count} Cfg Items OK`, 'green');
      }
    } catch (err) {
      addLog(`[TTL] Failed to load production.json: ${(err as Error).message}`, 'red');
    }

    setSending(false);
  };

  /** Send a soft reset command */
  const handleResetController = async () => {
    addLog('[TTL] Sending Reset command (Soft)...', 'yellow');
    await sendJsonCommand('Reset', { type: 'Soft' });
  };

  /** Save configuration on controller (triggers SV CFG():checksum) */
  const handleSaveConfig = async () => {
    addLog('[TTL] Requesting config save to FLASH...', 'blue');
    await sendJsonCommand('SaveConfiguration', {});
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
                Gebruik <strong>Google Chrome</strong> of <strong>Microsoft Edge</strong> (v89+) om een fysieke TTL-kabel te verbinden.
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
            <Usb className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">ECClite Protocol via USB-TTL kabel</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Communiceert via het echte ECClite binaire protocol: cmd_GETVERSION_REQ, JSON_COMMAND_REQ, cmd_LOGOUT_REQ.
            Sluit een USB-TTL adapter (FTDI / CP2102 / CH340) aan op de controller TTL-poort.
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
          {connected ? 'Verbinding verbreken (Logout)' : 'Verbinden met USB-TTL poort'}
        </Button>

        {connected && (
          <>
            {/* Protocol commands */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">ECClite Commando's</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={sendGetVersion} disabled={sending} className="gap-1.5 text-xs h-9">
                  <FileCode className="h-3.5 w-3.5" />
                  Versie ophalen
                </Button>
                <Button variant="outline" size="sm" onClick={handleGetConfiguration} disabled={sending} className="gap-1.5 text-xs h-9">
                  <Download className="h-3.5 w-3.5" />
                  Configuratie ophalen
                </Button>
                <Button variant="outline" size="sm" onClick={handleSendProductionConfig} disabled={sending} className="gap-1.5 text-xs h-9">
                  <Upload className="h-3.5 w-3.5" />
                  Production config laden
                </Button>
                <Button variant="outline" size="sm" onClick={handleSaveConfig} disabled={sending} className="gap-1.5 text-xs h-9">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Config opslaan (FLASH)
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetController} disabled={sending} className="gap-1.5 text-xs h-9 text-destructive hover:text-destructive">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Soft Reset
                </Button>
                <Button variant="outline" size="sm" onClick={sendLogout} disabled={sending} className="gap-1.5 text-xs h-9">
                  Logout
                </Button>
              </div>
            </div>

            {/* Custom JSON command */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">JSON Commando (handmatig)</Label>
              <div className="flex gap-2">
                <Input
                  value={rawCommand}
                  onChange={e => setRawCommand(e.target.value)}
                  placeholder='bijv. ChangeConfiguration:{"key":"com_OCPPID","value":"NL*ECO*1000"}'
                  className="font-mono text-xs flex-1"
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && rawCommand.trim()) {
                      const parts = rawCommand.split(':');
                      if (parts.length >= 2) {
                        const action = parts[0];
                        try {
                          const payload = JSON.parse(parts.slice(1).join(':'));
                          await sendJsonCommand(action, payload);
                        } catch {
                          await sendText(rawCommand);
                        }
                      } else {
                        await sendText(rawCommand);
                      }
                      setRawCommand('');
                    }
                  }}
                />
                <Button size="sm" disabled={!rawCommand.trim()} className="gap-1.5 h-9" onClick={async () => {
                  const parts = rawCommand.split(':');
                  if (parts.length >= 2) {
                    const action = parts[0];
                    try {
                      const payload = JSON.parse(parts.slice(1).join(':'));
                      await sendJsonCommand(action, payload);
                    } catch {
                      await sendText(rawCommand);
                    }
                  } else {
                    await sendText(rawCommand);
                  }
                  setRawCommand('');
                }}>
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Formaat: Action:JSON — bijv. <code className="font-mono">GetConfiguration:{"{}"}</code>
              </p>
            </div>

            {/* Status */}
            <div className="rounded-lg bg-muted/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Controller Info</h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <span className="text-muted-foreground">Baudrate:</span>
                <span className="text-foreground">{baudRate.toLocaleString()}</span>
                <span className="text-muted-foreground">HW/FW:</span>
                <span className="text-foreground">{hwVersion || '(nog niet opgehaald)'}</span>
                <span className="text-muted-foreground">OCPP ID:</span>
                <span className="text-foreground">{controller.ocppId}</span>
                <span className="text-muted-foreground">Serienummer:</span>
                <span className="text-foreground">{controller.serialNumber}</span>
                <span className="text-muted-foreground">Model:</span>
                <span className="text-foreground">{controller.model}</span>
                {configCount > 0 && (
                  <>
                    <span className="text-muted-foreground">Config items verzonden:</span>
                    <span className="text-foreground">{configCount}</span>
                  </>
                )}
                <span className="text-muted-foreground">Protocol:</span>
                <span className="text-foreground">ECClite Binary (JSON_COMMAND_REQ)</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ECCliteSerial;
