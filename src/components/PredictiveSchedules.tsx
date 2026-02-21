import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Brain, Sparkles, RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
  Zap, Clock, Sun, BatteryCharging, TrendingDown, BarChart3, Check,
  Target, ShieldCheck, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface SchedulePeriod {
  startPeriod: number;
  limit: number;
}

interface PredictedSchedule {
  name: string;
  description: string;
  target_charge_point_ids: string[];
  reasoning: string;
  estimated_saving_pct: number;
  profile: {
    connectorId: number;
    stackLevel: number;
    chargingProfilePurpose: string;
    chargingProfileKind: string;
    chargingSchedule: {
      chargingRateUnit: string;
      duration: number;
      chargingSchedulePeriod: SchedulePeriod[];
    };
  };
  confidence: number;
  category: string;
}

interface PredictionResult {
  schedules: PredictedSchedule[];
  summary: string;
  applied?: boolean;
  applied_schedule?: string;
}

const categoryConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  cost_optimization: {
    icon: <TrendingDown className="h-3.5 w-3.5" />,
    label: 'Kostenoptimalisatie',
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  peak_shaving: {
    icon: <BarChart3 className="h-3.5 w-3.5" />,
    label: 'Piekvermijding',
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  },
  solar_alignment: {
    icon: <Sun className="h-3.5 w-3.5" />,
    label: 'Zonuitlijning',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  },
  load_balancing: {
    icon: <Zap className="h-3.5 w-3.5" />,
    label: 'Loadbalancing',
    color: 'bg-primary/10 text-primary border-primary/20',
  },
};

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatPower(watts: number): string {
  return watts >= 1000 ? `${(watts / 1000).toFixed(1)} kW` : `${watts} W`;
}

interface Props {
  chargePoints?: { id: string; name: string; max_power: number | null }[];
}

