import { useState, useRef, DragEvent } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Zap, LayoutDashboard, BatteryCharging, Cpu, Activity, Play, LogOut, Tag, Euro, Receipt, Settings, Gauge, HardDrive, CalendarClock, AlertTriangle, Sun, X, Network, BookOpen, ChevronRight, GripVertical, Plus, Trash2, Pencil, RotateCcw, Check, Car, FileText, Users, HeartPulse } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMyModulePermissions } from '@/hooks/useMyModulePermissions';
import VoltControlLogo from '@/components/VoltControlLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/ThemeToggle';
import { useSidebarConfig } from '@/hooks/useSidebarConfig';
import type { LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/laadpalen': Zap,
  '/rfid': Tag,
  '/tarieven': Euro,
  '/transacties': Receipt,
  '/smart-charging': Gauge,
  '/firmware': HardDrive,
  '/reserveringen': CalendarClock,
  '/batterij': BatteryCharging,
  '/zonne-energie': Sun,
  '/ems': Cpu,
  '/virtual-grids': Network,
  '/alerts': AlertTriangle,
  '/simulator': Play,
  '/instellingen': Settings,
  '/setup-guide': BookOpen,
  '/plug-and-charge': Car,
  '/facturatie': FileText,
  '/gebruikers': Users,
  '/device-health': HeartPulse,
};

const labelMap: Record<string, string> = {
  '/': 'Dashboard',
  '/laadpalen': 'Laadpalen',
  '/rfid': 'RFID Tags',
  '/tarieven': 'Tarieven',
  '/transacties': 'Transacties',
  '/smart-charging': 'Smart Charging',
  '/firmware': 'Firmware',
  '/reserveringen': 'Reserveringen',
  '/batterij': 'Batterij',
  '/zonne-energie': 'Zonne-energie',
  '/ems': 'EMS',
  '/virtual-grids': 'Virtuele Grids',
  '/alerts': 'Alerts',
  '/simulator': 'Simulator',
  '/instellingen': 'Instellingen',
  '/setup-guide': 'Setup Guide',
  '/plug-and-charge': 'Plug & Charge',
  '/facturatie': 'Facturatie',
  '/gebruikers': 'Gebruikers',
  '/device-health': 'Device Health',
};

const adminOnlyRoutes = new Set(['/simulator', '/gebruikers']);

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

