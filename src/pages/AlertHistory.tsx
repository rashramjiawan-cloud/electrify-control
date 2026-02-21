import AppLayout from '@/components/AppLayout';
import { useGridAlertHistory, useAcknowledgeAlert, useAcknowledgeAllAlerts, useClearAlertHistory } from '@/hooks/useGridAlertHistory';
import { useGtvExceedances } from '@/hooks/useGtvExceedances';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Check, CheckCheck, Trash2, Zap } from 'lucide-react';

const METRIC_LABELS: Record<string, string> = {
  voltage: 'Spanning',
  frequency: 'Frequentie',
  pf: 'Power Factor',
};

const AlertHistory = () => {
  const { data: alerts, isLoading } = useGridAlertHistory(200);
  const { data: gtvExceedances, isLoading: gtvLoading } = useGtvExceedances(200);
  const ackMutation = useAcknowledgeAlert();
  const ackAllMutation = useAcknowledgeAllAlerts();
  const clearMutation = useClearAlertHistory();

  const unacknowledgedCount = alerts?.filter(a => !a.acknowledged).length ?? 0;

  return (
    <AppLayout title="Alert Historie" subtitle="Overzicht van alle historische grid alerts en GTV-overschrijdingen">
      <Tabs defaultValue="grid" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="grid" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Grid Alerts
            {unacknowledgedCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-[10px]">
                {unacknowledgedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="gtv" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            GTV Overschrijdingen
            {(gtvExceedances?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px]">
                {gtvExceedances?.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Grid Alerts Tab */}
        <TabsContent value="grid">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-muted-foreground">
                {unacknowledgedCount > 0
                  ? `${unacknowledgedCount} onbevestigde alert${unacknowledgedCount !== 1 ? 's' : ''}`
                  : 'Geen openstaande alerts'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {unacknowledgedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => ackAllMutation.mutate()}
                  disabled={ackAllMutation.isPending}
                >
                  <CheckCheck className="h-4 w-4 mr-1.5" />
                  Alles bevestigen
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending || !alerts?.length}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Wis historie
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Tijdstip</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Waarde</TableHead>
                  <TableHead>Bereik</TableHead>
                  <TableHead>Richting</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <span className="text-muted-foreground animate-pulse">Laden...</span>
                    </TableCell>
                  </TableRow>
                ) : !alerts?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <span className="text-muted-foreground">Geen alerts gevonden</span>
                    </TableCell>
                  </TableRow>
                ) : (
                  alerts.map((alert) => (
                    <TableRow key={alert.id} className={!alert.acknowledged ? 'bg-destructive/5' : ''}>
                      <TableCell className="font-mono text-xs">
                        {new Date(alert.created_at).toLocaleString('nl-NL', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          Fase {alert.channel + 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {METRIC_LABELS[alert.metric] || alert.metric}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-destructive font-medium">
                        {alert.value}{alert.unit ? ` ${alert.unit}` : ''}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {alert.threshold_min}–{alert.threshold_max}{alert.unit ? ` ${alert.unit}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant={alert.direction === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                          {alert.direction === 'high' ? '↑ Te hoog' : '↓ Te laag'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {alert.acknowledged ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Check className="h-3 w-3" /> OK
                          </span>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Nieuw</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!alert.acknowledged && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => ackMutation.mutate(alert.id)}
                            disabled={ackMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* GTV Exceedances Tab */}
        <TabsContent value="gtv">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-warning" />
              <span className="text-sm text-muted-foreground">
                {gtvExceedances?.length
                  ? `${gtvExceedances.length} GTV-overschrijding${gtvExceedances.length !== 1 ? 'en' : ''} geregistreerd`
                  : 'Geen GTV-overschrijdingen geregistreerd'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Tijdstip</TableHead>
                  <TableHead>Richting</TableHead>
                  <TableHead>Vermogen</TableHead>
                  <TableHead>GTV Limiet</TableHead>
                  <TableHead>Overschrijding</TableHead>
                  <TableHead>Duur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gtvLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <span className="text-muted-foreground animate-pulse">Laden...</span>
                    </TableCell>
                  </TableRow>
                ) : !gtvExceedances?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <span className="text-muted-foreground">Geen GTV-overschrijdingen gevonden</span>
                    </TableCell>
                  </TableRow>
                ) : (
                  gtvExceedances.map((exc) => {
                    const overBy = exc.power_kw - exc.limit_kw;
                    const overPct = exc.limit_kw > 0 ? Math.round((overBy / exc.limit_kw) * 100) : 0;
                    const durationMin = Math.floor(exc.duration_sec / 60);
                    const durationSec = exc.duration_sec % 60;

                    return (
                      <TableRow key={exc.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(exc.created_at).toLocaleString('nl-NL', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={exc.direction === 'import' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {exc.direction === 'import' ? '↓ Afname' : '↑ Teruglevering'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-destructive font-medium">
                          {exc.power_kw.toFixed(1)} kW
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {exc.limit_kw.toFixed(0)} kW
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm text-destructive font-medium">
                            +{overBy.toFixed(1)} kW
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({overPct}%)
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {durationMin > 0 ? `${durationMin}m ${durationSec}s` : `${durationSec}s`}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default AlertHistory;
