import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Usb, Send, Download, Upload, AlertTriangle, CheckCircle2, RotateCcw, FileCode, Monitor } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  setController: React.Dispatch<React.SetStateAction<ControllerState>>;
  updateConfig: (key: string, value: string) => void;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800];

const CMD_GETVERSION_REQ = 100;
const CMD_LOGOUT_REQ = 101;
const CMD_JSON_COMMAND_REQ = 31;

let seqCounter = 0;

function buildFrame(cmd: number, payload: Uint8Array): Uint8Array {
  seqCounter += 1;
  const totalBytes = 12 + payload.length;
  const frame = new Uint8Array(totalBytes);
  const view = new DataView(frame.buffer);
  view.setUint32(0, 0, true);
  view.setUint16(4, cmd, true);
  view.setUint16(6, seqCounter, true);
  view.setUint16(8, payload.length, true);
  view.setUint16(10, totalBytes, true);
  frame.set(payload, 12);
  return frame;
}

function buildJsonCommandPayload(action: string, jsonPayload: string): Uint8Array {
  const encoder = new TextEncoder();
  const actionBytes = encoder.encode(action);
  const jsonBytes = encoder.encode(jsonPayload);
  const total = 1 + actionBytes.length * 2 + jsonBytes.length;
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

/* ── Simulation: realistic boot + response sequences from goodsession.log ── */

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const SIM_BOOT_SEQUENCE = [
  { text: 'EVCHARGER BOOTLOADER 04HW20 HWTYPE:20', color: 'green' as const, delay: 100 },
  { text: 'BOOT RCU40 ID: 1705000', color: 'blue' as const, delay: 50 },
  { text: 'NO NEW FIRMWARE FOUND', color: 'blue' as const, delay: 50 },
  { text: 'FLASH ID 1F 47 1 0', color: 'blue' as const, delay: 30 },
  { text: 'Version: 04HW20, type:20', color: 'green' as const, delay: 80 },
  { text: 'Programming OK, logging out', color: 'green' as const, delay: 100 },
  { text: 'Logout successfull', color: 'green' as const, delay: 50 },
  { text: 'Checking Firmware signature (size:60338, CRC:1623)', color: 'blue' as const, delay: 150 },
  { text: 'PRGCODE CRC VALID 1623, 1623', color: 'green' as const, delay: 50 },
  { text: 'Starting APPLICATION CODE', color: 'green' as const, delay: 100 },
  { text: 'Syslog init [3] 152,199,47', color: 'blue' as const, delay: 30 },
  { text: 'LPCID [0300402295C81421610A4042F50020C4] FLASHID [1F470100]', color: 'blue' as const, delay: 30 },
  { text: 'CFG version:8', color: 'blue' as const, delay: 20 },
  { text: 'PARAMETER MIGRATION V8>V10', color: 'yellow' as const, delay: 30 },
  { text: 'SV CFG():48825E8E', color: 'green' as const, delay: 50 },
  { text: 'Protocol [CH][TYPE]:[1:GSM][0:LMS]', color: 'blue' as const, delay: 30 },
  { text: 'PGrid[0:STATION CTRL]MIN.I[10]STATION[254]INSTALLATION[0]SUPERVISOR[0]', color: 'blue' as const, delay: 30 },
  { text: 'APN:[m2mservices.com],[],[]', color: 'blue' as const, delay: 20 },
  { text: 'SMS SERVER:[]', color: 'blue' as const, delay: 20 },
  { text: 'WS PING:[240s]', color: 'blue' as const, delay: 20 },
  { text: 'OCPP ID [LMS-1705000]', color: 'blue' as const, delay: 30 },
  { text: 'Model Name [EVC2.2]', color: 'blue' as const, delay: 20 },
  { text: 'Vendor Name [LMS]', color: 'blue' as const, delay: 20 },
  { text: 'Chargepoint serial [1705000]', color: 'blue' as const, delay: 20 },
  { text: 'Meter0:SN[]Type[1]Speed[1000]Addr[1]Opt[0]', color: 'blue' as const, delay: 20 },
  { text: 'Meter1:SN[]Type[1]Speed[1000]Addr[2]Opt[0]', color: 'blue' as const, delay: 20 },
  { text: 'DEST:[/#SN#],[ws.evc-net.com:80]', color: 'blue' as const, delay: 30 },
  { text: 'OPTIONS: APP[12300], CH[16,16]', color: 'blue' as const, delay: 20 },
  { text: 'Save Json CFG to FLASH', color: 'blue' as const, delay: 100 },
  { text: 'Saved 6403 bytes of Json CFG to FLASH crc:12F3', color: 'green' as const, delay: 80 },
  { text: 'HW420FW32R10', color: 'green' as const, delay: 30 },
  { text: 'MODULES:[OCPP,ETH,PTEST]', color: 'blue' as const, delay: 30 },
  { text: 'APP INIT RCU40 ID: 11735675', color: 'blue' as const, delay: 30 },
  { text: 'RAM SIZE/CEILING:128KB/122732', color: 'blue' as const, delay: 20 },
  { text: 'EEP SIZE/CEILING:64KB/37938', color: 'blue' as const, delay: 20 },
  { text: 'FLASH SIZE/CEILING:4096KB/3674112', color: 'blue' as const, delay: 20 },
  { text: '=========      =======', color: 'blue' as const, delay: 10 },
  { text: 'Heap Size      : 3932153k (max:3932153k) (10001874-0)', color: 'blue' as const, delay: 10 },
  { text: 'Stack size      : 0k (10007528), max:2.7kb Gap:23.2kb', color: 'blue' as const, delay: 10 },
  { text: '=========      =======', color: 'blue' as const, delay: 10 },
  { text: 'INITIALIZING EVENT FLASH MANAGER', color: 'blue' as const, delay: 50 },
  { text: 'EVENT FLASH MANAGER START [WRID:0][0/2048]MEM USAGE[0]', color: 'green' as const, delay: 30 },
  { text: 'Channel signature keys not found, creating new ones', color: 'yellow' as const, delay: 80 },
  { text: 'Save channel ECDSA keys', color: 'blue' as const, delay: 50 },
  { text: 'LICENSE CRC:BF7EE85/BF7EE85', color: 'green' as const, delay: 30 },
  { text: 'GSM MUX start', color: 'blue' as const, delay: 30 },
  { text: 'GSM Thread active', color: 'blue' as const, delay: 20 },
  { text: 'GSM IMEI[864351050453721]', color: 'blue' as const, delay: 40 },
  { text: 'GSM IMSI: 240075830756258', color: 'blue' as const, delay: 20 },
  { text: 'GSM REG:5, SQ:20,', color: 'blue' as const, delay: 80 },
  { text: 'APN OK [m2mservices.com]', color: 'green' as const, delay: 100 },
  { text: 'IP:10.161.205.9', color: 'green' as const, delay: 50 },
  { text: 'EVENTS:Waiting for IP number Done ...', color: 'green' as const, delay: 30 },
  { text: 'WS CONNECTING [GET /11735675 HTTP/1.1]', color: 'blue' as const, delay: 200 },
  { text: 'WS CONNECTION OK', color: 'green' as const, delay: 100 },
  { text: 'FORCE CHANNEL STATUS UPD [0]', color: 'blue' as const, delay: 30 },
  { text: 'FORCE CHANNEL STATUS UPD [1]', color: 'blue' as const, delay: 30 },
  { text: 'INIT RFID0:0@115200', color: 'blue' as const, delay: 30 },
  { text: 'SLAVE_CNT:0', color: 'blue' as const, delay: 20 },
  { text: 'CHG BOOT ACCEPT, NEWTIME:[240622 11:40:30]', color: 'green' as const, delay: 100 },
];

const SIM_DEFAULT_CONFIG: Record<string, string> = {
  'gsm_APN': 'm2mservices.com,,',
  'gsm_Oper': '20408',
  'com_ProtCh': 'GSM',
  'com_ProtType': 'Lms',
  'chg_io_Input': 'None,None',
  'chg_RatedCurrent': '16,16',
  'chg_StationMaxCurrent': '25',
  'chg_MinChargingCurrent': '6',
  'chg_Reader1': 'sl032,CH1',
  'chg_Reader2': 'sl032,CH2',
  'com_Endpoint': 'wss://devices.ecotap.com/registry/ocpp/#OSN#',
  'com_OCPPID': 'LMS-1705000',
  'com_Options': 'Events=1,BlockBeforeBoot=1,Wdt=0,updSendInIdle=0,blockLgFull=0,useTLS=0,comMaster=0',
  'grid_Role': 'Station_ctrl',
  'grid_InstallationMaxcurrent': '250',
  'grid_InstallationSaveCurrent': '100',
};

const ECCliteSerial = ({ controller, setController, updateConfig, addLog }: Props) => {
  const [supported, setSupported] = useState(false);
  const [connected, setConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [autoScroll, setAutoScroll] = useState(true);
  const [rawCommand, setRawCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [hwVersion, setHwVersion] = useState('');
  const [configCount, setConfigCount] = useState(0);
  const [simulationMode, setSimulationMode] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const lineBufferRef = useRef('');
  const readLoopRunningRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPortRef = useRef<any>(null); // remember port for reconnect

  useEffect(() => {
    setSupported('serial' in navigator);
  }, []);

  /* ── Simulation helpers ── */

  const simRespond = useCallback(async (lines: Array<{ text: string; color: ECCliteLogEntry['color']; delay: number }>) => {
    for (const line of lines) {
      await delay(line.delay);
      addLog(`[TTL] ${line.text}`, line.color);
      parseSerialResponseSim(line.text);
    }
  }, [addLog]);

  const parseSerialResponseSim = useCallback((line: string) => {
    const hwMatch = line.match(/HW(\d+)FW(\d+)R(\d+)/);
    if (hwMatch) {
      const ver = `V${hwMatch[2]}R${hwMatch[3]}`;
      setHwVersion(`HW${hwMatch[1]} ${ver}`);
      setController(prev => ({ ...prev, firmwareVersion: ver }));
    }
    const ocppIdMatch = line.match(/OCPP ID \[([^\]]+)\]/);
    if (ocppIdMatch) setController(prev => ({ ...prev, ocppId: ocppIdMatch[1] }));
    const snMatch = line.match(/Chargepoint serial \[([^\]]+)\]/);
    if (snMatch) setController(prev => ({ ...prev, serialNumber: snMatch[1] }));
    const modelMatch = line.match(/Model Name \[([^\]]+)\]/);
    if (modelMatch) setController(prev => ({ ...prev, model: modelMatch[1] }));
  }, [setController]);

  const simSendGetVersion = useCallback(async () => {
    addLog(`[TTL] Snd uid[0] cmd[cmd_GETVERSION_REQ[100]]seq[${++seqCounter}]len[0]`, 'blue');
    await delay(200);
    await simRespond([
      { text: 'EVCHARGER BOOTLOADER 04HW20 HWTYPE:20', color: 'green', delay: 100 },
      { text: 'Version: 04HW20, type:20', color: 'green', delay: 80 },
      { text: 'HW420FW32R16', color: 'green', delay: 50 },
    ]);
  }, [addLog, simRespond]);

  const simSendJsonCommand = useCallback(async (action: string, payload: Record<string, unknown>) => {
    const jsonStr = JSON.stringify(payload);
    const cmdPayload = buildJsonCommandPayload(action, jsonStr);

    addLog(`[TTL] ${action}${jsonStr}`, 'blue');
    addLog(`[TTL] Snd uid[0] cmd[JSON_COMMAND_REQ[31]]seq[${++seqCounter}]len[${cmdPayload.length}]tobytes[${cmdPayload.length + 12}]`, 'blue');
    addLog(`[TTL] Data[${toHexDump(cmdPayload)}]`, 'blue');

    await delay(100 + Math.random() * 100);

    switch (action) {
      case 'GetConfiguration': {
        const keys = Object.entries(SIM_DEFAULT_CONFIG).map(([key, value]) => ({
          key, readonly: false, value,
        }));
        const response = JSON.stringify({ configurationKey: keys });
        addLog(`[TTL] cmd_JSON_COMMAND [GetConfiguration][${keys.length}]`, 'blue');
        addLog(`[TTL] JSON Data received OK [${response.length}]`, 'green');
        addLog(`[TTL] ${response}`, 'green');
        // Apply to state
        for (const item of keys) {
          updateConfig(item.key, item.value);
        }
        addLog(`[TTL] Parsed ${keys.length} config keys`, 'green');
        break;
      }
      case 'ChangeConfiguration': {
        addLog(`[TTL] cmd_JSON_COMMAND [ChangeConfiguration][2][${jsonStr.length}]`, 'blue');
        addLog(`[TTL] JSON Data received OK [22]`, 'green');
        addLog(`[TTL] {"status":"Accepted"}`, 'green');
        break;
      }
      case 'Reset': {
        addLog(`[TTL] cmd_JSON_COMMAND [Reset][${jsonStr.length}]`, 'blue');
        addLog(`[TTL] JSON Data received OK [22]`, 'green');
        addLog(`[TTL] {"status":"Accepted"}`, 'green');
        await delay(500);
        addLog(`[TTL] Controller resetting...`, 'yellow');
        await delay(1000);
        await simRespond(SIM_BOOT_SEQUENCE.slice(0, 15));
        break;
      }
      case 'SaveConfiguration': {
        addLog(`[TTL] Save Json CFG to FLASH`, 'blue');
        await delay(300);
        addLog(`[TTL] Chk erase 90000-91914`, 'blue');
        await delay(200);
        addLog(`[TTL] Chk erase END`, 'blue');
        const crc = Math.random().toString(16).slice(2, 10).toUpperCase();
        addLog(`[TTL] Saved 6420 bytes of Json CFG to FLASH crc:${crc}`, 'green');
        addLog(`[TTL] SV CFG():${crc}`, 'green');
        break;
      }
      default: {
        addLog(`[TTL] cmd_JSON_COMMAND [${action}][${jsonStr.length}]`, 'blue');
        addLog(`[TTL] JSON Data received OK [22]`, 'green');
        addLog(`[TTL] {"status":"Accepted"}`, 'green');
      }
    }
  }, [addLog, simRespond, updateConfig]);

  const simConnect = useCallback(async () => {
    addLog(`[SIM] Opening simulated COM port at ${baudRate} baud...`, 'blue');
    await delay(200);
    addLog(`[SIM] USB-TTL adapter detected (FTDI FT232R) — SIMULATIE`, 'yellow');
    await delay(300);

    setConnected(true);
    setController(prev => ({ ...prev, connected: true }));

    // Play boot sequence
    addLog(`[SIM] === Controller Boot Sequence (uit goodsession.log) ===`, 'yellow');
    await simRespond(SIM_BOOT_SEQUENCE);
    addLog(`[SIM] === Boot complete — simulatie actief ===`, 'green');
  }, [baudRate, addLog, setController, simRespond]);

  const simDisconnect = useCallback(async () => {
    addLog(`[SIM] Snd uid[0] cmd[cmd_LOGOUT_REQ[101]]seq[${++seqCounter}]len[0]`, 'blue');
    await delay(100);
    addLog(`[SIM] Logout successfull`, 'green');
    addLog(`[SIM] Communicatie sessie wordt beeindigd...`, 'yellow');
    setConnected(false);
    setController(prev => ({ ...prev, connected: false }));
    addLog(`[SIM] Verbinding gesloten`, 'yellow');
  }, [addLog, setController]);

  /* ── Real serial helpers ── */

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
          let color: ECCliteLogEntry['color'] = 'blue';
          if (trimmed.includes('ERROR') || trimmed.includes('FAIL')) color = 'red';
          else if (trimmed.includes('OK') || trimmed.includes('Accepted')) color = 'green';
          else if (trimmed.includes('WARN') || trimmed.includes('TIMEOUT') || trimmed.includes('RCD')) color = 'yellow';
          else if (trimmed.startsWith('HW') || trimmed.includes('BOOT')) color = 'green';
          addLog(`[TTL] ${trimmed}`, color);
          parseSerialResponseSim(trimmed);

          // Parse JSON
          try {
            const data = JSON.parse(trimmed);
            if (data.configurationKey && Array.isArray(data.configurationKey)) {
              for (const item of data.configurationKey) {
                if (item.key && item.value !== undefined) updateConfig(item.key, String(item.value));
              }
              addLog(`[TTL] Parsed ${data.configurationKey.length} config keys`, 'green');
            }
          } catch { /* not JSON */ }
        }
      }
    } catch (err) {
      if ((err as Error).message !== 'The device has been lost.') {
        addLog(`[TTL] Read error: ${(err as Error).message}`, 'red');
      }
    } finally {
      readLoopRunningRef.current = false;
    }
  }, [addLog, parseSerialResponseSim, updateConfig]);

  const handleConnect = async () => {
    if (connected) {
      if (simulationMode) {
        await simDisconnect();
      } else {
        await handleDisconnect();
      }
      return;
    }

    if (simulationMode) {
      await simConnect();
      return;
    }

    if (!('serial' in navigator)) {
      addLog('[TTL] Web Serial API not supported — schakel simulatie in', 'red');
      return;
    }

    try {
      addLog(`[TTL] Requesting serial port...`, 'blue');
      const port = await (navigator as any).serial.requestPort();
      portRef.current = port;
      // Close if already open (e.g. leftover from previous session)
      if (port.readable || port.writable) {
        addLog(`[TTL] Poort was al open, eerst sluiten...`, 'yellow');
        try {
          if (port.readable) { const r = port.readable.getReader(); await r.cancel(); r.releaseLock(); }
          if (port.writable) { const w = port.writable.getWriter(); await w.close(); }
          await port.close();
        } catch { /* ignore close errors */ }
        await new Promise(r => setTimeout(r, 200));
      }
      await port.open({ baudRate });
      addLog(`[TTL] Port opened at ${baudRate} baud`, 'green');
      if (port.readable) { readerRef.current = port.readable.getReader(); readLoop(); }
      if (port.writable) { writerRef.current = port.writable.getWriter(); }
      setConnected(true);
      setController(prev => ({ ...prev, connected: true }));
      addLog(`[TTL] USB-TTL verbinding actief`, 'green');
      lastPortRef.current = port;
      port.addEventListener('disconnect', () => {
        addLog('[TTL] Device disconnected', 'red');
        cleanup();
        if (autoReconnect && !simulationMode) {
          attemptReconnect();
        }
      });
      setTimeout(() => sendGetVersion(), 500);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('No port selected')) addLog('[TTL] Geen poort geselecteerd', 'yellow');
      else addLog(`[TTL] Verbinding mislukt: ${msg}`, 'red');
    }
  };

  const cleanup = useCallback(() => {
    setConnected(false);
    readLoopRunningRef.current = false;
    readerRef.current = null;
    writerRef.current = null;
    portRef.current = null;
  }, []);

  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setReconnecting(false);
  }, []);

  const attemptReconnect = useCallback(async (attempt = 1) => {
    const MAX_ATTEMPTS = 5;
    const DELAYS = [2000, 3000, 5000, 8000, 12000];

    if (attempt > MAX_ATTEMPTS) {
      addLog(`[TTL] Auto-reconnect gestopt na ${MAX_ATTEMPTS} pogingen`, 'red');
      setReconnecting(false);
      return;
    }

    const delayMs = DELAYS[attempt - 1] || 12000;
    setReconnecting(true);
    addLog(`[TTL] Auto-reconnect poging ${attempt}/${MAX_ATTEMPTS} over ${delayMs / 1000}s...`, 'yellow');

    reconnectTimerRef.current = setTimeout(async () => {
      const port = lastPortRef.current;
      if (!port) {
        addLog(`[TTL] Geen bekende poort voor reconnect`, 'red');
        setReconnecting(false);
        return;
      }

      try {
        // Close leftovers
        if (port.readable || port.writable) {
          try {
            if (port.readable) { const r = port.readable.getReader(); await r.cancel(); r.releaseLock(); }
            if (port.writable) { const w = port.writable.getWriter(); await w.close(); }
            await port.close();
          } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, 200));
        }

        await port.open({ baudRate });
        portRef.current = port;
        addLog(`[TTL] Reconnect geslaagd! Port heropend at ${baudRate} baud`, 'green');

        if (port.readable) { readerRef.current = port.readable.getReader(); readLoop(); }
        if (port.writable) { writerRef.current = port.writable.getWriter(); }
        setConnected(true);
        setReconnecting(false);
        setController(prev => ({ ...prev, connected: true }));
        addLog(`[TTL] USB-TTL verbinding hersteld`, 'green');
        setTimeout(() => sendGetVersion(), 500);
      } catch (err) {
        addLog(`[TTL] Reconnect poging ${attempt} mislukt: ${(err as Error).message}`, 'red');
        attemptReconnect(attempt + 1);
      }
    }, delayMs);
  }, [addLog, baudRate, readLoop, setController]);

  // Cleanup reconnect timer on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const handleDisconnect = async () => {
    try {
      await sendLogout();
      if (readerRef.current) { await readerRef.current.cancel(); readerRef.current.releaseLock(); readerRef.current = null; }
      if (writerRef.current) { await writerRef.current.close(); writerRef.current = null; }
      if (portRef.current) { await portRef.current.close(); portRef.current = null; }
    } catch (err) { addLog(`[TTL] Disconnect error: ${(err as Error).message}`, 'yellow'); }
    setConnected(false);
    setController(prev => ({ ...prev, connected: false }));
    addLog('[TTL] Verbinding gesloten', 'yellow');
  };

  const sendBytes = async (data: Uint8Array) => {
    const writer = writerRef.current;
    if (!writer) { addLog('[TTL] Geen writer beschikbaar', 'red'); return; }
    await writer.write(data);
  };

  const sendText = async (text: string) => {
    if (simulationMode) {
      addLog(`[SIM] TX: ${text}`, 'blue');
      await delay(100);
      addLog(`[SIM] {"status":"Accepted"}`, 'green');
      return;
    }
    const encoder = new TextEncoder();
    await sendBytes(encoder.encode(text + '\r\n'));
    addLog(`[TTL] TX: ${text}`, 'blue');
  };

  const sendGetVersion = async () => {
    if (simulationMode) { await simSendGetVersion(); return; }
    const frame = buildFrame(CMD_GETVERSION_REQ, new Uint8Array(0));
    addLog(`[TTL] Snd uid[0] cmd[cmd_GETVERSION_REQ[100]]seq[${seqCounter}]len[0]`, 'blue');
    addLog(`[TTL] TX HEX: ${toHexDump(frame)}`, 'blue');
    await sendBytes(frame);
  };

  const sendLogout = async () => {
    if (simulationMode) return;
    const frame = buildFrame(CMD_LOGOUT_REQ, new Uint8Array(0));
    addLog(`[TTL] Snd uid[0] cmd[cmd_LOGOUT_REQ[101]]seq[${seqCounter}]len[0]`, 'blue');
    await sendBytes(frame);
  };

  const sendJsonCommand = async (action: string, payload: Record<string, unknown>) => {
    if (simulationMode) { await simSendJsonCommand(action, payload); return; }
    const jsonStr = JSON.stringify(payload);
    const cmdPayload = buildJsonCommandPayload(action, jsonStr);
    const frame = buildFrame(CMD_JSON_COMMAND_REQ, cmdPayload);
    addLog(`[TTL] ${action}${jsonStr}`, 'blue');
    addLog(`[TTL] Snd uid[0] cmd[JSON_COMMAND_REQ[31]]seq[${seqCounter}]len[${cmdPayload.length}]tobytes[${frame.length}]`, 'blue');
    addLog(`[TTL] Data[${toHexDump(cmdPayload)}]`, 'blue');
    await sendBytes(frame);
  };

  const handleGetConfiguration = async () => {
    setSending(true);
    addLog('[TTL] Requesting configuration (GetConfiguration)...', 'blue');
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
        let count = 0;
        for (const item of data.configurationKey) {
          await sendJsonCommand('ChangeConfiguration', { key: item.key, value: item.value });
          updateConfig(item.key, String(item.value));
          count++;
          setConfigCount(count);
          await delay(200);
        }
        addLog(`[TTL] Send ${count} Cfg Items OK`, 'green');
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

  const handleSaveConfig = async () => {
    addLog('[TTL] Requesting config save to FLASH...', 'blue');
    await sendJsonCommand('SaveConfiguration', {});
  };

  const modeLabel = simulationMode ? 'Simulatie' : 'Hardware';

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">USB-TTL Seriële Verbinding</h2>
        <div className="flex items-center gap-2">
          {connected && simulationMode && (
            <Badge variant="secondary" className="gap-1.5 text-[10px]">
              <Monitor className="h-3 w-3" />
              SIM
            </Badge>
          )}
          <Badge variant={connected ? 'default' : 'secondary'} className="gap-1.5">
            {connected ? <CheckCircle2 className="h-3 w-3" /> : <Usb className="h-3 w-3" />}
            {connected ? 'Verbonden' : 'Niet verbonden'}
          </Badge>
        </div>
      </div>
      <div className="p-5 space-y-5">
        {/* Simulation toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Simulatiemodus</p>
            <p className="text-xs text-muted-foreground">
              {simulationMode
                ? 'Simuleert een Ecotap controller met boot-sequence uit goodsession.log — geen hardware nodig'
                : 'Verbindt via Web Serial API met een fysieke controller via USB-TTL kabel'}
            </p>
          </div>
          <Switch
            checked={simulationMode}
            onCheckedChange={setSimulationMode}
            disabled={connected}
          />
        </div>

        {/* Connection settings */}
        {!simulationMode && (
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
                <Label className="text-xs text-muted-foreground cursor-pointer">Auto-scroll log</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
                <Label className="text-xs text-muted-foreground cursor-pointer">Auto-reconnect</Label>
              </div>
            </div>
          </div>
        )}

        {/* Not supported warning (only in hardware mode) */}
        {!simulationMode && !supported && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Web Serial API niet beschikbaar</p>
              <p className="text-xs text-muted-foreground">
                Gebruik <strong>Chrome/Edge v89+</strong>, of schakel <strong>simulatiemodus</strong> in.
              </p>
            </div>
          </div>
        )}

        {/* Connect button */}
        <Button
          onClick={handleConnect}
          className="w-full gap-2 h-11"
          variant={connected ? 'destructive' : 'default'}
          disabled={!simulationMode && !supported}
        >
          {simulationMode ? <Monitor className="h-4 w-4" /> : <Usb className="h-4 w-4" />}
          {connected
            ? `Verbinding verbreken (${modeLabel})`
            : simulationMode
              ? 'Start simulatie (goodsession.log boot)'
              : 'Verbinden met USB-TTL poort'}
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
                <Button variant="outline" size="sm" onClick={simulationMode ? simDisconnect : () => sendLogout()} disabled={sending} className="gap-1.5 text-xs h-9">
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
                        try {
                          await sendJsonCommand(parts[0], JSON.parse(parts.slice(1).join(':')));
                        } catch { await sendText(rawCommand); }
                      } else { await sendText(rawCommand); }
                      setRawCommand('');
                    }
                  }}
                />
                <Button size="sm" disabled={!rawCommand.trim()} className="gap-1.5 h-9" onClick={async () => {
                  const parts = rawCommand.split(':');
                  if (parts.length >= 2) {
                    try { await sendJsonCommand(parts[0], JSON.parse(parts.slice(1).join(':'))); }
                    catch { await sendText(rawCommand); }
                  } else { await sendText(rawCommand); }
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
                <span className="text-muted-foreground">Modus:</span>
                <span className="text-foreground">{simulationMode ? 'Simulatie (goodsession.log)' : `Hardware @ ${baudRate.toLocaleString()}`}</span>
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
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ECCliteSerial;
