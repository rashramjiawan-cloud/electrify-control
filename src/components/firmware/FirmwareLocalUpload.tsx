import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, File, CheckCircle2, XCircle, HardDrive, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import FirmwareFileDetailDialog from './FirmwareFileDetailDialog';

interface ChargePoint {
  id: string;
  name: string;
}

interface FirmwareLocalUploadProps {
  chargePoints: ChargePoint[] | undefined;
}

const FirmwareLocalUpload = ({ chargePoints }: FirmwareLocalUploadProps) => {
  const [selectedCp, setSelectedCp] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [detailFile, setDetailFile] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: uploadedFiles, isLoading: filesLoading } = useQuery({
    queryKey: ['firmware-files'],
    queryFn: async () => {
      // First list root to find folders
      const { data: rootItems, error: rootErr } = await supabase.storage.from('firmware').list('', {
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (rootErr) throw rootErr;

      // Collect all actual files from subfolders
      const allFiles: Array<{ id: string; name: string; created_at: string; metadata: Record<string, unknown> | null; folder: string }> = [];

      for (const item of rootItems || []) {
        // If item has no metadata/id it's a folder — list its contents
        if (!item.id) {
          const { data: folderFiles, error: folderErr } = await supabase.storage.from('firmware').list(item.name, {
            sortBy: { column: 'created_at', order: 'desc' },
          });
          if (!folderErr && folderFiles) {
            for (const f of folderFiles) {
              if (f.id) {
                allFiles.push({ ...f, folder: item.name, name: `${item.name}/${f.name}`, metadata: f.metadata as Record<string, unknown> | null });
              }
            }
          }
        } else {
          allFiles.push({ ...item, folder: '', metadata: item.metadata as Record<string, unknown> | null });
        }
      }

      return allFiles;
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.match(/\.(bin|fw|hex|img|gz|zip)$/i)) {
        toast.error('Ongeldig bestandstype. Ondersteund: .bin, .fw, .hex, .img, .tar.gz, .zip');
        return;
      }
      if (f.size > 100 * 1024 * 1024) {
        toast.error('Bestand is te groot (max 100MB)');
        return;
      }
      setFile(f);
      setProgress(0);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Selecteer eerst een firmware bestand');
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = selectedCp
        ? `${selectedCp}/${timestamp}_${file.name}`
        : `general/${timestamp}_${file.name}`;

      setProgress(30);

      const { error } = await supabase.storage
        .from('firmware')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      setProgress(90);

      if (selectedCp) {
        await supabase.from('firmware_updates').insert({
          charge_point_id: selectedCp,
          type: 'Firmware',
          location: `storage://firmware/${filePath}`,
          status: 'Downloaded',
          retries: 0,
          retry_interval: 0,
        });
      }

      setProgress(100);
      toast.success(`Firmware "${file.name}" geüpload${selectedCp ? ` voor ${chargePoints?.find(cp => cp.id === selectedCp)?.name || selectedCp}` : ''}`);
      setFile(null);
      qc.invalidateQueries({ queryKey: ['firmware-files'] });
      qc.invalidateQueries({ queryKey: ['firmware-updates'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload mislukt';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileName: string) => {
    const { error } = await supabase.storage.from('firmware').remove([fileName]);
    if (error) {
      toast.error('Verwijderen mislukt');
    } else {
      toast.success('Bestand verwijderd');
      qc.invalidateQueries({ queryKey: ['firmware-files'] });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Lokaal firmware bestand uploaden</h3>
            <p className="text-xs text-muted-foreground">Upload een firmware bestand vanaf je computer naar de opslag</p>
          </div>
        </div>

        <div className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label className="text-xs">Laadpaal</Label>
            <Select value={selectedCp} onValueChange={setSelectedCp}>
              <SelectTrigger><SelectValue placeholder="Kies een laadpaal..." /></SelectTrigger>
              <SelectContent>
                {chargePoints?.map(cp => (
                  <SelectItem key={cp.id} value={cp.id}>{cp.name} ({cp.id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Firmware bestand</Label>
            <div
              className="relative rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".bin,.fw,.hex,.img,.tar.gz,.zip"
                onChange={handleFileSelect}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <File className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setProgress(0); }}
                  >
                    <XCircle className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Klik om een bestand te selecteren</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Ondersteund: .bin, .fw, .hex, .img, .tar.gz, .zip (max 100MB)</p>
                </>
              )}
            </div>
          </div>

          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploaden...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {progress === 100 && !uploading && (
            <div className="flex items-center gap-2 text-emerald-500 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Upload voltooid</span>
            </div>
          )}

          <div className="space-y-1">
            <Button onClick={handleUpload} disabled={uploading || !file} className="gap-2">
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploaden...' : 'Firmware uploaden'}
            </Button>
            {!file && (
              <p className="text-xs text-destructive">⚠ Selecteer eerst een firmware bestand</p>
            )}
          </div>
        </div>
      </div>

      {/* Uploaded files list */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Opgeslagen firmware bestanden</h3>
        {filesLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : !uploadedFiles || uploadedFiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <File className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nog geen firmware bestanden geüpload</p>
          </div>
        ) : (
          <div className="space-y-2">
            {uploadedFiles.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => { setDetailFile(f); setDetailOpen(true); }}>
                <div className="flex items-center gap-3">
                  <File className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">{f.name.split('/').pop()}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {f.metadata && typeof f.metadata === 'object' && 'size' in f.metadata
                        ? formatFileSize(f.metadata.size as number)
                        : '—'}{' '}
                      · {formatDate(f.created_at)}
                      {('folder' in f && f.folder) ? ` · 📁 ${f.folder}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDetailFile(f); setDetailOpen(true); }}>
                    <Search className="h-3.5 w-3.5 text-primary" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(f.name); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FirmwareFileDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        file={detailFile}
        chargePoints={chargePoints}
      />
    </div>
  );
};

export default FirmwareLocalUpload;
