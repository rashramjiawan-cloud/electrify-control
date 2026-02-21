import { VirtualGrid } from '@/hooks/useVirtualGrids';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Network, MapPin, Zap, Settings2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface Props {
  grid: VirtualGrid;
  memberCount: number;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

const VirtualGridCard = ({ grid, memberCount, isSelected, onSelect, onToggle, onDelete }: Props) => (
  <div
    onClick={onSelect}
    className={`rounded-xl border bg-card p-4 cursor-pointer transition-all hover:border-primary/40 ${
      isSelected ? 'border-primary glow-primary' : 'border-border'
    }`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Network className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">{grid.name}</h3>
          {grid.location && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" /> {grid.location}
            </p>
          )}
        </div>
      </div>
      <Badge variant={grid.enabled ? 'default' : 'outline'} className="text-[10px]">
        {grid.enabled ? 'Actief' : 'Inactief'}
      </Badge>
    </div>

    {grid.description && (
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{grid.description}</p>
    )}

    <div className="grid grid-cols-3 gap-2 text-center mb-3">
      <div className="rounded-lg bg-muted/50 p-2">
        <p className="font-mono text-sm font-bold">{memberCount}</p>
        <p className="text-[9px] text-muted-foreground">Leden</p>
      </div>
      <div className="rounded-lg bg-muted/50 p-2">
        <p className="font-mono text-sm font-bold text-primary">{grid.gtv_limit_kw}</p>
        <p className="text-[9px] text-muted-foreground">GTV kW</p>
      </div>
      <div className="rounded-lg bg-muted/50 p-2">
        <p className="font-mono text-sm font-bold capitalize">{grid.balancing_strategy}</p>
        <p className="text-[9px] text-muted-foreground">Strategie</p>
      </div>
    </div>

    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        {grid.enabled ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
        {grid.enabled ? 'Deactiveer' : 'Activeer'}
      </Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  </div>
);

export default VirtualGridCard;