const AppSidebar = ({ open, onClose }: AppSidebarProps) => {
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const { data: disabledModules } = useMyModulePermissions();
  const { config, moveItem, addGroup, renameGroup, deleteGroup, toggleGroupCollapse, resetConfig } = useSidebarConfig();

  const [editMode, setEditMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ groupId: string | null; index: number } | null>(null);

  const handleDragStart = (e: DragEvent, itemPath: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemPath);
    setDragItem(itemPath);
  };

  const handleDragOver = (e: DragEvent, groupId: string | null, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget({ groupId, index });
  };

  const handleDrop = (e: DragEvent, groupId: string | null, index: number) => {
    e.preventDefault();
    const itemPath = e.dataTransfer.getData('text/plain');
    if (itemPath) {
      moveItem(itemPath, groupId, index);
    }
    setDragItem(null);
    setDragOverTarget(null);
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDragOverTarget(null);
  };

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      addGroup(newGroupName.trim());
      setNewGroupName('');
      setAddingGroup(false);
    }
  };

  const handleRenameGroup = (groupId: string) => {
    if (renameValue.trim()) {
      renameGroup(groupId, renameValue.trim());
      setRenamingGroupId(null);
    }
  };

  const renderNavItem = (path: string, groupId: string | null, index: number) => {
    if (adminOnlyRoutes.has(path) && !isAdmin) return null;
    if (!isAdmin && disabledModules?.has(path)) return null;
    const Icon = iconMap[path] || LayoutDashboard;
    const label = labelMap[path] || path;
    const isActive = location.pathname === path;
    const isDragging = dragItem === path;
    const isDropTarget = dragOverTarget?.groupId === groupId && dragOverTarget?.index === index;

    return (
      <div
        key={path}
        draggable={editMode}
        onDragStart={e => handleDragStart(e, path)}
        onDragOver={e => handleDragOver(e, groupId, index)}
        onDrop={e => handleDrop(e, groupId, index)}
        onDragEnd={handleDragEnd}
        className={cn(
          'transition-all',
          isDragging && 'opacity-40',
          isDropTarget && 'border-t-2 border-primary',
        )}
      >
        <NavLink
          to={path}
          onClick={editMode ? (e) => e.preventDefault() : onClose}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
            isActive
              ? 'bg-primary/10 text-primary glow-primary'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          {editMode && <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />}
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </NavLink>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r bg-sidebar transition-transform duration-300 ease-in-out border-pulse-sidebar",
        "md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <VoltControlLogo size="sm" />
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Edit mode toggle */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Navigatie</span>
        <div className="flex items-center gap-1">
          {editMode && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { resetConfig(); setEditMode(false); }} title="Reset naar standaard">
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant={editMode ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? <><Check className="h-3 w-3 mr-1" />Klaar</> : <><Pencil className="h-3 w-3 mr-1" />Indelen</>}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
        {config.groups.map((group) => {
          const visibleItems = group.items.filter(p => !adminOnlyRoutes.has(p) || isAdmin);
          if (visibleItems.length === 0 && !editMode) return null;

          return (
            <div
              key={group.id}
              className="mb-2"
              onDragOver={e => { if (visibleItems.length === 0) handleDragOver(e, group.id, 0); }}
              onDrop={e => { if (visibleItems.length === 0) handleDrop(e, group.id, 0); }}
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                {renamingGroupId === group.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="h-5 text-[10px] px-1.5 py-0"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameGroup(group.id); if (e.key === 'Escape') setRenamingGroupId(null); }}
                    />
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRenameGroup(group.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleGroupCollapse(group.id)}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold hover:text-foreground transition-colors"
                  >
                    <ChevronRight className={cn('h-3 w-3 transition-transform', !group.collapsed && 'rotate-90')} />
                    {group.label}
                    <span className="text-[9px] text-muted-foreground/60 font-normal normal-case">({visibleItems.length})</span>
                  </button>
                )}
                {editMode && renamingGroupId !== group.id && (
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setRenamingGroupId(group.id); setRenameValue(group.label); }}>
                      <Pencil className="h-2.5 w-2.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => deleteGroup(group.id)}>
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                )}
              </div>
              {!group.collapsed && (
                <div className="space-y-0.5 ml-1">
                  {visibleItems.map((path, idx) => renderNavItem(path, group.id, idx))}
                  {/* Drop zone at end of group */}
                  {editMode && (
                    <div
                      className={cn(
                        'h-6 rounded-lg border border-dashed border-transparent transition-colors',
                        dragOverTarget?.groupId === group.id && dragOverTarget?.index === visibleItems.length && 'border-primary bg-primary/5'
                      )}
                      onDragOver={e => handleDragOver(e, group.id, visibleItems.length)}
                      onDrop={e => handleDrop(e, group.id, visibleItems.length)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped items */}
        {config.ungrouped.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Overig</span>
            <div className="space-y-0.5 mt-1">
              {config.ungrouped
                .filter(p => !adminOnlyRoutes.has(p) || isAdmin)
                .map((path, idx) => renderNavItem(path, null, idx))}
            </div>
          </div>
        )}

        {/* Add group button */}
        {editMode && (
          <div className="mt-3 px-2">
            {addingGroup ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Groepnaam..."
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleAddGroup(); if (e.key === 'Escape') setAddingGroup(false); }}
                />
                <Button size="sm" className="h-7 px-2" onClick={handleAddGroup}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-7" onClick={() => setAddingGroup(true)}>
                <Plus className="h-3 w-3" />
                Nieuwe groep
              </Button>
            )}
          </div>
        )}
      </nav>

      {/* User + System Status */}
      <div className="border-t border-border px-4 py-4 space-y-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="status-dot-online" />
            <span className="font-mono text-xs text-muted-foreground">OCPP 1.6J</span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            System online
          </p>
        </div>

        {user && (
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px]" title={user.email}>
              {user.email}
            </span>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={signOut} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
