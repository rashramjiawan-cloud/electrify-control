import { useState } from 'react';
import { useMeterAiModels, type ModelType } from '@/hooks/useMeterAiModels';
import MeterAiModelHistoryChart from '@/components/MeterAiModelHistoryChart';
import { Brain, TrendingUp, TrendingDown, Timer, TimerOff, CheckCircle2, Loader2, AlertTriangle, Play, Trash2, Bell, BellOff, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface MeterAiModelWidgetProps {
  meterId: string;
  meterName?: string;
}

const MODEL_INFO: Record<ModelType, { label: string; description: string; icon: typeof TrendingUp }> = {
  consumption_high: {
    label: 'Hoog verbruik detectie',
    description: 'Detecteert wanneer het apparaat meer energie verbruikt dan normaal.',
    icon: TrendingUp,
  },
  consumption_low: {
    label: 'Laag verbruik detectie',
    description: 'Detecteert wanneer het apparaat minder energie verbruikt dan normaal.',
    icon: TrendingDown,
  },
  long_working_cycle: {
    label: 'Lange werkcycli',
    description: 'Detecteert wanneer het apparaat langer draait dan verwacht, wat kan wijzen op spanning of inefficiëntie.',
    icon: Timer,
  },
  long_idle_cycle: {
    label: 'Lange rustcycli',
    description: 'Detecteert wanneer het apparaat langer inactief is dan verwacht, wat kan wijzen op inefficiënt gebruik.',
    icon: TimerOff,
  },
};

export default function MeterAiModelWidget({ meterId, meterName }: MeterAiModelWidgetProps) {
  const { models, isLoading, readyCount, totalSlots, MODEL_TYPES, trainModel, toggleAlerts, deleteModel } = useMeterAiModels(meterId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-64 mb-4" />
        <Skeleton className="h-3 w-full mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const progressPct = (readyCount / totalSlots) * 100;

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div
        className="border-b border-border px-4 sm:px-5 py-4 flex items-center justify-between cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">AI Performance Model</h3>
            <p className="text-[11px] text-muted-foreground">
              {readyCount} / {totalSlots} modellen getraind
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {readyCount > 0 && (
            <div className="hidden sm:flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] text-primary font-medium">{readyCount} actief</span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="p-4 sm:p-5 space-y-5">
          {/* Intro text */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Door je apparaat te trainen met AI-modellen kun je eenvoudig problemen en inefficiënties in de prestaties opsporen, zodat je potentiële problemen vroegtijdig kunt signaleren.
            </p>
            <div className="flex items-center gap-3">
              <Progress value={progressPct} className="flex-1 h-2" />
              <span className="text-xs font-mono text-muted-foreground shrink-0">{readyCount}/{totalSlots}</span>
            </div>
          </div>

          {/* Model cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODEL_TYPES.map((type) => {
              const info = MODEL_INFO[type];
              const Icon = info.icon;
              const model = models.find(m => m.model_type === type);
              const status = model?.status ?? 'not_trained';
              const isTraining = status === 'training' || trainModel.isPending && trainModel.variables?.modelType === type;
              const isReady = status === 'ready';
              const isFailed = status === 'failed';

              return (
                <div
                  key={type}
                  className={`rounded-lg border p-4 transition-colors ${
                    isReady
                      ? 'border-primary/30 bg-primary/5'
                      : isFailed
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 shrink-0 ${isReady ? 'text-primary' : isFailed ? 'text-destructive' : 'text-muted-foreground'}`} />
                      <span className="text-xs font-semibold text-foreground">{info.label}</span>
                    </div>
                    {isReady && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    )}
                    {isFailed && (
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    {isTraining && (
                      <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">{info.description}</p>

                  {/* AI Summary */}
                  {isReady && model?.baseline_data?.aiSummary && (
                    <div className="rounded-md bg-card border border-border px-3 py-2 mb-3">
                      <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                        {model.baseline_data.aiSummary}
                      </p>
                    </div>
                  )}

                  {/* Baseline stats */}
                  {isReady && model?.baseline_data && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                      {model.baseline_data.mean != null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          μ={model.baseline_data.mean}W
                        </span>
                      )}
                      {model.baseline_data.stdDev != null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          σ={model.baseline_data.stdDev}W
                        </span>
                      )}
                      {model.baseline_data.threshold != null && (
                        <span className="text-[10px] font-mono text-primary">
                          drempel={model.baseline_data.threshold}W
                        </span>
                      )}
                      {model.baseline_data.thresholdMin != null && (
                        <span className="text-[10px] font-mono text-primary">
                          drempel={model.baseline_data.thresholdMin}min
                        </span>
                      )}
                    </div>
                  )}

                  {/* Failed error */}
                  {isFailed && model?.baseline_data?.error && (
                    <p className="text-[10px] text-destructive mb-3">{model.baseline_data.error}</p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!isReady && !isTraining && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1.5"
                        onClick={() => trainModel.mutate({ meterId, modelType: type })}
                        disabled={trainModel.isPending}
                      >
                        <Play className="h-3 w-3" />
                        {isFailed ? 'Opnieuw trainen' : 'Train model'}
                      </Button>
                    )}
                    {isReady && model && (
                      <>
                        <div className="flex items-center gap-1.5">
                          {model.alerts_enabled ? (
                            <Bell className="h-3 w-3 text-primary" />
                          ) : (
                            <BellOff className="h-3 w-3 text-muted-foreground" />
                          )}
                          <Switch
                            checked={model.alerts_enabled}
                            onCheckedChange={(checked) => toggleAlerts.mutate({ modelId: model.id, enabled: checked })}
                            className="scale-75 origin-left"
                          />
                          <span className="text-[10px] text-muted-foreground">Alerts</span>
                        </div>
                        <div className="ml-auto flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => trainModel.mutate({ meterId, modelType: type })}
                            disabled={trainModel.isPending}
                            title="Opnieuw trainen"
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteModel.mutate(model.id)}
                            title="Verwijderen"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                    {isTraining && (
                      <span className="text-[11px] text-muted-foreground">Training bezig...</span>
                    )}
                  </div>

                  {/* Trained timestamp */}
                  {isReady && model?.trained_at && (
                    <p className="text-[9px] text-muted-foreground mt-2">
                      Getraind: {new Date(model.trained_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}

                  {/* History trend chart */}
                  {isReady && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <MeterAiModelHistoryChart
                        meterId={meterId}
                        modelType={type}
                        modelLabel={info.label}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer info */}
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Wanneer een model is getraind, ontvang je automatische meldingen bij afwijkingen van het normale patroon.
          </p>
        </div>
      )}
    </div>
  );
}
