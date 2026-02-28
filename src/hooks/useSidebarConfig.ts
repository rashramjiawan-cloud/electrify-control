import { useState, useCallback, useEffect } from 'react';

export interface SidebarItem {
  to: string;
  label: string;
  icon: string; // icon name as string for serialization
  adminOnly?: boolean;
}

export interface SidebarGroup {
  id: string;
  label: string;
  items: string[]; // array of route paths (to)
  collapsed: boolean;
}

export interface SidebarConfig {
  groups: SidebarGroup[];
  ungrouped: string[]; // items not in any group
}

const STORAGE_KEY = 'voltcontrol-sidebar-config';

const DEFAULT_GROUPS: SidebarGroup[] = [
  {
    id: 'main',
    label: 'Hoofdmenu',
    items: ['/', '/laadpalen', '/transacties'],
    collapsed: false,
  },
  {
    id: 'energy',
    label: 'Energie',
    items: ['/batterij', '/zonne-energie', '/ems', '/virtual-grids'],
    collapsed: false,
  },
  {
    id: 'management',
    label: 'Beheer',
    items: ['/rfid', '/plug-and-charge', '/tarieven', '/facturatie', '/smart-charging', '/firmware', '/reserveringen'],
    collapsed: false,
  },
  {
    id: 'system',
    label: 'Systeem',
    items: ['/alerts', '/simulator', '/gebruikers', '/instellingen', '/setup-guide'],
    collapsed: false,
  },
];

function getDefaultConfig(): SidebarConfig {
  return {
    groups: DEFAULT_GROUPS,
    ungrouped: [],
  };
}

function loadConfig(): SidebarConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch { /* ignore */ }
  return getDefaultConfig();
}

function saveConfig(config: SidebarConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useSidebarConfig() {
  const [config, setConfig] = useState<SidebarConfig>(loadConfig);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const moveItem = useCallback((itemPath: string, targetGroupId: string | null, targetIndex: number) => {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SidebarConfig;
      
      // Remove from current location
      for (const g of next.groups) {
        g.items = g.items.filter(i => i !== itemPath);
      }
      next.ungrouped = next.ungrouped.filter(i => i !== itemPath);

      // Add to target
      if (targetGroupId) {
        const group = next.groups.find(g => g.id === targetGroupId);
        if (group) {
          group.items.splice(targetIndex, 0, itemPath);
        }
      } else {
        next.ungrouped.splice(targetIndex, 0, itemPath);
      }

      return next;
    });
  }, []);

  const addGroup = useCallback((label: string) => {
    setConfig(prev => ({
      ...prev,
      groups: [...prev.groups, { id: `group-${Date.now()}`, label, items: [], collapsed: false }],
    }));
  }, []);

  const renameGroup = useCallback((groupId: string, label: string) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, label } : g),
    }));
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setConfig(prev => {
      const group = prev.groups.find(g => g.id === groupId);
      return {
        ...prev,
        groups: prev.groups.filter(g => g.id !== groupId),
        ungrouped: [...prev.ungrouped, ...(group?.items || [])],
      };
    });
  }, []);

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g),
    }));
  }, []);

  const moveGroup = useCallback((groupId: string, targetIndex: number) => {
    setConfig(prev => {
      const next = { ...prev, groups: [...prev.groups] };
      const currentIndex = next.groups.findIndex(g => g.id === groupId);
      if (currentIndex === -1) return prev;
      const [removed] = next.groups.splice(currentIndex, 1);
      next.groups.splice(targetIndex, 0, removed);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(getDefaultConfig());
  }, []);

  return {
    config,
    moveItem,
    addGroup,
    renameGroup,
    deleteGroup,
    toggleGroupCollapse,
    moveGroup,
    resetConfig,
  };
}
