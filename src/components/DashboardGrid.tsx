import { useState, useCallback, ReactNode, useRef } from 'react';
import { Responsive, WidthProvider, Layout, Layouts } from 'react-grid-layout';
import { Lock, Unlock, RotateCcw, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import 'react-grid-layout/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const STORAGE_KEY = 'dashboard-grid-layouts';

interface WidgetConfig {
  id: string;
  title: string;
  children: ReactNode;
  defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
}

interface DashboardGridProps {
  widgets: WidgetConfig[];
}

const getStoredLayouts = (): Layouts | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const saveLayouts = (layouts: Layouts) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {}
};

const DashboardGrid = ({ widgets }: DashboardGridProps) => {
  const [locked, setLocked] = useState(true);
  const [layouts, setLayouts] = useState<Layouts>(() => {
    const stored = getStoredLayouts();
    if (stored) return stored;

    const lg = widgets.map((w) => ({
      i: w.id,
      ...w.defaultLayout,
    }));

    // md: 2-col version
    const md = widgets.map((w, idx) => ({
      i: w.id,
      x: 0,
      y: idx * (w.defaultLayout.h || 4),
      w: Math.min(w.defaultLayout.w, 10),
      h: w.defaultLayout.h,
      minW: w.defaultLayout.minW,
      minH: w.defaultLayout.minH,
    }));

    // sm: single column
    const sm = widgets.map((w, idx) => ({
      i: w.id,
      x: 0,
      y: idx * (w.defaultLayout.h || 4),
      w: 6,
      h: w.defaultLayout.h,
      minW: 1,
      minH: w.defaultLayout.minH,
    }));

    return { lg, md, sm };
  });

  const handleLayoutChange = useCallback((_layout: Layout[], allLayouts: Layouts) => {
    setLayouts(allLayouts);
    saveLayouts(allLayouts);
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const lg = widgets.map((w) => ({
      i: w.id,
      ...w.defaultLayout,
    }));
    const md = widgets.map((w, idx) => ({
      i: w.id,
      x: 0,
      y: idx * (w.defaultLayout.h || 4),
      w: Math.min(w.defaultLayout.w, 10),
      h: w.defaultLayout.h,
      minW: w.defaultLayout.minW,
      minH: w.defaultLayout.minH,
    }));
    const sm = widgets.map((w, idx) => ({
      i: w.id,
      x: 0,
      y: idx * (w.defaultLayout.h || 4),
      w: 6,
      h: w.defaultLayout.h,
      minW: 1,
      minH: w.defaultLayout.minH,
    }));
    setLayouts({ lg, md, sm });
  }, [widgets]);

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-2 mb-4 justify-end">
        {!locked && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleReset}>
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
        <Button
          variant={locked ? 'ghost' : 'default'}
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setLocked(!locked)}
        >
          {locked ? (
            <>
              <Lock className="h-3 w-3" />
              Vergrendeld
            </>
          ) : (
            <>
              <Unlock className="h-3 w-3" />
              Bewerken
            </>
          )}
        </Button>
      </div>

      <ResponsiveGridLayout
        className="dashboard-grid"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 768, sm: 0 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={60}
        onLayoutChange={handleLayoutChange}
        isDraggable={!locked}
        isResizable={!locked}
        draggableHandle=".widget-drag-handle"
        compactType="vertical"
        margin={[16, 16]}
        containerPadding={[0, 0]}
      >
        {widgets.map((widget) => (
          <div key={widget.id} className="group">
            <div
              className={cn(
                'h-full rounded-xl border bg-card overflow-hidden flex flex-col transition-shadow',
                !locked && 'ring-1 ring-primary/20 shadow-lg'
              )}
            >
              {/* Drag handle header */}
              <div
                className={cn(
                  'widget-drag-handle flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0',
                  !locked && 'cursor-grab active:cursor-grabbing bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2">
                  {!locked && <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-sm font-semibold text-foreground">{widget.title}</span>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-auto p-4">
                {widget.children}
              </div>
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
};

export default DashboardGrid;
