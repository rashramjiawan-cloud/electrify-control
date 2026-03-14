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
    items: ['/batterij', '/zonne-energie', '/ems', '/virtual-grids', '/device-health'],
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
    items: ['/alerts', '/simulator', '/gebruikers', '/klanten', '/projecten', '/instellingen', '/setup-guide'],
    collapsed: false,
  },
];

const cloneDefaultGroups = () =>
  DEFAULT_GROUPS.map((group) => ({
    ...group,
    items: [...group.items],
  }));

function getDefaultConfig(): SidebarConfig {
  return {
    groups: cloneDefaultGroups(),
    ungrouped: [],
  };
}

function normalizeConfig(rawConfig: unknown): SidebarConfig {
  const fallback = getDefaultConfig();

  if (!rawConfig || typeof rawConfig !== 'object') {
    return fallback;
  }

  const config = rawConfig as Partial<SidebarConfig>;
  const seenItems = new Set<string>();

  const normalizedGroups: SidebarGroup[] = Array.isArray(config.groups)
    ? config.groups
        .filter((group): group is SidebarGroup => !!group && typeof group === 'object')
        .map((group, index) => {
          const items = Array.isArray(group.items)
            ? group.items.filter((item): item is string => {
                if (typeof item !== 'string' || !item.startsWith('/')) return false;
                if (seenItems.has(item)) return false;
                seenItems.add(item);
                return true;
              })
            : [];

          return {
            id: typeof group.id === 'string' && group.id.trim() ? group.id : `group-${index}`,
            label: typeof group.label === 'string' && group.label.trim() ? group.label : 'Groep',
            collapsed: Boolean(group.collapsed),
            items,
          };
        })
    : [];

  const normalizedUngrouped = Array.isArray(config.ungrouped)
    ? config.ungrouped.filter((item): item is string => {
        if (typeof item !== 'string' || !item.startsWith('/')) return false;
        if (seenItems.has(item)) return false;
        seenItems.add(item);
        return true;
      })
    : [];

  for (const defaultGroup of DEFAULT_GROUPS) {
    let targetGroup = normalizedGroups.find((group) => group.id === defaultGroup.id);

    if (!targetGroup) {
      targetGroup = {
        id: defaultGroup.id,
        label: defaultGroup.label,
        collapsed: defaultGroup.collapsed,
        items: [],
      };
      normalizedGroups.push(targetGroup);
    }

    for (const defaultItem of defaultGroup.items) {
      if (!seenItems.has(defaultItem)) {
        targetGroup.items.push(defaultItem);
        seenItems.add(defaultItem);
      }
    }
  }

  return {
    groups: normalizedGroups.length > 0 ? normalizedGroups : fallback.groups,
    ungrouped: normalizedUngrouped,
  };
}

function loadConfig(): SidebarConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return normalizeConfig(JSON.parse(stored));
    }
  } catch {
    /* ignore */
  }
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
