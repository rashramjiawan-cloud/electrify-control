import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { format, differenceInDays, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isSameMonth, addDays, subMonths } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { Project } from '@/hooks/useProjects';

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-muted-foreground/40',
  in_progress: 'bg-primary',
  on_hold: 'bg-chart-2',
  completed: 'bg-green-500',
  cancelled: 'bg-destructive/60',
};

const STATUS_LABELS: Record<string, string> = {
  planned: 'Gepland',
  in_progress: 'In uitvoering',
  on_hold: 'On hold',
  completed: 'Afgerond',
  cancelled: 'Geannuleerd',
};

interface Props {
  projects: Project[];
  onSelectProject?: (id: string) => void;
  selectedProjectId?: string | null;
}

const DAY_WIDTH = 28;
const ROW_HEIGHT = 40;
const LABEL_WIDTH = 220;

export default function ProjectGanttChart({ projects, onSelectProject, selectedProjectId }: Props) {
  const [viewStart, setViewStart] = useState(() => startOfMonth(new Date()));

  const viewEnd = useMemo(() => endOfMonth(addMonths(viewStart, 2)), [viewStart]);
  const days = useMemo(() => eachDayOfInterval({ start: viewStart, end: viewEnd }), [viewStart, viewEnd]);

  // Filter projects that have at least a start or due date
  const ganttProjects = useMemo(() => {
    return projects
      .filter(p => p.start_date || p.due_date)
      .map(p => {
        const start = p.start_date ? new Date(p.start_date) : (p.due_date ? addDays(new Date(p.due_date), -14) : new Date());
        const end = p.due_date ? new Date(p.due_date) : addDays(start, 30);
        return { ...p, _start: start, _end: end };
      })
      .sort((a, b) => a._start.getTime() - b._start.getTime());
  }, [projects]);

  const projectsWithoutDates = projects.filter(p => !p.start_date && !p.due_date);

  const navigate = (dir: number) => {
    setViewStart(prev => dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  // Month headers
  const months = useMemo(() => {
    const result: { label: string; span: number; start: number }[] = [];
    let currentMonth = -1;
    let currentStart = 0;
    let currentSpan = 0;

    days.forEach((day, i) => {
      const m = day.getMonth();
      if (m !== currentMonth) {
        if (currentMonth !== -1) result.push({ label: format(days[currentStart], 'MMMM yyyy', { locale: nl }), span: currentSpan, start: currentStart });
        currentMonth = m;
        currentStart = i;
        currentSpan = 1;
      } else {
        currentSpan++;
      }
    });
    if (currentSpan > 0) result.push({ label: format(days[currentStart], 'MMMM yyyy', { locale: nl }), span: currentSpan, start: currentStart });
    return result;
  }, [days]);

  const todayOffset = useMemo(() => {
    const today = new Date();
    const diff = differenceInDays(today, viewStart);
    if (diff < 0 || diff > days.length) return null;
    return diff;
  }, [viewStart, days.length]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Tijdlijn
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewStart(startOfMonth(new Date()))}>
              Vandaag
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {ganttProjects.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Geen projecten met planning gevonden
          </div>
        ) : (
          <ScrollArea className="w-full">
            <div className="min-w-max">
              {/* Header row: months */}
              <div className="flex border-b border-border sticky top-0 bg-background z-10">
                <div className="shrink-0 border-r border-border bg-muted/30 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider" style={{ width: LABEL_WIDTH }}>
                  Project
                </div>
                <div className="flex">
                  {months.map((m, i) => (
                    <div
                      key={i}
                      className="border-r border-border px-2 py-1.5 text-[10px] font-semibold text-foreground capitalize text-center"
                      style={{ width: m.span * DAY_WIDTH }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Header row: days */}
              <div className="flex border-b border-border sticky top-[30px] bg-background z-10">
                <div className="shrink-0 border-r border-border" style={{ width: LABEL_WIDTH }} />
                <div className="flex">
                  {days.map((day, i) => (
                    <div
                      key={i}
                      className={`text-center text-[9px] py-1 border-r border-border/40 ${
                        isWeekend(day) ? 'bg-muted/40 text-muted-foreground/60' : 'text-muted-foreground'
                      } ${todayOffset === i ? 'bg-primary/10 font-bold text-primary' : ''}`}
                      style={{ width: DAY_WIDTH }}
                    >
                      {day.getDate()}
                    </div>
                  ))}
                </div>
              </div>

              {/* Project rows */}
              <TooltipProvider delayDuration={200}>
                {ganttProjects.map((project) => {
                  const barStart = Math.max(0, differenceInDays(project._start, viewStart));
                  const barEnd = Math.min(days.length, differenceInDays(project._end, viewStart) + 1);
                  const barWidth = Math.max(0, (barEnd - barStart) * DAY_WIDTH);
                  const barOffset = barStart * DAY_WIDTH;
                  const isVisible = barEnd > 0 && barStart < days.length;
                  const statusColor = STATUS_COLORS[project.status] || STATUS_COLORS.planned;

                  return (
                    <div
                      key={project.id}
                      className={`flex border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors ${
                        selectedProjectId === project.id ? 'bg-primary/5' : ''
                      }`}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => onSelectProject?.(project.id)}
                    >
                      {/* Label */}
                      <div className="shrink-0 border-r border-border flex items-center px-3 gap-2" style={{ width: LABEL_WIDTH }}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{project.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{(project as any).customers?.name}</p>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{project.progress_pct}%</span>
                      </div>

                      {/* Bar area */}
                      <div className="flex-1 relative">
                        {/* Weekend shading */}
                        {days.map((day, i) => isWeekend(day) ? (
                          <div key={i} className="absolute top-0 bottom-0 bg-muted/20" style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }} />
                        ) : null)}

                        {/* Today line */}
                        {todayOffset !== null && (
                          <div className="absolute top-0 bottom-0 w-px bg-primary z-10" style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }} />
                        )}

                        {/* Project bar */}
                        {isVisible && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute top-[8px] rounded-md shadow-sm overflow-hidden"
                                style={{ left: barOffset, width: Math.max(barWidth, 8), height: ROW_HEIGHT - 16 }}
                              >
                                {/* Background */}
                                <div className={`absolute inset-0 ${statusColor} opacity-25`} />
                                {/* Progress fill */}
                                <div
                                  className={`absolute inset-y-0 left-0 ${statusColor} opacity-80 rounded-l-md transition-all`}
                                  style={{ width: `${project.progress_pct}%` }}
                                />
                                {/* Label on bar */}
                                {barWidth > 60 && (
                                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-foreground truncate z-10">
                                    {project.title}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[200px]">
                              <p className="font-semibold">{project.title}</p>
                              <p className="text-muted-foreground">{STATUS_LABELS[project.status] || project.status}</p>
                              <p className="text-muted-foreground">
                                {format(project._start, 'd MMM', { locale: nl })} → {format(project._end, 'd MMM yyyy', { locale: nl })}
                              </p>
                              <p className="text-muted-foreground">Voortgang: {project.progress_pct}%</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  );
                })}
              </TooltipProvider>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Projects without dates */}
        {projectsWithoutDates.length > 0 && (
          <div className="border-t border-border p-3">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Zonder planning ({projectsWithoutDates.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {projectsWithoutDates.map(p => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className={`text-[10px] cursor-pointer hover:bg-muted ${selectedProjectId === p.id ? 'ring-1 ring-primary' : ''}`}
                  onClick={() => onSelectProject?.(p.id)}
                >
                  {p.title}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
