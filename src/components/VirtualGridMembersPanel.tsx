import { useState } from 'react';
import { VirtualGrid, VirtualGridMember, useVirtualGridMembers, useAddGridMember, useRemoveGridMember } from '@/hooks/useVirtualGrids';
import { useChargePoints } from '@/hooks/useChargePoints';
import { useEnergyMeters } from '@/hooks/useEnergyMeters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { BatteryCharging, Zap, Radio, Sun, Plus, Trash2, Network } from 'lucide-react';
import { toast } from 'sonner';

const typeIcons = {
  battery: BatteryCharging,
  energy_meter: Radio,
  charge_point: Zap,
  solar: Sun,
};

const typeLabels = {
  battery: 'Batterij',
  energy_meter: 'Energiemeter',
  charge_point: 'Laadpaal',
  solar: 'Zonnepanelen',
};

interface Props {
  grid: VirtualGrid;
}

const VirtualGridMembersPanel = ({ grid }: Props) => {
  const { data: members = [], isLoading } = useVirtualGridMembers(grid.id);
  const { data: chargePoints = [] } = useChargePoints();
  const { data: meters = [] } = useEnergyMeters();
  const addMember = useAddGridMember();
  const removeMember = useRemoveGridMember();

  const [addType, setAddType] = useState<string>('charge_point');
  const [addId, setAddId] = useState('');
  const [addPower, setAddPower] = useState('');

  const existingIds = new Set(members.map(m => `${m.member_type}:${m.member_id}`));

  const availableDevices = (() => {
    if (addType === 'charge_point') {
      return chargePoints
        .filter(cp => !existingIds.has(`charge_point:${cp.id}`))
        .map(cp => ({ id: cp.id, name: cp.name, power: cp.max_power || 0 }));
    }
    if (addType === 'energy_meter' || addType === 'solar') {
      return (meters || [])
        .filter(m => !existingIds.has(`${addType}:${m.id}`))
        .map(m => ({ id: m.id, name: m.name, power: 0 }));
    }
    // battery — manual entry
    return [];
  })();

  const handleAdd = async () => {
    if (!addId && addType !== 'battery') return;
    const device = availableDevices.find(d => d.id === addId);
    try {
      await addMember.mutateAsync({
        grid_id: grid.id,
        member_type: addType as VirtualGridMember['member_type'],
        member_id: addType === 'battery' ? crypto.randomUUID() : addId,
        member_name: device?.name || `${typeLabels[addType as keyof typeof typeLabels]} ${members.length + 1}`,
        max_power_kw: Number(addPower) || device?.power || 0,
        priority: members.length,
      });
      toast.success('Lid toegevoegd aan grid');
      setAddId('');
      setAddPower('');
    } catch {
      toast.error('Kon lid niet toevoegen');
    }
  };

  const handleRemove = async (member: VirtualGridMember) => {
    try {
      await removeMember.mutateAsync({ id: member.id, gridId: grid.id });
      toast.success('Lid verwijderd');
    } catch {
      toast.error('Kon lid niet verwijderen');
    }
  };

  // Aggregated stats
  const totalPower = members.reduce((s, m) => s + (m.max_power_kw || 0), 0);
  const activeCount = members.filter(m => m.enabled).length;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Network className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{grid.name} — Leden</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">{members.length} leden</Badge>
      </div>

      {/* Aggregated stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-center">
          <p className="font-mono text-lg font-bold text-primary">{totalPower.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground">Totaal kW</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5 text-center">
          <p className="font-mono text-lg font-bold">{activeCount}</p>
          <p className="text-[9px] text-muted-foreground">Actief</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5 text-center">
          <p className="font-mono text-lg font-bold">{grid.gtv_limit_kw}</p>
          <p className="text-[9px] text-muted-foreground">GTV limiet kW</p>
        </div>
      </div>

      {/* Members list */}
      <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Laden...</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Geen leden. Voeg apparaten toe.</p>
        ) : (
          members.map(m => {
            const Icon = typeIcons[m.member_type] || Zap;
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{m.member_name || m.member_id}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {typeLabels[m.member_type]} · {m.max_power_kw} kW · Prio {m.priority}
                  </p>
                </div>
                <Badge variant={m.enabled ? 'default' : 'outline'} className="text-[9px] shrink-0">
                  {m.enabled ? 'Aan' : 'Uit'}
                </Badge>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={() => handleRemove(m)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Add member form */}
      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
          <Plus className="h-3 w-3" /> Lid toevoegen
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={addType} onValueChange={(v) => { setAddType(v); setAddId(''); }}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="charge_point">Laadpaal</SelectItem>
              <SelectItem value="energy_meter">Energiemeter</SelectItem>
              <SelectItem value="solar">Zonnepanelen</SelectItem>
              <SelectItem value="battery">Batterij</SelectItem>
            </SelectContent>
          </Select>

          {addType !== 'battery' ? (
            <Select value={addId} onValueChange={setAddId}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Kies apparaat..." />
              </SelectTrigger>
              <SelectContent>
                {availableDevices.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
                {availableDevices.length === 0 && (
                  <SelectItem value="__none" disabled>Geen beschikbaar</SelectItem>
                )}
              </SelectContent>
            </Select>
          ) : null}

          <Input
            type="number"
            placeholder="Max kW"
            value={addPower}
            onChange={e => setAddPower(e.target.value)}
            className="w-[90px] h-8 text-xs"
          />

          <Button size="sm" className="h-8 text-xs gap-1" onClick={handleAdd} disabled={addMember.isPending || (!addId && addType !== 'battery')}>
            <Plus className="h-3 w-3" /> Toevoegen
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VirtualGridMembersPanel;
