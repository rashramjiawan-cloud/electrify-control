import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Brain, Clock, Zap, Sun, BatteryCharging, User, TrendingUp, RefreshCw, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Calendar, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts';

interface Pattern {
  title: string;
  description: string;
  confidence: number;
  impact: 'high' | 'medium' | 'low';
  recommendation: string;
  icon: string;
}

interface UserProfile {
  user: string;
  type: string;
  avg_session_kwh: number;
  preferred_hours: string;
  frequency: string;
  predictability: number;
}

interface PeakHour {
  hour: number;
  load_pct: number;
}

interface BehaviorAnalysis {
  patterns: Pattern[];
  user_profiles: UserProfile[];
  peak_hours: PeakHour[];
  summary: string;
}

interface HistoricalEntry {
  analysis_date: string;
  transaction_count: number;
  total_energy_kwh: number;
  patterns: Pattern[];
  summary: string | null;
}

const iconMap: Record<string, React.ReactNode> = {
  clock: <Clock className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  sun: <Sun className="h-4 w-4" />,
  battery: <BatteryCharging className="h-4 w-4" />,
  user: <User className="h-4 w-4" />,
  trend: <TrendingUp className="h-4 w-4" />,
};

const impactColors: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  low: 'bg-primary/10 text-primary border-primary/20',
};

const typeLabels: Record<string, string> = {
  commuter: 'Forens',
  fleet: 'Wagenpark',
  occasional: 'Incidenteel',
  night_charger: 'Nachtlader',
};

const ChargingBehaviorModels = () => {
  const [analysis, setAnalysis] = useState<BehaviorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [history, setHistory] = useState<HistoricalEntry[]>([]);
  const [showTrend, setShowTrend] = useState(false);

  // Load historical data
  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('charging_behavior_analyses')
      .select('analysis_date, transaction_count, total_energy_kwh, patterns, summary')
      .order('analysis_date', { ascending: true })
      .limit(30);
    if (data) setHistory(data as unknown as HistoricalEntry[]);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-charging-behavior');
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setAnalysis(data);
      toast.success('Gedragsanalyse voltooid en opgeslagen');
      loadHistory();
    } catch (err: any) {
      const msg = err?.message || 'Analyse mislukt';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  const trendData = history.map(h => ({
    date: new Date(h.analysis_date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }),
    transacties: h.transaction_count,
    energie: h.total_energy_kwh,
    patronen: Array.isArray(h.patterns) ? h.patterns.length : 0,
  }));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Gedragsmodellen
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Laadpatronen en gebruikersprofielen
              {history.length > 0 && (
                <span className="ml-1 text-muted-foreground/60">· {history.length} analyse{history.length !== 1 ? 's' : ''} opgeslagen</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <Button
              variant={showTrend ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowTrend(!showTrend)}
            >
              <BarChart3 className="h-3 w-3" />
              Trends
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={analyze}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyseren...' : analysis ? 'Heranalyseer' : 'Analyseer'}
          </Button>
          {analysis && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Trend View */}
      {showTrend && history.length > 0 && (
        <div className="p-5 border-b border-border space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trendoverzicht</h4>
          </div>
          
          {trendData.length >= 2 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="transacties" name="Transacties" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="energie" name="Energie (kWh)" stroke="hsl(var(--chart-2, 142 71% 45%))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="patronen" name="Patronen" stroke="hsl(var(--chart-4, 280 65% 60%))" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <div className="text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Minimaal 2 analyses nodig voor trends</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">De dagelijkse analyse draait automatisch</p>
              </div>
            </div>
          )}

          {/* History list */}
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {[...history].reverse().map((h, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-md bg-muted/20 text-[11px]">
                <span className="font-mono text-muted-foreground">
                  {new Date(h.analysis_date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{h.transaction_count} tx</span>
                  <span>{h.total_energy_kwh} kWh</span>
                  <span>{Array.isArray(h.patterns) ? h.patterns.length : 0} patronen</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content - existing analysis view */}
      {!analysis && !loading && !error && (
        <div className="p-8 text-center">
          <Brain className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Klik op "Analyseer" om AI-gestuurde gedragsmodellen te genereren</p>
          <p className="text-xs text-muted-foreground mt-1">Resultaten worden automatisch dagelijks opgeslagen</p>
        </div>
      )}

      {loading && (
        <div className="p-8 text-center space-y-3">
          <div className="flex justify-center">
            <div className="relative">
              <Brain className="h-10 w-10 text-primary animate-pulse" />
              <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1 animate-bounce" />
            </div>
          </div>
          <p className="text-sm text-foreground font-medium">AI analyseert laadgedrag...</p>
          <p className="text-xs text-muted-foreground">Transacties worden verwerkt tot patronen</p>
        </div>
      )}

      {error && (
        <div className="p-5">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        </div>
      )}

      {analysis && expanded && (
        <div className="p-5 space-y-5">
          {analysis.summary && (
            <div className="rounded-lg bg-muted/30 border border-border px-4 py-3">
              <p className="text-xs text-foreground leading-relaxed">{analysis.summary}</p>
            </div>
          )}

          {analysis.patterns?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patronen</h4>
              <div className="grid gap-3">
                {analysis.patterns.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-primary">{iconMap[p.icon] || iconMap.trend}</span>
                        <span className="text-sm font-semibold text-foreground">{p.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${impactColors[p.impact] || impactColors.low}`}>
                          {p.impact === 'high' ? 'Hoog' : p.impact === 'medium' ? 'Midden' : 'Laag'}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">{Math.round(p.confidence * 100)}%</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                    <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
                      <p className="text-[11px] text-primary flex items-center gap-1.5">
                        <Zap className="h-3 w-3 shrink-0" />
                        {p.recommendation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.user_profiles?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gebruikersprofielen</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.user_profiles.map((u, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground truncate">{u.user}</span>
                      </div>
                      <span className="text-[10px] font-mono rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {typeLabels[u.type] || u.type}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Gem. sessie</span>
                        <p className="font-mono font-medium text-foreground">{u.avg_session_kwh?.toFixed(1)} kWh</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Voorkeurstijd</span>
                        <p className="font-mono font-medium text-foreground">{u.preferred_hours}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Frequentie</span>
                        <p className="font-medium text-foreground">{u.frequency}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Voorspelbaarheid</span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(u.predictability || 0) * 100}%` }} />
                          </div>
                          <span className="font-mono text-foreground">{Math.round((u.predictability || 0) * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.peak_hours?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Piekuren</h4>
              <div className="flex items-end gap-0.5 h-20">
                {Array.from({ length: 24 }, (_, h) => {
                  const peak = analysis.peak_hours.find(p => p.hour === h);
                  const pct = peak?.load_pct || 0;
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                      <div
                        className={`w-full rounded-t transition-all ${
                          pct > 80 ? 'bg-destructive/70' : pct > 50 ? 'bg-yellow-500/60' : pct > 0 ? 'bg-primary/40' : 'bg-muted/30'
                        }`}
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                      {h % 4 === 0 && (
                        <span className="text-[8px] font-mono text-muted-foreground">{h}h</span>
                      )}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border border-border rounded px-1.5 py-0.5 shadow-sm z-10 whitespace-nowrap">
                        <span className="text-[10px] font-mono text-foreground">{h}:00 · {pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChargingBehaviorModels;