const PredictiveSchedules = ({ chargePoints }: Props) => {
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const queryClient = useQueryClient();

  const predict = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('predict-charging-schedules');
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast.success('Voorspellende schema\'s gegenereerd');
    } catch (err: any) {
      const msg = err?.message || 'Genereren mislukt';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const applySchedule = useCallback(async (schedule: PredictedSchedule) => {
    const cpId = schedule.target_charge_point_ids?.[0];
    if (!cpId) {
      toast.error('Geen laadpaal toegewezen aan dit schema');
      return;
    }
    setApplying(schedule.name);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('predict-charging-schedules', {
        body: { apply_to_charge_point_id: cpId },
      });
      if (fnError) throw fnError;
      if (data?.apply_error) throw new Error(data.apply_error);
      if (data?.applied) {
        toast.success(`Schema "${schedule.name}" toegepast op ${cpId}`);
        queryClient.invalidateQueries({ queryKey: ['charging-profiles'] });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Toepassen mislukt');
    } finally {
      setApplying(null);
    }
  }, [queryClient]);

  const cpMap = Object.fromEntries((chargePoints || []).map(cp => [cp.id, cp.name]));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-primary/20">
            <Target className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Voorspellende Laadschema's
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">Automatisch geoptimaliseerd op basis van gedragsmodellen</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={predict}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Genereren...' : result ? 'Vernieuw' : 'Genereer Schema\'s'}
          </Button>
          {result && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="p-8 text-center">
          <Target className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Genereer AI-gestuurde laadschema's op basis van gedragspatronen</p>
          <p className="text-xs text-muted-foreground mt-1">Vereist minimaal 1 gedragsanalyse</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="p-8 text-center space-y-3">
          <div className="flex justify-center">
            <div className="relative">
              <Target className="h-10 w-10 text-emerald-600 animate-pulse" />
              <Sparkles className="h-4 w-4 text-emerald-600 absolute -top-1 -right-1 animate-bounce" />
            </div>
          </div>
          <p className="text-sm text-foreground font-medium">AI genereert optimale laadschema's...</p>
          <p className="text-xs text-muted-foreground">Gedragspatronen, tarieven en netwerkbelasting worden geanalyseerd</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-5">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && expanded && (
        <div className="p-5 space-y-5">
          {/* Summary */}
          {result.summary && (
            <div className="rounded-lg bg-muted/30 border border-border px-4 py-3">
              <p className="text-xs text-foreground leading-relaxed">{result.summary}</p>
            </div>
          )}

          {/* Schedule cards */}
          {result.schedules?.map((schedule, i) => {
            const cat = categoryConfig[schedule.category] || categoryConfig.load_balancing;
            const periods = schedule.profile?.chargingSchedule?.chargingSchedulePeriod || [];
            const isApplying = applying === schedule.name;

            return (
              <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Schedule header */}
                <div className="px-4 py-3 border-b border-border/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cat.color.split(' ')[1]}>{cat.icon}</span>
                      <div>
                        <span className="text-sm font-semibold text-foreground">{schedule.name}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{schedule.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cat.color}`}>
                        {cat.label}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {Math.round(schedule.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visual timeline */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>24-uurs profiel</span>
                    {schedule.estimated_saving_pct > 0 && (
                      <span className="ml-auto text-emerald-600 font-medium flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        ~{schedule.estimated_saving_pct}% besparing
                      </span>
                    )}
                  </div>

                  {/* Timeline bar */}
                  <div className="relative h-10 rounded-lg overflow-hidden bg-muted/30 border border-border">
                    {periods.map((period, j) => {
                      const nextStart = j < periods.length - 1
                        ? periods[j + 1].startPeriod
                        : (schedule.profile?.chargingSchedule?.duration || 86400);
                      const totalDuration = schedule.profile?.chargingSchedule?.duration || 86400;
                      const left = (period.startPeriod / totalDuration) * 100;
                      const width = ((nextStart - period.startPeriod) / totalDuration) * 100;
                      const maxPower = Math.max(...periods.map(p => p.limit), 1);
                      const intensity = period.limit / maxPower;

                      return (
                        <div
                          key={j}
                          className="absolute top-0 h-full flex items-center justify-center group"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: period.limit === 0
                              ? 'hsl(var(--muted) / 0.5)'
                              : `hsl(var(--primary) / ${0.15 + intensity * 0.6})`,
                            borderRight: j < periods.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                          }}
                        >
                          {width > 8 && (
                            <span className="text-[9px] font-mono text-foreground/70">
                              {formatPower(period.limit)}
                            </span>
                          )}
                          {/* Tooltip */}
                          <div className="absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border border-border rounded px-2 py-1 shadow-sm z-10 whitespace-nowrap">
                            <span className="text-[10px] font-mono text-foreground">
                              {formatTime(period.startPeriod)}–{formatTime(nextStart)} · {formatPower(period.limit)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {/* Time markers */}
                    {[0, 6, 12, 18].map(h => (
                      <div
                        key={h}
                        className="absolute top-0 h-full border-l border-border/30"
                        style={{ left: `${(h * 3600 / (schedule.profile?.chargingSchedule?.duration || 86400)) * 100}%` }}
                      >
                        <span className="absolute -bottom-4 left-0 text-[8px] font-mono text-muted-foreground">
                          {h}h
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Period details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-3">
                    {periods.map((period, j) => {
                      const nextStart = j < periods.length - 1
                        ? periods[j + 1].startPeriod
                        : (schedule.profile?.chargingSchedule?.duration || 86400);
                      return (
                        <div key={j} className="rounded-md bg-muted/20 px-2 py-1.5 text-[10px]">
                          <span className="font-mono text-muted-foreground">
                            {formatTime(period.startPeriod)}–{formatTime(nextStart)}
                          </span>
                          <p className="font-mono font-semibold text-foreground">{formatPower(period.limit)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reasoning + apply */}
                <div className="px-4 py-3 border-t border-border/50 space-y-2">
                  <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
                    <p className="text-[11px] text-primary flex items-start gap-1.5">
                      <Brain className="h-3 w-3 shrink-0 mt-0.5" />
                      {schedule.reasoning}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground">
                      Doel: {schedule.target_charge_point_ids?.map(id => cpMap[id] || id).join(', ') || 'Alle laadpalen'}
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      variant="default"
                      disabled={isApplying || !schedule.target_charge_point_ids?.length}
                      onClick={() => applySchedule(schedule)}
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Toepassen...
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3" />
                          Toepassen
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PredictiveSchedules;
