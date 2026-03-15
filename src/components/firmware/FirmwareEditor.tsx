import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wrench, Brain, File, Download, Save, Undo2, Search,
  Settings2, Combine, AlertTriangle, CheckCircle2, Pencil
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAllFirmwareFileMetadata, useUpsertFirmwareFileMetadata } from '@/hooks/useFirmwareFileMetadata';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface StorageFile {
  id: string;
  name: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  folder: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function bytesToHex(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const offset = i.toString(16).padStart(8, '0');
    const hexParts: string[] = [];
    let ascii = '';
    for (let j = 0; j < 16; j++) {
      if (i + j < bytes.length) {
        hexParts.push(bytes[i + j].toString(16).padStart(2, '0'));
        const c = bytes[i + j];
        ascii += c >= 32 && c <= 126 ? String.fromCharCode(c) : '.';
      } else {
        hexParts.push('  ');
        ascii += ' ';
      }
    }
    lines.push(`${offset}  ${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}  |${ascii}|`);
  }
  return lines.join('\n');
}

const KNOWN_CONFIG_PARAMS = [
  // OCPP Core
  { name: 'HeartbeatInterval', defaultValue: '300', category: 'OCPP', description: 'Interval in seconden tussen heartbeat berichten naar het Central System' },
  { name: 'ConnectionTimeOut', defaultValue: '60', category: 'OCPP', description: 'Timeout in seconden voor het opzetten van een OCPP verbinding' },
  { name: 'MeterValueSampleInterval', defaultValue: '60', category: 'OCPP', description: 'Interval in seconden tussen meter value samples tijdens een transactie' },
  { name: 'MeterValuesSampledData', defaultValue: 'Energy.Active.Import.Register', category: 'OCPP', description: 'Comma-separated lijst van meetwaarden die gesampeld worden' },
  { name: 'ClockAlignedDataInterval', defaultValue: '900', category: 'OCPP', description: 'Interval voor klok-uitgelijnde meter data (0 = uit)' },
  { name: 'NumberOfConnectors', defaultValue: '2', category: 'Hardware', description: 'Aantal fysieke connectors op de laadpaal' },
  { name: 'ResetRetries', defaultValue: '3', category: 'OCPP', description: 'Aantal pogingen voor een reset commando' },
  { name: 'TransactionMessageAttempts', defaultValue: '3', category: 'OCPP', description: 'Aantal pogingen om transactie-gerelateerde berichten te versturen' },
  { name: 'TransactionMessageRetryInterval', defaultValue: '30', category: 'OCPP', description: 'Interval in seconden tussen herhaalpogingen voor transactie-berichten' },
  { name: 'UnlockConnectorOnEVSideDisconnect', defaultValue: 'true', category: 'OCPP', description: 'Connector ontgrendelen wanneer EV-zijde kabel loskoppelt' },
  { name: 'LocalPreAuthorize', defaultValue: 'true', category: 'Security', description: 'Lokale pre-autorisatie met cache van de autorisatielijst' },
  { name: 'LocalAuthListEnabled', defaultValue: 'true', category: 'Security', description: 'Gebruik van de lokale autorisatielijst inschakelen' },
  { name: 'AuthorizationCacheEnabled', defaultValue: 'true', category: 'Security', description: 'Autorisatie cache inschakelen voor snellere authenticatie' },
  { name: 'StopTransactionOnInvalidId', defaultValue: 'true', category: 'Security', description: 'Transactie stoppen als id_tag ongeldig wordt verklaard' },
  { name: 'StopTransactionOnEVSideDisconnect', defaultValue: 'true', category: 'OCPP', description: 'Transactie stoppen bij loskoppelen van EV-zijde' },
  // Netwerk
  { name: 'CentralSystemUrl', defaultValue: 'ws://ocpp.example.com:80', category: 'Network', description: 'WebSocket URL van het OCPP Central System' },
  { name: 'ChargePointId', defaultValue: 'CP001', category: 'Network', description: 'Unieke identifier van de laadpaal' },
  { name: 'WebSocketPingInterval', defaultValue: '30', category: 'Network', description: 'Interval in seconden tussen WebSocket ping frames' },
  { name: 'NetworkConfigurationPriority', defaultValue: 'LAN,WiFi,4G', category: 'Network', description: 'Prioriteitsvolgorde van netwerkinterfaces' },
  { name: 'APNName', defaultValue: '', category: 'Network', description: 'Access Point Name voor mobiel netwerk (4G/LTE)' },
  // Hardware / Timing
  { name: 'MaxChargingCurrent', defaultValue: '32', category: 'Hardware', description: 'Maximale laadstroom in Ampère per connector' },
  { name: 'MinChargingCurrent', defaultValue: '6', category: 'Hardware', description: 'Minimale laadstroom in Ampère (IEC 61851)' },
  { name: 'MaxPower', defaultValue: '22000', category: 'Hardware', description: 'Maximaal laadvermogen in Watt' },
  { name: 'WatchdogTimeout', defaultValue: '30', category: 'Timing', description: 'Watchdog timer timeout in seconden' },
  { name: 'ModbusBaudrate', defaultValue: '9600', category: 'Hardware', description: 'Baudrate voor Modbus seriële communicatie' },
  { name: 'ModbusAddress', defaultValue: '1', category: 'Hardware', description: 'Modbus slave adres van de energiemeter' },
  // Firmware
  { name: 'FirmwareVersion', defaultValue: '', category: 'Firmware', description: 'Huidige firmware versie string' },
  { name: 'SupportedFeatureProfiles', defaultValue: 'Core,FirmwareManagement,SmartCharging', category: 'Firmware', description: 'Ondersteunde OCPP feature profiles' },
];

