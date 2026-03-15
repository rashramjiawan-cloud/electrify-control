import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Info, Binary, Brain, Pencil, Save, Upload, FileType, HardDrive, Calendar, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFirmwareFileMetadata, useUpsertFirmwareFileMetadata } from '@/hooks/useFirmwareFileMetadata';
import { toast } from 'sonner';

interface StorageFile {
  id: string;
  name: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface ChargePoint {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: StorageFile | null;
  chargePoints: ChargePoint[] | undefined;
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

const FirmwareFileDetailDialog = ({ open, onOpenChange, file, chargePoints }: Props) => {
  const [activeTab, setActiveTab] = useState('metadata');
  const [hexData, setHexData] = useState<string>('');
  const [hexLoading, setHexLoading] = useState(false);
  const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedCp, setAssignedCp] = useState('');
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  const filePath = file?.name || '';
  const { data: metadata, isLoading: metaLoading } = useFirmwareFileMetadata(filePath);
  const upsertMeta = useUpsertFirmwareFileMetadata();

  const fileSize = file?.metadata && typeof file.metadata === 'object' && 'size' in file.metadata
    ? (file.metadata.size as number)
    : 0;

  useEffect(() => {
    if (metadata) {
      setLabel(metadata.label || '');
      setNotes(metadata.notes || '');
      setAssignedCp(metadata.assigned_charge_point_id || '');
    } else {
      setLabel('');
      setNotes('');
      setAssignedCp('');
    }
  }, [metadata]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setHexData('');
      setRawBytes(null);
      setAiAnalysis('');
      setReplaceFile(null);
      setActiveTab('metadata');
    }
  }, [open]);

  // Auto-load hex when tab switches to hex
  useEffect(() => {
    if (activeTab === 'hex' && file && !hexData && !hexLoading) {
      loadHex();
    }
  }, [activeTab, file, hexData, hexLoading]);

  const loadHex = useCallback(async () => {
    if (!file || hexData) return;
    setHexLoading(true);
    try {
      const { data, error } = await supabase.storage.from('firmware').download(file.name);
      if (error) throw error;
      const buffer = await data.arrayBuffer();
      const bytes = new Uint8Array(buffer.slice(0, 512));
      setRawBytes(bytes);
      setHexData(bytesToHex(bytes));
    } catch (err) {
      setHexData('Fout bij het laden van hex data');
    } finally {
      setHexLoading(false);
    }
  }, [file, hexData]);

  const runAiAnalysis = async () => {
    if (!file) return;
    setAiLoading(true);
    try {
      // Load hex if not already loaded
      let hexPreview = hexData;
      if (!hexPreview && !rawBytes) {
        const { data, error } = await supabase.storage.from('firmware').download(file.name);
        if (error) throw error;
        const buffer = await data.arrayBuffer();
        const bytes = new Uint8Array(buffer.slice(0, 512));
        setRawBytes(bytes);
        hexPreview = bytesToHex(bytes);
        setHexData(hexPreview);
      }

      const cpInfo = assignedCp
        ? chargePoints?.find(cp => cp.id === assignedCp)?.name || assignedCp
        : undefined;

      const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
        body: {
          fileName: file.name,
          fileSize,
          hexPreview: hexPreview || hexData,
          chargePointInfo: cpInfo,
        },
      });

      if (fnError) throw fnError;
      setAiAnalysis(fnData.analysis || 'Geen analyse beschikbaar.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI analyse mislukt';
      toast.error(msg);
      setAiAnalysis(`Fout: ${msg}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveMeta = async () => {
    try {
      await upsertMeta.mutateAsync({
        file_path: filePath,
        label: label || null,
        notes: notes || null,
        assigned_charge_point_id: assignedCp || null,
      });
      toast.success('Metadata opgeslagen');
    } catch {
      toast.error('Opslaan mislukt');
    }
  };

  const handleReplace = async () => {
    if (!file || !replaceFile) return;
    setReplacing(true);
    try {
      const { error } = await supabase.storage.from('firmware').update(file.name, replaceFile, {
        cacheControl: '3600',
        upsert: true,
      });
      if (error) throw error;
      toast.success('Bestand vervangen');
      setReplaceFile(null);
      // Reset hex/analysis
      setHexData('');
      setRawBytes(null);
      setAiAnalysis('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Vervangen mislukt');
    } finally {
      setReplacing(false);
    }
  };

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <FileType className="h-5 w-5 text-primary" />
            {file.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="metadata" className="gap-1 text-xs"><Info className="h-3 w-3" />Metadata</TabsTrigger>
            <TabsTrigger value="hex" className="gap-1 text-xs"><Binary className="h-3 w-3" />Hex</TabsTrigger>
            <TabsTrigger value="ai" className="gap-1 text-xs"><Brain className="h-3 w-3" />AI Analyse</TabsTrigger>
            <TabsTrigger value="edit" className="gap-1 text-xs"><Pencil className="h-3 w-3" />Bewerken</TabsTrigger>
          </TabsList>

          {/* Metadata tab */}
          <TabsContent value="metadata" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Grootte</p>
                  <p className="text-sm font-medium text-foreground">{fileSize ? formatBytes(fileSize) : '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Upload datum</p>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(file.created_at).toLocaleString('nl-NL', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <FileType className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
                  <p className="text-sm font-medium text-foreground">
                    {file.metadata && typeof file.metadata === 'object' && 'mimetype' in file.metadata
                      ? String(file.metadata.mimetype)
                      : file.name.split('.').pop()?.toUpperCase() || '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ID</p>
                  <p className="text-xs font-mono text-foreground truncate max-w-[180px]">{file.id}</p>
                </div>
              </div>
            </div>

            {metadata && (
              <div className="space-y-2">
                {metadata.label && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Label:</span>
                    <Badge variant="secondary">{metadata.label}</Badge>
                  </div>
                )}
                {metadata.notes && (
                  <div>
                    <span className="text-xs text-muted-foreground">Notities:</span>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3">
                      {metadata.notes}
                    </p>
                  </div>
                )}
                {metadata.assigned_charge_point_id && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Toegewezen aan:</span>
                    <Badge variant="outline">
                      {chargePoints?.find(cp => cp.id === metadata.assigned_charge_point_id)?.name || metadata.assigned_charge_point_id}
                    </Badge>
                  </div>
                )}
              </div>
            )}
            {metaLoading && <Skeleton className="h-16 w-full" />}
          </TabsContent>

          {/* Hex viewer tab */}
          <TabsContent value="hex" className="mt-4">
            {hexLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : hexData ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Eerste 512 bytes van het bestand</p>
                <pre className="rounded-lg border border-border bg-muted/30 p-4 text-[11px] font-mono text-foreground overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">
                  {hexData}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Klik op het tabblad om hex data te laden</p>
            )}
          </TabsContent>

          {/* AI Analysis tab */}
          <TabsContent value="ai" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                AI analyseert de bestandsnaam, grootte en binaire inhoud om informatie te verstrekken.
              </p>
              <Button size="sm" onClick={runAiAnalysis} disabled={aiLoading} className="gap-2">
                <Brain className="h-3.5 w-3.5" />
                {aiLoading ? 'Analyseren...' : 'Analyseer'}
              </Button>
            </div>
            {aiLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : aiAnalysis ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {aiAnalysis}
              </div>
            ) : null}
          </TabsContent>

          {/* Edit tab */}
          <TabsContent value="edit" className="mt-4 space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Label / hernoemen</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="bijv. Alfen Eve v4.9.0-beta"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Toewijzen aan laadpaal</Label>
                <Select value={assignedCp || 'none'} onValueChange={(v) => setAssignedCp(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Geen toewijzing" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geen toewijzing</SelectItem>
                    {chargePoints?.map(cp => (
                      <SelectItem key={cp.id} value={cp.id}>{cp.name} ({cp.id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notities</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opmerkingen over deze firmware versie..."
                  rows={3}
                  className="text-sm"
                />
              </div>

              <Button onClick={handleSaveMeta} disabled={upsertMeta.isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {upsertMeta.isPending ? 'Opslaan...' : 'Metadata opslaan'}
              </Button>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <Label className="text-xs font-semibold">Bestand vervangen</Label>
              <p className="text-[10px] text-muted-foreground">Upload een nieuw bestand om het huidige te overschrijven (zelfde pad).</p>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".bin,.fw,.hex,.img,.tar.gz,.zip"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                  className="text-xs"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleReplace}
                  disabled={!replaceFile || replacing}
                  className="gap-1 shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {replacing ? 'Vervangen...' : 'Vervang'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default FirmwareFileDetailDialog;
