import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChargingTariffs, useCreateTariff, useUpdateTariff, useDeleteTariff } from '@/hooks/useChargingTariffs';
import { useChargePoints } from '@/hooks/useChargePoints';
import { Plus, Pencil, Trash2, Euro, Zap, Star } from 'lucide-react';
import { toast } from 'sonner';

const Tarieven = () => {
  const { data: tariffs, isLoading } = useChargingTariffs();
  const { data: chargePoints } = useChargePoints();
  const createTariff = useCreateTariff();
  const updateTariff = useUpdateTariff();
  const deleteTariff = useDeleteTariff();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState('');

  const [formName, setFormName] = useState('');
  const [formPriceKwh, setFormPriceKwh] = useState('0.30');
  const [formStartFee, setFormStartFee] = useState('0');
  const [formIdleFee, setFormIdleFee] = useState('0');
  const [formCpId, setFormCpId] = useState<string>('all');
  const [formActive, setFormActive] = useState(true);
  const [formIsDefault, setFormIsDefault] = useState(false);

  const resetForm = () => {
    setFormName('');
    setFormPriceKwh('0.30');
    setFormStartFee('0');
    setFormIdleFee('0');
    setFormCpId('all');
    setFormActive(true);
    setFormIsDefault(false);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (t: NonNullable<typeof tariffs>[number]) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormPriceKwh(String(t.price_per_kwh));
    setFormStartFee(String(t.start_fee));
    setFormIdleFee(String(t.idle_fee_per_min));
    setFormCpId(t.charge_point_id || 'all');
    setFormActive(t.active);
    setFormIsDefault(t.is_default);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Naam is verplicht');
      return;
    }
    const priceKwh = parseFloat(formPriceKwh);
    const startFee = parseFloat(formStartFee);
    const idleFee = parseFloat(formIdleFee);
    if (isNaN(priceKwh) || priceKwh < 0) {
      toast.error('Ongeldig tarief per kWh');
      return;
    }

    const payload = {
      name: formName.trim(),
      price_per_kwh: priceKwh,
      start_fee: isNaN(startFee) ? 0 : startFee,
      idle_fee_per_min: isNaN(idleFee) ? 0 : idleFee,
      charge_point_id: formCpId === 'all' ? null : formCpId,
      active: formActive,
      is_default: formIsDefault,
    };

    try {
      if (editingId) {
        await updateTariff.mutateAsync({ id: editingId, ...payload });
        toast.success('Tarief bijgewerkt');
      } else {
        await createTariff.mutateAsync(payload);
        toast.success('Tarief aangemaakt');
      }
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTariff.mutateAsync(deleteId);
      toast.success('Tarief verwijderd');
      setDeleteDialogOpen(false);
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    }
  };

  const getCpName = (cpId: string | null) => {
    if (!cpId) return 'Alle laadpalen';
    const cp = chargePoints?.find(c => c.id === cpId);
    return cp ? `${cp.name} (${cp.id})` : cpId;
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(val);

  return (
    <AppLayout title="Laadtarieven" subtitle="Beheer prijzen per kWh, starttarief en stilstandkosten">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Euro className="h-3 w-3" />
            {(tariffs || []).filter(t => t.active).length} actief
          </Badge>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Tarief toevoegen
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : !tariffs || tariffs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Euro className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Nog geen tarieven geconfigureerd.</p>
          <p className="text-xs mt-1">Voeg een tarief toe om kosten automatisch te berekenen.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Per kWh</TableHead>
                <TableHead>Starttarief</TableHead>
                <TableHead>Stilstand/min</TableHead>
                <TableHead>Laadpaal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tariffs.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {t.name}
                      {t.is_default && (
                        <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0">
                          <Star className="h-2.5 w-2.5" /> Standaard
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-primary font-semibold">
                    {formatCurrency(t.price_per_kwh)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {t.start_fee > 0 ? formatCurrency(t.start_fee) : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {t.idle_fee_per_min > 0 ? formatCurrency(t.idle_fee_per_min) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.charge_point_id ? (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Zap className="h-3 w-3" />
                        {getCpName(t.charge_point_id)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Alle</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.active ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">Actief</Badge>
                    ) : (
                      <Badge variant="secondary">Inactief</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(t.id); setDeleteDialogOpen(true); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Tarief bewerken' : 'Nieuw tarief'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Pas de tariefinstellingen aan.' : 'Stel een nieuw laadtarief in.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="name">Naam *</Label>
              <Input id="name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="bijv. Standaard tarief" className="mt-1" maxLength={100} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="priceKwh">Per kWh (€) *</Label>
                <Input id="priceKwh" type="number" step="0.01" min="0" value={formPriceKwh} onChange={e => setFormPriceKwh(e.target.value)} className="font-mono mt-1" />
              </div>
              <div>
                <Label htmlFor="startFee">Starttarief (€)</Label>
                <Input id="startFee" type="number" step="0.01" min="0" value={formStartFee} onChange={e => setFormStartFee(e.target.value)} className="font-mono mt-1" />
              </div>
              <div>
                <Label htmlFor="idleFee">Stilstand/min (€)</Label>
                <Input id="idleFee" type="number" step="0.01" min="0" value={formIdleFee} onChange={e => setFormIdleFee(e.target.value)} className="font-mono mt-1" />
              </div>
            </div>
            <div>
              <Label>Laadpaal</Label>
              <Select value={formCpId} onValueChange={setFormCpId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecteer laadpaal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle laadpalen</SelectItem>
                  {chargePoints?.map(cp => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.name} ({cp.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Laadpaal-specifiek tarief heeft voorrang op het standaard tarief</p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Actief</Label>
              <Switch id="active" checked={formActive} onCheckedChange={setFormActive} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isDefault">Standaard tarief</Label>
                <p className="text-xs text-muted-foreground">Wordt gebruikt als er geen specifiek tarief is</p>
              </div>
              <Switch id="isDefault" checked={formIsDefault} onCheckedChange={setFormIsDefault} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleSave} disabled={createTariff.isPending || updateTariff.isPending}>
              {(createTariff.isPending || updateTariff.isPending) ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tarief verwijderen</DialogTitle>
            <DialogDescription>Weet je zeker dat je dit tarief wilt verwijderen?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteTariff.isPending} className="gap-2">
              <Trash2 className="h-4 w-4" />
              {deleteTariff.isPending ? 'Verwijderen...' : 'Verwijderen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Tarieven;
