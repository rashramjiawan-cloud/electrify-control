import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useVirtualGrids, useVirtualGridMembers, useUpdateVirtualGrid, useDeleteVirtualGrid } from '@/hooks/useVirtualGrids';
import VirtualGridCard from '@/components/VirtualGridCard';
import VirtualGridMembersPanel from '@/components/VirtualGridMembersPanel';
import CreateVirtualGridDialog from '@/components/CreateVirtualGridDialog';
import { Network } from 'lucide-react';
import { toast } from 'sonner';

const VirtualGrids = () => {
  const { data: grids = [], isLoading } = useVirtualGrids();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const updateGrid = useUpdateVirtualGrid();
  const deleteGrid = useDeleteVirtualGrid();

  const selectedGrid = grids.find(g => g.id === selectedId);

  // We need member counts for each grid — query for selected grid
  const { data: selectedMembers = [] } = useVirtualGridMembers(selectedId || undefined);

  const handleToggle = async (grid: typeof grids[0]) => {
    try {
      await updateGrid.mutateAsync({ id: grid.id, enabled: !grid.enabled });
      toast.success(grid.enabled ? 'Grid gedeactiveerd' : 'Grid geactiveerd');
    } catch {
      toast.error('Kon status niet wijzigen');
    }
  };

  const handleDelete = async (grid: typeof grids[0]) => {
    if (!confirm(`Weet je zeker dat je "${grid.name}" wilt verwijderen? Alle leden worden ook verwijderd.`)) return;
    try {
      await deleteGrid.mutateAsync(grid.id);
      if (selectedId === grid.id) setSelectedId(null);
      toast.success('Grid verwijderd');
    } catch {
      toast.error('Kon grid niet verwijderen');
    }
  };

  return (
    <AppLayout title="Virtuele Grids" subtitle="Groepeer energiebronnen tot één logisch netwerk voor load balancing">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Network className="h-4 w-4" />
          <span className="text-sm">{grids.length} grid(s)</span>
        </div>
        <CreateVirtualGridDialog />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Laden...</div>
      ) : grids.length === 0 ? (
        <div className="text-center py-16">
          <Network className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="font-semibold mb-1">Geen virtuele grids</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Maak een virtuele grid aan om meerdere energiebronnen te groeperen.
          </p>
          <CreateVirtualGridDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: grid cards */}
          <div className="lg:col-span-1 space-y-3">
            {grids.map(g => (
              <VirtualGridCard
                key={g.id}
                grid={g}
                memberCount={selectedId === g.id ? selectedMembers.length : 0}
                isSelected={selectedId === g.id}
                onSelect={() => setSelectedId(g.id === selectedId ? null : g.id)}
                onToggle={() => handleToggle(g)}
                onDelete={() => handleDelete(g)}
              />
            ))}
          </div>

          {/* Right: member panel */}
          <div className="lg:col-span-2">
            {selectedGrid ? (
              <VirtualGridMembersPanel grid={selectedGrid} />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/50 flex items-center justify-center py-20">
                <p className="text-sm text-muted-foreground">Selecteer een grid om leden te beheren</p>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default VirtualGrids;
