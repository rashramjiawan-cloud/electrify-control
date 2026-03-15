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
import { Info, Binary, Brain, Pencil, Save, Upload, FileType, HardDrive, Calendar, Hash, ArrowRight, MessageSquare, RotateCcw } from 'lucide-react';
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
  const [hexMode, setHexMode] = useState<'preview' | 'full'>('preview');
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [hexDecode, setHexDecode] = useState<string>('');
  const [hexDecodeLoading, setHexDecodeLoading] = useState(false);
  const [decodeNextSteps, setDecodeNextSteps] = useState<{ title: string; description: string }[]>([]);
  const [decodeHistory, setDecodeHistory] = useState<{ role: string; content: string }[]>([]);
  const [decodeConversation, setDecodeConversation] = useState<{ role: string; text: string }[]>([]);
  const [customFollowUp, setCustomFollowUp] = useState('');
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
      if (metadata.ai_decode) {
        setHexDecode(metadata.ai_decode);
        // Restore saved conversation so the UI displays the saved analysis
        if (decodeConversation.length === 0) {
          const parts = metadata.ai_decode.split('\n\n---\n\n');
          const restored: { role: string; text: string }[] = [];
          parts.forEach((part, i) => {
            if (part.startsWith('> ')) {
              restored.push({ role: 'user', text: part.replace(/^> /, '') });
            } else {
              restored.push({ role: 'assistant', text: part });
            }
          });
          setDecodeConversation(restored);
        }
      }
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
      setHexDecode('');
      setDecodeNextSteps([]);
      setDecodeHistory([]);
      setDecodeConversation([]);
      setCustomFollowUp('');
      setReplaceFile(null);
      setActiveTab('metadata');
      setHexMode('preview');
    }
  }, [open]);

  // Auto-load hex when tab switches to hex
  useEffect(() => {
    if (activeTab === 'hex' && file && !hexData && !hexLoading) {
      loadHex(hexMode);
    }
  }, [activeTab, file, hexData, hexLoading]);

  // Reload when hexMode changes
  useEffect(() => {
    if (activeTab === 'hex' && file) {
      loadHex(hexMode);
    }
  }, [hexMode]);

  const loadHex = useCallback(async (mode: 'preview' | 'full') => {
    if (!file) return;
    setHexLoading(true);
    setHexData('');
    setRawBytes(null);
    try {
      const { data, error } = await supabase.storage.from('firmware').download(file.name);
      if (error) throw error;
      const buffer = await data.arrayBuffer();
      const bytes = new Uint8Array(mode === 'preview' ? buffer.slice(0, 512) : buffer);
      setRawBytes(bytes);
      setHexData(bytesToHex(bytes));
    } catch (err) {
      setHexData('Fout bij het laden van hex data');
    } finally {
      setHexLoading(false);
    }
  }, [file]);

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
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {hexMode === 'preview' ? 'Eerste 512 bytes' : `Volledig bestand (${fileSize ? formatBytes(fileSize) : '?'})`}
                    </p>
                    <div className="flex rounded-md border border-border overflow-hidden">
                      <button
                        className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${hexMode === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted'}`}
                        onClick={() => setHexMode('preview')}
                      >512 bytes</button>
                      <button
                        className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${hexMode === 'full' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted'}`}
                        onClick={() => setHexMode('full')}
                      >Alles</button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!file) return;
                      setHexDecodeLoading(true);
                      setHexDecode('');
                      setDecodeNextSteps([]);
                      setDecodeHistory([]);
                      setDecodeConversation([]);
                      try {
                        const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
                          body: { fileName: file.name, fileSize, hexPreview: hexData, mode: 'decode' },
                        });
                        if (fnError) throw fnError;
                        const analysis = fnData.analysis || 'Geen decodering beschikbaar.';
                        setHexDecode(analysis);
                        setDecodeNextSteps(fnData.nextSteps || []);
                        setDecodeHistory([
                          { role: 'user', content: `Decodeer hex dump van ${file.name}` },
                          { role: 'assistant', content: analysis },
                        ]);
                        setDecodeConversation([
                          { role: 'assistant', text: analysis },
                        ]);
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : 'Decodering mislukt';
                        toast.error(msg);
                        setHexDecode(`Fout: ${msg}`);
                      } finally {
                        setHexDecodeLoading(false);
                      }
                    }}
                    disabled={hexDecodeLoading}
                    className="gap-1.5 text-xs"
                  >
                    <Brain className="h-3.5 w-3.5" />
                    {hexDecodeLoading ? 'Decoderen...' : decodeConversation.length > 0 ? 'Opnieuw analyseren' : 'Decodeer met AI'}
                  </Button>
                </div>
                <pre className="rounded-lg border border-border bg-muted/30 p-4 text-[11px] font-mono text-foreground overflow-x-auto max-h-[250px] overflow-y-auto leading-relaxed">
                  {hexData}
                </pre>
                {hexDecodeLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                )}

                {/* Interactive conversation */}
                {decodeConversation.length > 0 && (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {decodeConversation.map((msg, i) => (
                      <div key={i} className={`rounded-lg border p-4 text-sm whitespace-pre-wrap leading-relaxed ${
                        msg.role === 'assistant'
                          ? 'border-primary/20 bg-primary/5'
                          : 'border-accent bg-accent/30 ml-8'
                      }`}>
                        {msg.role === 'assistant' && i === 0 && (
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Brain className="h-4 w-4 text-primary" />
                              <span className="text-xs font-semibold text-primary">AI Hex Decodering</span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs h-7"
                              onClick={async () => {
                                const fullText = decodeConversation
                                  .map(m => m.role === 'assistant' ? m.text : `> ${m.text}`)
                                  .join('\n\n---\n\n');
                                try {
                                  await upsertMeta.mutateAsync({
                                    file_path: filePath,
                                    label: label || null,
                                    notes: notes || null,
                                    ai_decode: fullText || null,
                                    assigned_charge_point_id: assignedCp || null,
                                  });
                                  toast.success('Volledige AI analyse opgeslagen');
                                } catch {
                                  toast.error('Opslaan mislukt');
                                }
                              }}
                            >
                              <Save className="h-3 w-3" />
                              Opslaan
                            </Button>
                          </div>
                        )}
                        {msg.role === 'user' && (
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground">Vervolgvraag</span>
                          </div>
                        )}
                        {msg.role === 'assistant' && i > 0 && (
                          <div className="flex items-center gap-2 mb-1">
                            <Brain className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-semibold text-primary">AI Antwoord</span>
                          </div>
                        )}
                        <div className="text-foreground">{msg.text}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Next steps buttons */}
                {decodeNextSteps.length > 0 && !hexDecodeLoading && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Volgende stappen</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {decodeNextSteps.map((step, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="h-auto py-2.5 px-3 justify-start text-left gap-2 whitespace-normal"
                          disabled={hexDecodeLoading}
                          onClick={async () => {
                            if (!file) return;
                            setHexDecodeLoading(true);
                            const question = `${step.title}: ${step.description}`;
                            setDecodeConversation(prev => [...prev, { role: 'user', text: question }]);
                            try {
                              const newHistory = [
                                ...decodeHistory,
                                { role: 'user', content: question },
                              ];
                              const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
                                body: {
                                  fileName: file.name,
                                  fileSize,
                                  hexPreview: hexData,
                                  mode: 'followup',
                                  followUp: question,
                                  conversationHistory: newHistory,
                                },
                              });
                              if (fnError) throw fnError;
                              const answer = fnData.analysis || 'Geen antwoord.';
                              setDecodeConversation(prev => [...prev, { role: 'assistant', text: answer }]);
                              setDecodeHistory([...newHistory, { role: 'assistant', content: answer }]);
                              setDecodeNextSteps(fnData.nextSteps || []);
                              setHexDecode(prev => prev + '\n\n---\n\n' + answer);
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : 'Vervolgvraag mislukt';
                              toast.error(msg);
                              setDecodeConversation(prev => [...prev, { role: 'assistant', text: `Fout: ${msg}` }]);
                            } finally {
                              setHexDecodeLoading(false);
                            }
                          }}
                        >
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <div>
                            <div className="text-xs font-semibold">{step.title}</div>
                            <div className="text-[11px] text-muted-foreground font-normal">{step.description}</div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom follow-up input */}
                {decodeConversation.length > 0 && !hexDecodeLoading && (
                  <div className="flex gap-2">
                    <Input
                      value={customFollowUp}
                      onChange={e => setCustomFollowUp(e.target.value)}
                      placeholder="Stel een eigen vervolgvraag..."
                      className="text-xs h-9"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && customFollowUp.trim() && file) {
                          e.preventDefault();
                          const question = customFollowUp.trim();
                          setCustomFollowUp('');
                          setHexDecodeLoading(true);
                          setDecodeConversation(prev => [...prev, { role: 'user', text: question }]);
                          try {
                            const newHistory = [...decodeHistory, { role: 'user', content: question }];
                            const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
                              body: {
                                fileName: file.name,
                                fileSize,
                                hexPreview: hexData,
                                mode: 'followup',
                                followUp: question,
                                conversationHistory: newHistory,
                              },
                            });
                            if (fnError) throw fnError;
                            const answer = fnData.analysis || 'Geen antwoord.';
                            setDecodeConversation(prev => [...prev, { role: 'assistant', text: answer }]);
                            setDecodeHistory([...newHistory, { role: 'assistant', content: answer }]);
                            setDecodeNextSteps(fnData.nextSteps || []);
                            setHexDecode(prev => prev + '\n\n---\n\n' + answer);
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : 'Vervolgvraag mislukt';
                            toast.error(msg);
                            setDecodeConversation(prev => [...prev, { role: 'assistant', text: `Fout: ${msg}` }]);
                          } finally {
                            setHexDecodeLoading(false);
                          }
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 text-xs shrink-0"
                      disabled={!customFollowUp.trim() || hexDecodeLoading}
                      onClick={async () => {
                        if (!file || !customFollowUp.trim()) return;
                        const question = customFollowUp.trim();
                        setCustomFollowUp('');
                        setHexDecodeLoading(true);
                        setDecodeConversation(prev => [...prev, { role: 'user', text: question }]);
                        try {
                          const newHistory = [...decodeHistory, { role: 'user', content: question }];
                          const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
                            body: {
                              fileName: file.name,
                              fileSize,
                              hexPreview: hexData,
                              mode: 'followup',
                              followUp: question,
                              conversationHistory: newHistory,
                            },
                          });
                          if (fnError) throw fnError;
                          const answer = fnData.analysis || 'Geen antwoord.';
                          setDecodeConversation(prev => [...prev, { role: 'assistant', text: answer }]);
                          setDecodeHistory([...newHistory, { role: 'assistant', content: answer }]);
                          setDecodeNextSteps(fnData.nextSteps || []);
                          setHexDecode(prev => prev + '\n\n---\n\n' + answer);
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : 'Vervolgvraag mislukt';
                          toast.error(msg);
                          setDecodeConversation(prev => [...prev, { role: 'assistant', text: `Fout: ${msg}` }]);
                        } finally {
                          setHexDecodeLoading(false);
                        }
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Vraag
                    </Button>
                  </div>
                )}
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
