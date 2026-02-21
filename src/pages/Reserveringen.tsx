import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useChargePoints } from '@/hooks/useChargePoints';
import { useReservations, useReserveNow, useCancelReservation } from '@/hooks/useReservations';
import { toast } from 'sonner';
import { CalendarClock, Plus, XCircle, Clock, CheckCircle2, Ban, Zap, AlertTriangle } from 'lucide-react';

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  Reserved: { icon: CalendarClock, color: 'text-blue-400', label: 'Gereserveerd' },
  Accepted: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Geaccepteerd' },
  Rejected: { icon: XCircle, color: 'text-destructive', label: 'Geweigerd' },
  Occupied: { icon: Zap, color: 'text-yellow-500', label: 'Bezet' },
  Expired: { icon: Clock, color: 'text-muted-foreground', label: 'Verlopen' },
  Cancelled: { icon: Ban, color: 'text-muted-foreground', label: 'Geannuleerd' },
  Used: { icon: CheckCircle2, color: 'text-primary', label: 'Gebruikt' },
};

const Reserveringen = () => {
  const { data: chargePoints } = useChargePoints();
  const { data: reservations, isLoading } = useReservations();
  const reserveNow = useReserveNow();
  const cancelReservation = useCancelReservation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCp, setSelectedCp] = useState('');
  const [connectorId, setConnectorId] = useState('1');
  const [idTag, setIdTag] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState('30');

  const handleReserve = async () => {
    if (!selectedCp || !idTag) {
      toast.error('Selecteer een laadpaal en vul een RFID tag in');
      return;
    }
    const expiryDate = new Date(Date.now() + Number(expiryMinutes) * 60_000).toISOString();
    try {
      const result = await reserveNow.mutateAsync({
        chargePointId: selectedCp,
        connectorId: Number(connectorId),
        idTag,
        expiryDate,
      });
      const status = result?.[2]?.status;
      if (status === 'Accepted') {
        toast.success('Reservering aangemaakt');
        setDialogOpen(false);
      } else {
        toast.error(`Reservering ${status || 'mislukt'}`);
      }
    } catch {
      toast.error('Fout bij aanmaken reservering');
    }
  };

  const handleCancel = async (reservation: { id: number; charge_point_id: string }) => {
    try {
      const result = await cancelReservation.mutateAsync({
        chargePointId: reservation.charge_point_id,
        reservationId: reservation.id,
      });
      const status = result?.[2]?.status;
      if (status === 'Accepted') {
        toast.success('Reservering geannuleerd');
      } else {
        toast.error(`Annulering ${status || 'mislukt'}`);
      }
    } catch {
      toast.error('Fout bij annuleren reservering');
    }
  };

  const getCpName = (id: string) => chargePoints?.find(cp => cp.id === id)?.name || id;

  const getStatusInfo = (status: string) =>
    statusConfig[status] || { icon: AlertTriangle, color: 'text-muted-foreground', label: status };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('nl-NL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const isExpired = (expiryDate: string, status: string) =>
    status === 'Reserved' && new Date(expiryDate) < new Date();

  const activeReservations = reservations?.filter(r => r.status === 'Reserved') || [];

  return (
    <AppLayout title="Reserveringen" subtitle="Laadpunt reserveringen beheren via OCPP">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {activeReservations.length} actieve reservering{activeReservations.length !== 1 ? 'en' : ''}
            </p>
          </div>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nieuwe reservering
          </Button>
        </div>

        {/* Reservations list */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Laden...</div>
        ) : !reservations || reservations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <CalendarClock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Geen reserveringen</p>
            <p className="text-xs text-muted-foreground mt-1">Maak een reservering aan om een laadpunt te reserveren</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map(reservation => {
              const expired = isExpired(reservation.expiry_date, reservation.status);
              const displayStatus = expired ? 'Expired' : reservation.status;
              const statusInfo = getStatusInfo(displayStatus);
              const StatusIcon = statusInfo.icon;

              return (
                <div key={reservation.id} className="rounded-xl border border-border bg-card px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        displayStatus === 'Reserved' ? 'bg-blue-500/10' : 'bg-muted'
                      }`}>
                        <CalendarClock className={`h-4 w-4 ${
                          displayStatus === 'Reserved' ? 'text-blue-400' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {getCpName(reservation.charge_point_id)}
                          <span className="font-mono text-xs text-muted-foreground">
                            Connector {reservation.connector_id}
                          </span>
                        </h3>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">
                            Tag: {reservation.id_tag}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Verloopt: {formatDate(reservation.expiry_date)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1.5 ${statusInfo.color}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{statusInfo.label}</span>
                      </div>
                      {reservation.status === 'Reserved' && !expired && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => handleCancel(reservation)}
                          disabled={cancelReservation.isPending}
                        >
                          <Ban className="h-3 w-3" />
                          Annuleer
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reserve Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe reservering</DialogTitle>
            <DialogDescription>Reserveer een laadpunt via OCPP ReserveNow</DialogDescription>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Connector ID</Label>
                <Input value={connectorId} onChange={e => setConnectorId(e.target.value)} type="number" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Verloopt over (min)</Label>
                <Input value={expiryMinutes} onChange={e => setExpiryMinutes(e.target.value)} type="number" className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RFID Tag</Label>
              <Input
                value={idTag}
                onChange={e => setIdTag(e.target.value)}
                placeholder="RFID-SIM-001"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleReserve} disabled={reserveNow.isPending}>
              {reserveNow.isPending ? 'Reserveren...' : 'Reserveren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Reserveringen;