const FirmwareEditor = () => {
  const [selectedFile, setSelectedFile] = useState('');
  const [editorTab, setEditorTab] = useState('patch');
  const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null);
  const [editedBytes, setEditedBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [hexSearch, setHexSearch] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [highlightOffset, setHighlightOffset] = useState<number | null>(null);

  // Patch mode
  const [patchInstruction, setPatchInstruction] = useState('');
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchAnalysis, setPatchAnalysis] = useState('');
  const [pendingPatches, setPendingPatches] = useState<{ offset: string; oldHex: string; newHex: string; description: string }[]>([]);
  const [appliedPatches, setAppliedPatches] = useState<{ offset: string; oldHex: string; newHex: string; description: string }[]>([]);

  // Config mode
  const [configLoading, setConfigLoading] = useState(false);
  const [configAnalysis, setConfigAnalysis] = useState('');
  const [extractedConfig, setExtractedConfig] = useState<{ parameters: { name: string; value: string; offset: string; size_bytes: number; type: string; description: string; editable: boolean; category: string }[] } | null>(null);
  const [editedParams, setEditedParams] = useState<Record<string, string>>({});

  // Merge mode
  const [mergeFileA, setMergeFileA] = useState('');
  const [mergeFileB, setMergeFileB] = useState('');
  const [mergeInstruction, setMergeInstruction] = useState('');
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeAnalysis, setMergeAnalysis] = useState('');

  const [saving, setSaving] = useState(false);

  const { data: allMetadata } = useAllFirmwareFileMetadata();
  const upsertMeta = useUpsertFirmwareFileMetadata();

  const { data: uploadedFiles, isLoading: filesLoading } = useQuery({
    queryKey: ['firmware-files'],
    queryFn: async () => {
      const { data: rootItems, error: rootErr } = await supabase.storage.from('firmware').list('', {
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (rootErr) throw rootErr;
      const allFiles: StorageFile[] = [];
      for (const item of rootItems || []) {
        if (!item.id) {
          const { data: folderFiles, error: folderErr } = await supabase.storage.from('firmware').list(item.name, {
            sortBy: { column: 'created_at', order: 'desc' },
          });
          if (!folderErr && folderFiles) {
            for (const f of folderFiles) {
              if (f.id) allFiles.push({ ...f, folder: item.name, name: `${item.name}/${f.name}`, metadata: f.metadata as Record<string, unknown> | null });
            }
          }
        } else {
          allFiles.push({ ...item, folder: '', metadata: item.metadata as Record<string, unknown> | null });
        }
      }
      return allFiles;
    },
  });

  const getLabel = (filePath: string) => {
    const meta = allMetadata?.find(m => m.file_path === filePath);
    return meta?.label || filePath.split('/').pop() || filePath;
  };

  const fileInfo = uploadedFiles?.find(f => f.name === selectedFile);
  const fileSize = fileInfo?.metadata && 'size' in (fileInfo.metadata || {}) ? fileInfo.metadata!.size as number : 0;

  const loadFile = useCallback(async (path: string) => {
    setLoading(true);
    setRawBytes(null);
    setEditedBytes(null);
    setPatchAnalysis('');
    setPendingPatches([]);
    setAppliedPatches([]);
    setConfigAnalysis('');
    setExtractedConfig(null);
    setEditedParams({});
    setMergeAnalysis('');
    try {
      const { data, error } = await supabase.storage.from('firmware').download(path);
      if (error) throw error;
      const bytes = new Uint8Array(await data.arrayBuffer());
      setRawBytes(bytes);
      setEditedBytes(new Uint8Array(bytes));
    } catch (err) {
      toast.error('Bestand laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectFile = (path: string) => {
    setSelectedFile(path);
    if (path) loadFile(path);
  };

  // Hex display (first 2KB of edited bytes)
  const hexDisplay = useMemo(() => {
    if (!editedBytes) return '';
    const preview = editedBytes.slice(0, 2048);
    return bytesToHex(preview);
  }, [editedBytes]);

  // Search in hex
  const handleSearch = () => {
    if (!editedBytes || !hexSearch.trim()) return;
    const searchBytes = hexSearch.trim().toLowerCase().split(/\s+/).map(h => parseInt(h, 16));
    const results: number[] = [];
    for (let i = 0; i <= editedBytes.length - searchBytes.length; i++) {
      let match = true;
      for (let j = 0; j < searchBytes.length; j++) {
        if (editedBytes[i + j] !== searchBytes[j]) { match = false; break; }
      }
      if (match) results.push(i);
    }
    setSearchResults(results);
    if (results.length > 0) {
      setHighlightOffset(results[0]);
      toast.success(`${results.length} resultaten gevonden`);
    } else {
      toast.info('Geen resultaten gevonden');
    }
  };

  // AI Patch
  const runAiPatch = async () => {
    if (!patchInstruction.trim() || !editedBytes) return;
    setPatchLoading(true);
    setPatchAnalysis('');
    setPendingPatches([]);
    try {
      const hexContext = bytesToHex(editedBytes.slice(0, 4096));
      const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
        body: {
          mode: 'edit-patch',
          fileName: selectedFile,
          fileSize,
          hexPreview: hexContext,
          hexContext,
          editInstruction: patchInstruction,
        },
      });
      if (fnError) throw fnError;
      setPatchAnalysis(fnData.analysis || '');
      setPendingPatches(fnData.patches || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Patch analyse mislukt');
    } finally {
      setPatchLoading(false);
    }
  };

  // Apply a single patch
  const applyPatch = (patch: { offset: string; oldHex: string; newHex: string; description: string }) => {
    if (!editedBytes) return;
    const offset = parseInt(patch.offset, 16);
    const newBytes = patch.newHex.split(/\s+/).map(h => parseInt(h, 16));
    const updated = new Uint8Array(editedBytes);
    for (let i = 0; i < newBytes.length && offset + i < updated.length; i++) {
      updated[offset + i] = newBytes[i];
    }
    setEditedBytes(updated);
    setAppliedPatches(prev => [...prev, patch]);
    setPendingPatches(prev => prev.filter(p => p.offset !== patch.offset));
    toast.success(`Patch toegepast op ${patch.offset}`);
  };

  // Undo all patches
  const undoAll = () => {
    if (rawBytes) {
      setEditedBytes(new Uint8Array(rawBytes));
      setAppliedPatches([]);
      setPendingPatches([]);
      toast.info('Alle wijzigingen ongedaan gemaakt');
    }
  };

  // Extract config
  const runExtractConfig = async () => {
    if (!editedBytes) return;
    setConfigLoading(true);
    setConfigAnalysis('');
    setExtractedConfig(null);
    try {
      const hexContext = bytesToHex(editedBytes.slice(0, 4096));
      const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
        body: {
          mode: 'extract-config',
          fileName: selectedFile,
          fileSize,
          hexPreview: hexContext,
        },
      });
      if (fnError) throw fnError;
      setConfigAnalysis(fnData.analysis || '');
      if (fnData.config?.parameters) {
        setExtractedConfig(fnData.config);
        const initial: Record<string, string> = {};
        fnData.config.parameters.forEach((p: { name: string; value: string }) => {
          initial[p.name] = p.value;
        });
        setEditedParams(initial);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Configuratie extractie mislukt');
    } finally {
      setConfigLoading(false);
    }
  };

  // Merge analysis
  const runMergeAnalysis = async () => {
    if (!mergeFileA || !mergeFileB || !mergeInstruction.trim()) return;
    setMergeLoading(true);
    setMergeAnalysis('');
    try {
      const [resA, resB] = await Promise.all([
        supabase.storage.from('firmware').download(mergeFileA),
        supabase.storage.from('firmware').download(mergeFileB),
      ]);
      if (resA.error) throw resA.error;
      if (resB.error) throw resB.error;

      const bytesA = new Uint8Array(await resA.data.arrayBuffer());
      const bytesB = new Uint8Array(await resB.data.arrayBuffer());

      const hexA = bytesToHex(bytesA.slice(0, 2048));
      const hexB = bytesToHex(bytesB.slice(0, 2048));

      const infoA = uploadedFiles?.find(f => f.name === mergeFileA);
      const infoB = uploadedFiles?.find(f => f.name === mergeFileB);

      const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
        body: {
          mode: 'merge',
          fileNames: [mergeFileA, mergeFileB],
          fileSizes: [
            infoA?.metadata && 'size' in (infoA.metadata || {}) ? infoA.metadata!.size : bytesA.length,
            infoB?.metadata && 'size' in (infoB.metadata || {}) ? infoB.metadata!.size : bytesB.length,
          ],
          hexPreview: `=== ${mergeFileA} ===\n${hexA}\n\n=== ${mergeFileB} ===\n${hexB}`,
          mergeInstructions: mergeInstruction,
        },
      });
      if (fnError) throw fnError;
      setMergeAnalysis(fnData.analysis || '');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Merge analyse mislukt');
    } finally {
      setMergeLoading(false);
    }
  };

  // Download edited file
  const downloadEdited = () => {
    if (!editedBytes) return;
    const blob = new Blob([editedBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = selectedFile.split('/').pop() || 'firmware.bin';
    a.href = url;
    a.download = `patched_${name}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save edited to storage
  const saveEdited = async () => {
    if (!editedBytes || !selectedFile) return;
    setSaving(true);
    try {
      const blob = new Blob([editedBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const name = selectedFile.split('/').pop() || 'firmware.bin';
      const folder = selectedFile.includes('/') ? selectedFile.split('/').slice(0, -1).join('/') : 'general';
      const newPath = `${folder}/patched_${Date.now()}_${name}`;
      const { error } = await supabase.storage.from('firmware').upload(newPath, blob);
      if (error) throw error;

      // Save metadata
      const patchNotes = appliedPatches.map(p => `${p.offset}: ${p.description}`).join('\n');
      await upsertMeta.mutateAsync({
        file_path: newPath,
        label: `Patched: ${getLabel(selectedFile)}`,
        notes: `Gepatcht vanuit ${selectedFile}\n\nToegepaste patches:\n${patchNotes}`,
      });

      toast.success('Bewerkt bestand opgeslagen');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = rawBytes && editedBytes && appliedPatches.length > 0;

  return (
    <div className="space-y-6">
      {/* File selection */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Firmware Editor</h3>
            <p className="text-xs text-muted-foreground">Bewerk firmware met AI-gestuurde patches, configuratie-extractie en binary merging</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Selecteer firmware bestand</label>
            {filesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedFile} onValueChange={handleSelectFile}>
                <SelectTrigger><SelectValue placeholder="Kies een bestand..." /></SelectTrigger>
                <SelectContent>
                  {uploadedFiles?.map(f => (
                    <SelectItem key={f.id} value={f.name}>
                      <div className="flex items-center gap-2">
                        <File className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-xs">{getLabel(f.name)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {f.metadata && 'size' in (f.metadata || {}) ? formatBytes(f.metadata!.size as number) : ''}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {hasChanges && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={undoAll} className="gap-1.5 text-xs">
                <Undo2 className="h-3.5 w-3.5" /> Reset
              </Button>
              <Button size="sm" variant="outline" onClick={downloadEdited} className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <Button size="sm" onClick={saveEdited} disabled={saving} className="gap-1.5 text-xs">
                <Save className="h-3.5 w-3.5" /> {saving ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {editedBytes && !loading && (
        <>
          {/* Status bar */}
          {appliedPatches.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-3">
              <Pencil className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-foreground">
                <strong>{appliedPatches.length}</strong> patch{appliedPatches.length !== 1 ? 'es' : ''} toegepast
              </span>
              <div className="flex gap-1 flex-wrap">
                {appliedPatches.map((p, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] border-amber-500/30 text-amber-600">{p.offset}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Hex preview + search */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Hex Preview (eerste 2 KB)</h4>
              <div className="flex gap-2 items-center">
                <Input
                  value={hexSearch}
                  onChange={e => setHexSearch(e.target.value)}
                  placeholder="Zoek hex (bijv. FF 00 A4)..."
                  className="text-xs h-8 w-48"
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Button size="sm" variant="outline" onClick={handleSearch} className="h-8 gap-1 text-xs">
                  <Search className="h-3 w-3" /> Zoek
                </Button>
              </div>
            </div>
            {searchResults.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                <span className="text-xs text-muted-foreground">{searchResults.length} resultaten:</span>
                {searchResults.slice(0, 20).map((r, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[9px] cursor-pointer hover:bg-primary/10"
                    onClick={() => setHighlightOffset(r)}
                  >
                    0x{r.toString(16).padStart(8, '0')}
                  </Badge>
                ))}
                {searchResults.length > 20 && <span className="text-[10px] text-muted-foreground">+{searchResults.length - 20} meer</span>}
              </div>
            )}
            <pre className="rounded-lg border border-border bg-muted/30 p-3 text-[10px] font-mono text-foreground overflow-x-auto max-h-[200px] overflow-y-auto leading-relaxed">
              {hexDisplay}
            </pre>
          </div>

          {/* Editor tabs */}
          <Tabs value={editorTab} onValueChange={setEditorTab}>
            <TabsList className="grid w-full grid-cols-3 max-w-lg">
              <TabsTrigger value="patch" className="gap-1.5 text-xs">
                <Brain className="h-3.5 w-3.5" /> AI Patches
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-1.5 text-xs">
                <Settings2 className="h-3.5 w-3.5" /> Config Extractor
              </TabsTrigger>
              <TabsTrigger value="merge" className="gap-1.5 text-xs">
                <Combine className="h-3.5 w-3.5" /> Binary Merge
              </TabsTrigger>
            </TabsList>

            {/* AI Patch tab */}
            <TabsContent value="patch" className="mt-4 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Beschrijf in tekst wat je wilt aanpassen. De AI analyseert de binary en genereert exacte hex patches.
                </p>
                <Textarea
                  value={patchInstruction}
                  onChange={e => setPatchInstruction(e.target.value)}
                  placeholder="bijv. 'Wijzig de HeartbeatInterval van 300 naar 600 seconden' of 'Verwijder de digitale handtekening uit de header'"
                  rows={3}
                  className="text-sm"
                />
                <Button onClick={runAiPatch} disabled={patchLoading || !patchInstruction.trim()} className="gap-2">
                  <Brain className="h-4 w-4" />
                  {patchLoading ? 'Analyseren...' : 'Genereer patches'}
                </Button>
              </div>

              {patchLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              )}

              {patchAnalysis && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown>{patchAnalysis}</ReactMarkdown>
                  </div>

                  {pendingPatches.length > 0 && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Toepasbare patches ({pendingPatches.length})
                      </h4>
                      {pendingPatches.map((patch, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[9px] font-mono">{patch.offset}</Badge>
                              <span className="text-xs text-muted-foreground">{patch.description}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-mono">
                              <span className="text-red-500 line-through">{patch.oldHex}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-emerald-500">{patch.newHex}</span>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => applyPatch(patch)} className="gap-1 text-xs shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Toepassen
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Config Extractor tab */}
            <TabsContent value="config" className="mt-4 space-y-4">
              {/* Bekende OCPP configuratieparameters */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  Bekende OCPP / EV-laadpaal configuratieparameters
                </h4>
                <p className="text-xs text-muted-foreground">
                  Standaard configuratieparameters voor OCPP 1.6 laadpalen (Ecotap EVC/ECC). Gebruik de AI-extractie hieronder om de werkelijke waarden uit de firmware te lezen.
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Parameter</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Standaard</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categorie</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Beschrijving</th>
                      </tr>
                    </thead>
                    <tbody>
                      {KNOWN_CONFIG_PARAMS.map((p, i) => (
                        <tr key={i} className={`border-t border-border ${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                          <td className="px-3 py-2 font-mono font-medium text-foreground whitespace-nowrap">{p.name}</td>
                          <td className="px-3 py-2 font-mono text-foreground">{p.defaultValue}</td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="text-[9px]">{p.category}</Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[300px]">{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI Extractie */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  AI configuratie-extractie
                </h4>
                <p className="text-xs text-muted-foreground">
                  Laat AI de werkelijke configuratiewaarden uit de geladen firmware binary extraheren en bewerkbaar maken.
                </p>
                <Button onClick={runExtractConfig} disabled={configLoading || !editedBytes} className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  {configLoading ? 'Extraheren...' : 'Extraheer uit firmware'}
                </Button>
              </div>

              {configLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              )}

              {extractedConfig && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                  <h4 className="text-sm font-semibold text-foreground">Geëxtraheerde parameters</h4>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Parameter</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Waarde</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Offset</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Type</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categorie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractedConfig.parameters.map((param, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-3 py-2">
                              <div>
                                <div className="font-medium text-foreground">{param.name}</div>
                                <div className="text-[10px] text-muted-foreground">{param.description}</div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {param.editable ? (
                                <Input
                                  value={editedParams[param.name] || param.value}
                                  onChange={e => setEditedParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                                  className="text-xs h-7 w-28 font-mono"
                                />
                              ) : (
                                <span className="font-mono text-foreground">{param.value}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{param.offset}</td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-[9px]">{param.type}</Badge>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="secondary" className="text-[9px]">{param.category}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {configAnalysis && !extractedConfig && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown>{configAnalysis}</ReactMarkdown>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Binary Merge tab */}
            <TabsContent value="merge" className="mt-4 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Combineer delen van twee firmware bestanden. De AI analyseert compatibiliteit en genereert een merge-plan.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Bestand A (basis)</label>
                    <Select value={mergeFileA} onValueChange={setMergeFileA}>
                      <SelectTrigger className="text-xs"><SelectValue placeholder="Selecteer basis..." /></SelectTrigger>
                      <SelectContent>
                        {uploadedFiles?.map(f => (
                          <SelectItem key={f.id} value={f.name}>
                            <span className="font-mono text-xs">{getLabel(f.name)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Bestand B (donor)</label>
                    <Select value={mergeFileB} onValueChange={setMergeFileB}>
                      <SelectTrigger className="text-xs"><SelectValue placeholder="Selecteer donor..." /></SelectTrigger>
                      <SelectContent>
                        {uploadedFiles?.map(f => (
                          <SelectItem key={f.id} value={f.name}>
                            <span className="font-mono text-xs">{getLabel(f.name)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  value={mergeInstruction}
                  onChange={e => setMergeInstruction(e.target.value)}
                  placeholder="Beschrijf wat je wilt combineren, bijv. 'Neem de bootloader van A en de applicatie-code van B' of 'Gebruik de OCPP configuratie van A maar de hardware drivers van B'"
                  rows={3}
                  className="text-sm"
                />
                <Button onClick={runMergeAnalysis} disabled={mergeLoading || !mergeFileA || !mergeFileB || !mergeInstruction.trim()} className="gap-2">
                  <Combine className="h-4 w-4" />
                  {mergeLoading ? 'Analyseren...' : 'Analyseer merge'}
                </Button>
              </div>

              {mergeLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              )}

              {mergeAnalysis && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown>{mergeAnalysis}</ReactMarkdown>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default FirmwareEditor;
