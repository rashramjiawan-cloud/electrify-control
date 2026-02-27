import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useVehicleWhitelist, useCreateVehicle, useUpdateVehicle, useDeleteVehicle, WhitelistedVehicle } from '@/hooks/useVehicleWhitelist';
import { useChargePoints } from '@/hooks/useChargePoints';
import { Plus, Pencil, Trash2, Car, Zap, ZapOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const PlugAndCharge = () => {
  const { data: vehicles, isLoading } = useVehicleWhitelist();
  const { data: chargePoints } = useChargePoints();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState('');

  const [formVehicleId, setFormVehicleId] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formAutoStart, setFormAutoStart] = useState(true);
  const [formCpIds, setFormCpIds] = useState<string[]>([]);
  const [formMaxPower, setFormMaxPower] = useState('');

  const resetForm = () => {
    setFormVehicleId('');
    setFormLabel('');
    setFormBrand('');
    setFormModel('');
    setFormEnabled(true);
    setFormAutoStart(true);
    setFormCpIds([]);
    setFormMaxPower('');
    setEditingId(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (v: WhitelistedVehicle) => {
    setEditingId(v.id);
    setFormVehicleId(v.vehicle_id);
    setFormLabel(v.label || '');
    setFormBrand(v.brand || '');
    setFormModel(v.model || '');
    setFormEnabled(v.enabled);
    setFormAutoStart(v.auto_start);
    setFormCpIds(v.charge_point_ids || []);
    setFormMaxPower(v.max_power_kw != null ? String(v.max_power_kw) : '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formVehicleId.trim()) {
      toast.error('Voertuig ID is verplicht');
      return;
    }
    const payload = {
      vehicle_id: formVehicleId.trim(),
      label: formLabel.trim() || undefined,
      brand: formBrand.trim() || undefined,
      model: formModel.trim() || undefined,
      enabled: formEnabled,
      auto_start: formAutoStart,
      charge_point_ids: formCpIds,
      max_power_kw: formMaxPower ? Number(formMaxPower) : null,
    };
    try {
      if (editingId) {
        await updateVehicle.mutateAsync({ id: editingId, ...payload });
        toast.success('Voertuig bijgewerkt');
      } else {
        await createVehicle.mutateAsync(payload);
        toast.success('Voertuig toegevoegd aan whitelist');
      }
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteVehicle.mutateAsync(deleteId);
      toast.success('Voertuig verwijderd');
      setDeleteDialogOpen(false);
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    }
  };

  const toggleCp = (cpId: string) => {
    setFormCpIds(prev => prev.includes(cpId) ? prev.filter(id => id !== cpId) : [...prev, cpId]);
  };

  const enabledCount = (vehicles || []).filter(v => v.enabled).length;
  const autoStartCount = (vehicles || []).filter(v => v.enabled && v.auto_start).length;

  return (
    <AppLayout title="Plug & Charge" subtitle="Voertuig-whitelist voor automatische autorisatie">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <ShieldCheck className="h-3 w-3" />
            {enabledCount} actief
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Zap className="h-3 w-3" />
            {autoStartCount} auto-start
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Car className="h-3 w-3" />
            {(vehicles || []).length} totaal
          </Badge>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Voertuig toevoegen
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-6">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Automatische autorisatie</p>
            <p className="text-xs text-muted-foreground mt-1">
              Voertuigen in deze whitelist worden automatisch geautoriseerd bij het insteken van de laadkabel.
              Gebruik het contract-ID (EMAID) of voertuig-identificatie als Vehicle ID. Bij auto-start begint het laden direct zonder handmatige actie.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : !vehicles || vehicles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Car className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Nog geen voertuigen in de whitelist.</p>
          <p className="text-xs mt-1">Voeg een voertuig toe om Plug & Charge in te schakelen.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle ID</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Merk / Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Auto-start</TableHead>
                <TableHead>Max kW</TableHead>
                <TableHead>Laadpalen</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-sm">{v.vehicle_id}</TableCell>
                  <TableCell className="text-sm">{v.label || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {[v.brand, v.model].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell>
                    {v.enabled ? (
                      <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
                        <ShieldCheck className="h-3 w-3" /> Actief
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <ZapOff className="h-3 w-3" /> Uitgeschakeld
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.auto_start ? (
                      <Badge variant="outline" className="gap-1 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                        <Zap className="h-3 w-3" /> Aan
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Uit</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {v.max_power_kw != null ? `${v.max_power_kw} kW` : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {v.charge_point_ids && v.charge_point_ids.length > 0
                      ? v.charge_point_ids.join(', ')
                      : <span className="text-muted-foreground">Alle</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(v.id); setDeleteDialogOpen(true); }}>
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Voertuig bewerken' : 'Voertuig toevoegen'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Pas de Plug & Charge instellingen aan.' : 'Voeg een voertuig toe aan de whitelist voor automatische autorisatie.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="vehicle_id">Vehicle ID / Contract ID *</Label>
              <Input id="vehicle_id" value={formVehicleId} onChange={e => setFormVehicleId(e.target.value)} placeholder="bijv. NL-TNM-000001-2" className="font-mono mt-1" maxLength={64} />
            </div>
            <div>
              <Label htmlFor="v_label">Label</Label>
              <Input id="v_label" value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="bijv. Tesla Model 3 - Jan" className="mt-1" maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="v_brand">Merk</Label>
                <Input id="v_brand" value={formBrand} onChange={e => setFormBrand(e.target.value)} placeholder="bijv. Tesla" className="mt-1" maxLength={50} />
              </div>
              <div>
                <Label htmlFor="v_model">Model</Label>
                <Input id="v_model" value={formModel} onChange={e => setFormModel(e.target.value)} placeholder="bijv. Model 3" className="mt-1" maxLength={50} />
              </div>
            </div>
            <div>
              <Label htmlFor="v_max_power">Max vermogen (kW, optioneel)</Label>
              <Input id="v_max_power" type="number" value={formMaxPower} onChange={e => setFormMaxPower(e.target.value)} placeholder="bijv. 11" className="mt-1" min={0} step={0.1} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="v_enabled">Actief</Label>
              <Switch id="v_enabled" checked={formEnabled} onCheckedChange={setFormEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="v_autostart">Auto-start laden</Label>
                <p className="text-xs text-muted-foreground">Start automatisch bij het insteken</p>
              </div>
              <Switch id="v_autostart" checked={formAutoStart} onCheckedChange={setFormAutoStart} />
            </div>
            <div>
              <Label>Toegestane laadpalen</Label>
              <p className="text-xs text-muted-foreground mb-2">Laat leeg voor toegang tot alle laadpalen</p>
              {chargePoints && chargePoints.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                  {chargePoints.map(cp => (
                    <label key={cp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={formCpIds.includes(cp.id)} onCheckedChange={() => toggleCp(cp.id)} />
                      <span className="font-mono text-xs">{cp.id}</span>
                      <span className="text-muted-foreground">— {cp.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Geen laadpalen beschikbaar</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleSave} disabled={createVehicle.isPending || updateVehicle.isPending}>
              {(createVehicle.isPending || updateVehicle.isPending) ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voertuig verwijderen</DialogTitle>
            <DialogDescription>Weet je zeker dat je dit voertuig wilt verwijderen uit de whitelist? Dit kan niet ongedaan worden gemaakt.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteVehicle.isPending} className="gap-2">
              <Trash2 className="h-4 w-4" />
              {deleteVehicle.isPending ? 'Verwijderen...' : 'Verwijderen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default PlugAndCharge;
