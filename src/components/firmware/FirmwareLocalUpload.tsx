import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, File, CheckCircle2, XCircle, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.match(/\.(bin|fw|hex|img|tar\.gz|zip)$/i)) {
        toast.error('Ongeldig bestandstype. Ondersteund: .bin, .fw, .hex, .img, .tar.gz, .zip');
        return;
      }
      setFile(f);
      setProgress(0);
    }
  };

  const handleUpload = async () => {
    if (!selectedCp) {
      toast.error('Selecteer eerst een laadpaal');
      return;
    }
    if (!file) {
      toast.error('Selecteer eerst een firmware bestand');
      return;
    }

    setUploading(true);
    setProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.random() * 15;
      });
    }, 500);

    // Simulate upload completion
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setUploading(false);
      toast.success(`Firmware bestand "${file.name}" klaargezet voor ${chargePoints?.find(cp => cp.id === selectedCp)?.name || selectedCp}`);
    }, 3000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Lokaal firmware bestand uploaden</h3>
            <p className="text-xs text-muted-foreground">Upload een firmware bestand vanaf je computer naar een laadpaal</p>
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
                  <p className="text-[10px] text-muted-foreground mt-1">Ondersteund: .bin, .fw, .hex, .img, .tar.gz, .zip</p>
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

          <Button onClick={handleUpload} disabled={uploading || !file || !selectedCp} className="gap-2">
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploaden...' : 'Firmware uploaden'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FirmwareLocalUpload;
