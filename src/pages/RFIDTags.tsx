import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuthorizedTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/useAuthorizedTags';
import { useChargePoints } from '@/hooks/useChargePoints';
import { Plus, Pencil, Trash2, Tag, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

const RFIDTags = () => {
  const { data: tags, isLoading } = useAuthorizedTags();
  const { data: chargePoints } = useChargePoints();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState('');

  const [formIdTag, setFormIdTag] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formExpiry, setFormExpiry] = useState('');
  const [formCpIds, setFormCpIds] = useState<string[]>([]);

  const resetForm = () => {
    setFormIdTag('');
    setFormLabel('');
    setFormEnabled(true);
    setFormExpiry('');
    setFormCpIds([]);
    setEditingTag(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (tag: NonNullable<typeof tags>[number]) => {
    setEditingTag(tag.id);
    setFormIdTag(tag.id_tag);
    setFormLabel(tag.label || '');
    setFormEnabled(tag.enabled);
    setFormExpiry(tag.expiry_date ? tag.expiry_date.slice(0, 10) : '');
    setFormCpIds(tag.charge_point_ids || []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formIdTag.trim()) {
      toast.error('RFID Tag ID is verplicht');
      return;
    }
    const payload = {
      id_tag: formIdTag.trim(),
      label: formLabel.trim() || null,
      enabled: formEnabled,
      expiry_date: formExpiry ? new Date(formExpiry).toISOString() : null,
      charge_point_ids: formCpIds,
    };

    try {
      if (editingTag) {
        await updateTag.mutateAsync({ id: editingTag, ...payload });
        toast.success('Tag bijgewerkt');
      } else {
        await createTag.mutateAsync(payload);
        toast.success('Tag aangemaakt');
      }
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTag.mutateAsync(deleteId);
      toast.success('Tag verwijderd');
      setDeleteDialogOpen(false);
    } catch (err) {
      toast.error(`Fout: ${(err as Error).message}`);
    }
  };

  const toggleCp = (cpId: string) => {
    setFormCpIds(prev =>
      prev.includes(cpId) ? prev.filter(id => id !== cpId) : [...prev, cpId]
    );
  };

  const enabledCount = (tags || []).filter(t => t.enabled).length;
  const totalCount = (tags || []).length;

  return (
    <AppLayout title="RFID Autorisatie" subtitle="Beheer welke RFID-tags mogen laden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <ShieldCheck className="h-3 w-3" />
            {enabledCount} actief
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Tag className="h-3 w-3" />
            {totalCount} totaal
          </Badge>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Tag toevoegen
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : !tags || tags.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tag className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Nog geen RFID-tags geconfigureerd.</p>
          <p className="text-xs mt-1">Voeg een tag toe om autorisatie in te schakelen.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag ID</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Geldig tot</TableHead>
                <TableHead>Laadpalen</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map(tag => (
                <TableRow key={tag.id}>
                  <TableCell className="font-mono text-sm">{tag.id_tag}</TableCell>
                  <TableCell className="text-sm">{tag.label || '—'}</TableCell>
                  <TableCell>
                    {tag.enabled ? (
                      <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
                        <ShieldCheck className="h-3 w-3" /> Actief
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldX className="h-3 w-3" /> Geblokkeerd
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {tag.expiry_date ? new Date(tag.expiry_date).toLocaleDateString('nl-NL') : 'Onbeperkt'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {tag.charge_point_ids && tag.charge_point_ids.length > 0
                      ? tag.charge_point_ids.join(', ')
                      : <span className="text-muted-foreground">Alle</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(tag)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(tag.id); setDeleteDialogOpen(true); }}>
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
            <DialogTitle>{editingTag ? 'Tag bewerken' : 'Nieuwe RFID-tag'}</DialogTitle>
            <DialogDescription>
              {editingTag ? 'Pas de instellingen van deze tag aan.' : 'Voeg een nieuwe geautoriseerde RFID-tag toe.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="id_tag">Tag ID *</Label>
              <Input id="id_tag" value={formIdTag} onChange={e => setFormIdTag(e.target.value)} placeholder="bijv. RFID-001" className="font-mono mt-1" maxLength={50} />
            </div>
            <div>
              <Label htmlFor="label">Label</Label>
              <Input id="label" value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="bijv. Jan Janssen" className="mt-1" maxLength={100} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Actief</Label>
              <Switch id="enabled" checked={formEnabled} onCheckedChange={setFormEnabled} />
            </div>
            <div>
              <Label htmlFor="expiry">Geldig tot (optioneel)</Label>
              <Input id="expiry" type="date" value={formExpiry} onChange={e => setFormExpiry(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Toegestane laadpalen</Label>
              <p className="text-xs text-muted-foreground mb-2">Laat leeg voor toegang tot alle laadpalen</p>
              {chargePoints && chargePoints.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                  {chargePoints.map(cp => (
                    <label key={cp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={formCpIds.includes(cp.id)}
                        onCheckedChange={() => toggleCp(cp.id)}
                      />
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
            <Button onClick={handleSave} disabled={createTag.isPending || updateTag.isPending}>
              {(createTag.isPending || updateTag.isPending) ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag verwijderen</DialogTitle>
            <DialogDescription>Weet je zeker dat je deze RFID-tag wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteTag.isPending} className="gap-2">
              <Trash2 className="h-4 w-4" />
              {deleteTag.isPending ? 'Verwijderen...' : 'Verwijderen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default RFIDTags;
