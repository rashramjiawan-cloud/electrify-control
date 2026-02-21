import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateVirtualGrid } from '@/hooks/useVirtualGrids';
import { Plus, Network } from 'lucide-react';
import { toast } from 'sonner';

const CreateVirtualGridDialog = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [gtvLimit, setGtvLimit] = useState('25');
  const [strategy, setStrategy] = useState('proportional');

  const create = useCreateVirtualGrid();

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        gtv_limit_kw: Number(gtvLimit) || 25,
        balancing_strategy: strategy,
      });
      toast.success(`Virtuele grid "${name}" aangemaakt`);
      setOpen(false);
      setName('');
      setDescription('');
      setLocation('');
      setGtvLimit('25');
      setStrategy('proportional');
    } catch {
      toast.error('Kon grid niet aanmaken');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nieuwe Virtuele Grid
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Virtuele Grid aanmaken
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs">Naam *</Label>
            <Input placeholder="bijv. Straatblok A" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Beschrijving</Label>
            <Textarea placeholder="Optionele beschrijving..." value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Locatie</Label>
            <Input placeholder="bijv. Kerkstraat 1-10" value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">GTV Limiet (kW)</Label>
              <Input type="number" value={gtvLimit} onChange={e => setGtvLimit(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Balancing Strategie</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proportional">Proportioneel</SelectItem>
                  <SelectItem value="priority">Prioriteit</SelectItem>
                  <SelectItem value="round_robin">Round Robin</SelectItem>
                  <SelectItem value="soc_based">SoC-gebaseerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Aanmaken...' : 'Grid aanmaken'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateVirtualGridDialog;
