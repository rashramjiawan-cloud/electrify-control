import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompareArrows, Brain, File, ArrowRight, AlertTriangle, CheckCircle2, Info, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAllFirmwareFileMetadata, useUpsertFirmwareFileMetadata } from '@/hooks/useFirmwareFileMetadata';
import { toast } from 'sonner';

interface StorageFile {
  id: string;
  name: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  folder: string;
}

function bytesToHexLines(bytes: Uint8Array): string[] {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const hexParts: string[] = [];
    for (let j = 0; j < 16; j++) {
      if (i + j < bytes.length) {
        hexParts.push(bytes[i + j].toString(16).padStart(2, '0'));
      }
    }
    lines.push(hexParts.join(' '));
  }
  return lines;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FirmwareCompare = () => {
  const [fileA, setFileA] = useState('');
  const [fileB, setFileB] = useState('');
  const [comparing, setComparing] = useState(false);
  const [diffResult, setDiffResult] = useState<{ identical: number; changed: number; added: number; removed: number; diffLines: { offset: string; a: string; b: string; type: 'same' | 'changed' | 'added' | 'removed' }[] } | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAllDiffs, setShowAllDiffs] = useState(false);

  const { data: allMetadata } = useAllFirmwareFileMetadata();

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

  const runCompare = async () => {
    if (!fileA || !fileB) { toast.error('Selecteer twee bestanden'); return; }
    if (fileA === fileB) { toast.error('Kies twee verschillende bestanden'); return; }
    setComparing(true);
    setDiffResult(null);
    setAiAnalysis('');
    setShowAllDiffs(false);
    try {
      const [resA, resB] = await Promise.all([
        supabase.storage.from('firmware').download(fileA),
        supabase.storage.from('firmware').download(fileB),
      ]);
      if (resA.error) throw resA.error;
      if (resB.error) throw resB.error;

      const bytesA = new Uint8Array(await resA.data.arrayBuffer());
      const bytesB = new Uint8Array(await resB.data.arrayBuffer());

      const linesA = bytesToHexLines(bytesA);
      const linesB = bytesToHexLines(bytesB);
      const maxLen = Math.max(linesA.length, linesB.length);

      let identical = 0, changed = 0, added = 0, removed = 0;
      const diffLines: { offset: string; a: string; b: string; type: 'same' | 'changed' | 'added' | 'removed' }[] = [];

      for (let i = 0; i < maxLen; i++) {
        const a = linesA[i] || '';
        const b = linesB[i] || '';
        const offset = (i * 16).toString(16).padStart(8, '0');
        if (a && b && a === b) {
          identical++;
          diffLines.push({ offset, a, b, type: 'same' });
        } else if (a && b) {
          changed++;
          diffLines.push({ offset, a, b, type: 'changed' });
        } else if (!a && b) {
          added++;
          diffLines.push({ offset, a: '', b, type: 'added' });
        } else {
          removed++;
          diffLines.push({ offset, a, b: '', type: 'removed' });
        }
      }

      setDiffResult({ identical, changed, added, removed, diffLines });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Vergelijking mislukt');
    } finally {
      setComparing(false);
    }
  };

  const runAiCompare = async () => {
    if (!diffResult || !fileA || !fileB) return;
    setAiLoading(true);
    try {
      // Collect changed lines summary for AI (limit to prevent token overflow)
      const changedLines = diffResult.diffLines
        .filter(d => d.type !== 'same')
        .slice(0, 200);

      const diffSummary = changedLines.map(d =>
        `${d.offset}: [${d.type.toUpperCase()}] A: ${d.a || '(leeg)'} → B: ${d.b || '(leeg)'}`
      ).join('\n');

      const fileAInfo = uploadedFiles?.find(f => f.name === fileA);
      const fileBInfo = uploadedFiles?.find(f => f.name === fileB);
      const sizeA = fileAInfo?.metadata && 'size' in fileAInfo.metadata ? fileAInfo.metadata.size as number : 0;
      const sizeB = fileBInfo?.metadata && 'size' in fileBInfo.metadata ? fileBInfo.metadata.size as number : 0;

      const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-firmware', {
        body: {
          mode: 'compare',
          fileNameA: fileA,
          fileNameB: fileB,
          fileSizeA: sizeA,
          fileSizeB: sizeB,
          labelA: getLabel(fileA),
          labelB: getLabel(fileB),
          stats: {
            identical: diffResult.identical,
            changed: diffResult.changed,
            added: diffResult.added,
            removed: diffResult.removed,
            totalA: diffResult.diffLines.filter(d => d.a).length,
            totalB: diffResult.diffLines.filter(d => d.b).length,
          },
          diffSummary,
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

  const visibleDiffs = useMemo(() => {
    if (!diffResult) return [];
    if (showAllDiffs) return diffResult.diffLines.filter(d => d.type !== 'same');
    return diffResult.diffLines.filter(d => d.type !== 'same').slice(0, 50);
  }, [diffResult, showAllDiffs]);

  const totalChanges = diffResult ? diffResult.changed + diffResult.added + diffResult.removed : 0;

  return (
    <div className="space-y-6">
      {/* Selection */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <GitCompareArrows className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Firmware vergelijken</h3>
            <p className="text-xs text-muted-foreground">Vergelijk twee firmware bestanden en analyseer de verschillen</p>
          </div>
        </div>

        {filesLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr,auto] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Oud (referentie)</label>
              <Select value={fileA} onValueChange={setFileA}>
                <SelectTrigger><SelectValue placeholder="Selecteer oud bestand..." /></SelectTrigger>
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
            </div>

            <div className="flex items-center justify-center py-2">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nieuw (update)</label>
              <Select value={fileB} onValueChange={setFileB}>
                <SelectTrigger><SelectValue placeholder="Selecteer nieuw bestand..." /></SelectTrigger>
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
            </div>

            <Button onClick={runCompare} disabled={comparing || !fileA || !fileB} className="gap-2">
              <GitCompareArrows className="h-4 w-4" />
              {comparing ? 'Vergelijken...' : 'Vergelijk'}
            </Button>
          </div>
        )}
      </div>

      {/* Comparison results */}
      {comparing && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {diffResult && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{diffResult.identical}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Identiek</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{diffResult.changed}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gewijzigd</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <ArrowRight className="h-5 w-5 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{diffResult.added}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Toegevoegd</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <Info className="h-5 w-5 text-red-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{diffResult.removed}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verwijderd</p>
            </div>
          </div>

          {/* Similarity bar */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Overeenkomst</span>
              <span className="text-xs font-bold text-foreground">
                {((diffResult.identical / (diffResult.identical + totalChanges)) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(diffResult.identical / (diffResult.identical + totalChanges)) * 100}%` }} />
              <div className="bg-amber-500 h-full transition-all" style={{ width: `${(diffResult.changed / (diffResult.identical + totalChanges)) * 100}%` }} />
              <div className="bg-blue-500 h-full transition-all" style={{ width: `${(diffResult.added / (diffResult.identical + totalChanges)) * 100}%` }} />
              <div className="bg-red-500 h-full transition-all" style={{ width: `${(diffResult.removed / (diffResult.identical + totalChanges)) * 100}%` }} />
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Identiek</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Gewijzigd</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Toegevoegd</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Verwijderd</span>
            </div>
          </div>

          {/* Diff table */}
          {totalChanges > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground">Verschillen ({totalChanges} regels)</h4>
                <Button size="sm" variant="outline" onClick={runAiCompare} disabled={aiLoading} className="gap-1.5 text-xs">
                  <Brain className="h-3.5 w-3.5" />
                  {aiLoading ? 'Analyseren...' : 'AI Analyse'}
                </Button>
              </div>

              <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-[11px] font-mono">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium w-[80px]">Offset</th>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Oud</th>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Nieuw</th>
                      <th className="px-2 py-1.5 text-center text-muted-foreground font-medium w-[70px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDiffs.map((d, i) => (
                      <tr key={i} className={
                        d.type === 'changed' ? 'bg-amber-500/5' :
                        d.type === 'added' ? 'bg-blue-500/5' :
                        d.type === 'removed' ? 'bg-red-500/5' : ''
                      }>
                        <td className="px-2 py-1 text-muted-foreground">{d.offset}</td>
                        <td className="px-2 py-1 text-foreground">{d.a || <span className="text-muted-foreground italic">—</span>}</td>
                        <td className="px-2 py-1 text-foreground">{d.b || <span className="text-muted-foreground italic">—</span>}</td>
                        <td className="px-2 py-1 text-center">
                          <Badge variant="outline" className={`text-[9px] ${
                            d.type === 'changed' ? 'border-amber-500/30 text-amber-600' :
                            d.type === 'added' ? 'border-blue-500/30 text-blue-600' :
                            'border-red-500/30 text-red-600'
                          }`}>
                            {d.type === 'changed' ? 'GEWIJZIGD' : d.type === 'added' ? 'NIEUW' : 'VERWIJDERD'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!showAllDiffs && totalChanges > 50 && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs w-full" onClick={() => setShowAllDiffs(true)}>
                  Toon alle {totalChanges} verschillen
                </Button>
              )}
            </div>
          )}

          {totalChanges === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-foreground">Bestanden zijn identiek</h4>
              <p className="text-xs text-muted-foreground mt-1">Er zijn geen verschillen gevonden tussen de twee firmware bestanden.</p>
            </div>
          )}

          {/* AI Analysis result */}
          {aiLoading && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {aiAnalysis && !aiLoading && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-primary">AI Vergelijkingsanalyse</h4>
              </div>
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {aiAnalysis}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FirmwareCompare;
