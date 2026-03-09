import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useFirmwareUpdates, useUpdateFirmware, useGetDiagnostics, type FirmwareUpdate } from '@/hooks/useFirmwareUpdates';
import { toast } from 'sonner';
import { Upload, FileText, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Globe, HardDrive } from 'lucide-react';

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  Pending: { icon: Clock, color: 'text-yellow-500', label: 'Wachten' },
  Downloading: { icon: Loader2, color: 'text-blue-400', label: 'Downloaden' },
  Downloaded: { icon: CheckCircle2, color: 'text-blue-500', label: 'Gedownload' },
  Installing: { icon: Loader2, color: 'text-primary', label: 'Installeren' },
  Installed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Geïnstalleerd' },
  InstallationFailed: { icon: XCircle, color: 'text-destructive', label: 'Installatie mislukt' },
  DownloadFailed: { icon: XCircle, color: 'text-destructive', label: 'Download mislukt' },
  Idle: { icon: Clock, color: 'text-muted-foreground', label: 'Idle' },
  Uploading: { icon: Loader2, color: 'text-blue-400', label: 'Uploaden' },
  Uploaded: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Geüpload' },
  UploadFailed: { icon: XCircle, color: 'text-destructive', label: 'Upload mislukt' },
};

interface ChargePoint {
  id: string;
  name: string;
}

interface FirmwareRemoteUpdateProps {
  chargePoints: ChargePoint[] | undefined;
}

const FirmwareRemoteUpdate = ({ chargePoints }: FirmwareRemoteUpdateProps) => {
  const { data: updates, isLoading } = useFirmwareUpdates();
  const updateFirmware = useUpdateFirmware();
  const getDiagnostics = useGetDiagnostics();

  const [fwDialogOpen, setFwDialogOpen] = useState(false);
  const [diagDialogOpen, setDiagDialogOpen] = useState(false);
  const [selectedCp, setSelectedCp] = useState('');
  const [fwLocation, setFwLocation] = useState('');
  const [fwRetries, setFwRetries] = useState('3');
  const [fwRetryInterval, setFwRetryInterval] = useState('60');
  const [diagLocation, setDiagLocation] = useState('');

  const handleFirmwareUpdate = async () => {
    if (!selectedCp || !fwLocation) {
      toast.error('Selecteer een laadpaal en vul de firmware URL in');
      return;
    }
    try {
      await updateFirmware.mutateAsync({
        chargePointId: selectedCp,
        location: fwLocation,
        retries: Number(fwRetries),
        retryInterval: Number(fwRetryInterval),
      });
      toast.success('Firmware update verstuurd');
      setFwDialogOpen(false);
      setFwLocation('');
    } catch {
      toast.error('Fout bij versturen firmware update');
    }
  };

  const handleGetDiagnostics = async () => {
    if (!selectedCp || !diagLocation) {
      toast.error('Selecteer een laadpaal en vul de upload URL in');
      return;
    }
    try {
      await getDiagnostics.mutateAsync({
        chargePointId: selectedCp,
        location: diagLocation,
      });
      toast.success('Diagnostics aanvraag verstuurd');
      setDiagDialogOpen(false);
      setDiagLocation('');
    } catch {
      toast.error('Fout bij aanvragen diagnostics');
    }
  };

  const getCpName = (id: string) => chargePoints?.find(cp => cp.id === id)?.name || id;
  const getStatusInfo = (status: string) => statusConfig[status] || { icon: AlertTriangle, color: 'text-muted-foreground', label: status };
  const formatDate = (d: string) => new Date(d).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Remote firmware updates</h3>
            <p className="text-xs text-muted-foreground">{updates?.length || 0} firmware/diagnostics acties</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setDiagDialogOpen(true)}>
            <FileText className="h-4 w-4" />
            Diagnostics ophalen
          </Button>
          <Button className="gap-2" onClick={() => setFwDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            Firmware update
          </Button>
        </div>
      </div>

      {/* Updates list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : !updates || updates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <HardDrive className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Geen firmware updates of diagnostics</p>
          <p className="text-xs text-muted-foreground mt-1">Stuur een remote firmware update via URL om te beginnen</p>
        </div>
      ) : (
        <div className="space-y-3">
          {updates.map(update => {
            const statusInfo = getStatusInfo(update.status);
            const StatusIcon = statusInfo.icon;
            const isSpinning = ['Downloading', 'Installing', 'Uploading'].includes(update.status);

            return (
              <div key={update.id} className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${update.type === 'Firmware' ? 'bg-primary/10' : 'bg-muted'}`}>
                      {update.type === 'Firmware'
                        ? <Upload className="h-4 w-4 text-primary" />
                        : <FileText className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {getCpName(update.charge_point_id)}
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                          {update.type}
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-md" title={update.location}>
                        {update.location}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`flex items-center gap-1.5 ${statusInfo.color}`}>
                        <StatusIcon className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} />
                        <span className="text-xs font-medium">{statusInfo.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {formatDate(update.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>
                {update.error_message && (
                  <div className="mt-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2">
                    <p className="text-xs text-destructive font-mono">{update.error_message}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Firmware Update Dialog */}
      <Dialog open={fwDialogOpen} onOpenChange={setFwDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remote Firmware Update</DialogTitle>
            <DialogDescription>Stuur een firmware update naar een laadpaal via een externe URL (OCPP UpdateFirmware)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Laadpaal</Label>
              <Select value={selectedCp} onValueChange={setSelectedCp}>
                <SelectTrigger><SelectValue placeholder="Kies..." /></SelectTrigger>
                <SelectContent>
                  {chargePoints?.map(cp => (
                    <SelectItem key={cp.id} value={cp.id}>{cp.name} ({cp.id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Firmware URL</Label>
              <Input
                value={fwLocation}
                onChange={e => setFwLocation(e.target.value)}
                placeholder="https://firmware.example.com/v5.1.0.bin"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Retries</Label>
                <Input value={fwRetries} onChange={e => setFwRetries(e.target.value)} type="number" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Retry interval (sec)</Label>
                <Input value={fwRetryInterval} onChange={e => setFwRetryInterval(e.target.value)} type="number" className="font-mono text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFwDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleFirmwareUpdate} disabled={updateFirmware.isPending}>
              {updateFirmware.isPending ? 'Versturen...' : 'Update versturen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diagnostics Dialog */}
      <Dialog open={diagDialogOpen} onOpenChange={setDiagDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Diagnostics ophalen</DialogTitle>
            <DialogDescription>Vraag diagnostics aan via OCPP GetDiagnostics</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Laadpaal</Label>
              <Select value={selectedCp} onValueChange={setSelectedCp}>
                <SelectTrigger><SelectValue placeholder="Kies..." /></SelectTrigger>
                <SelectContent>
                  {chargePoints?.map(cp => (
                    <SelectItem key={cp.id} value={cp.id}>{cp.name} ({cp.id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Upload URL</Label>
              <Input
                value={diagLocation}
                onChange={e => setDiagLocation(e.target.value)}
                placeholder="ftp://diagnostics.example.com/uploads/"
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">De laadpaal uploadt het diagnostics bestand naar deze URL</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiagDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleGetDiagnostics} disabled={getDiagnostics.isPending}>
              {getDiagnostics.isPending ? 'Aanvragen...' : 'Diagnostics aanvragen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FirmwareRemoteUpdate;
