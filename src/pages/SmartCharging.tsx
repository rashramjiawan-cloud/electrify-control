import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useChargePoints } from '@/hooks/useChargePoints';
import { useChargingProfiles, useSetChargingProfile, useClearChargingProfile, type SchedulePeriod } from '@/hooks/useChargingProfiles';
import { toast } from 'sonner';
import { Zap, Plus, Trash2, Clock, Gauge, Play } from 'lucide-react';

const SmartCharging = () => {
  const { data: chargePoints } = useChargePoints();
  const { data: profiles, isLoading } = useChargingProfiles();
  const setProfile = useSetChargingProfile();
  const clearProfile = useClearChargingProfile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [simDialogOpen, setSimDialogOpen] = useState(false);
  const [selectedCp, setSelectedCp] = useState('');
  const [connectorId, setConnectorId] = useState('0');
  const [stackLevel, setStackLevel] = useState('0');
  const [purpose, setPurpose] = useState('TxDefaultProfile');
  const [kind, setKind] = useState('Relative');
  const [unit, setUnit] = useState('W');
  const [duration, setDuration] = useState('86400');
  const [minRate, setMinRate] = useState('');
  const [periods, setPeriods] = useState<SchedulePeriod[]>([
    { startPeriod: 0, limit: 7400 },
  ]);

  const addPeriod = () => {
    const lastEnd = periods.length > 0 ? periods[periods.length - 1].startPeriod + 3600 : 0;
    setPeriods([...periods, { startPeriod: lastEnd, limit: 7400 }]);
  };

  const removePeriod = (idx: number) => {
    setPeriods(periods.filter((_, i) => i !== idx));
  };

  const updatePeriod = (idx: number, field: keyof SchedulePeriod, value: number) => {
    setPeriods(periods.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handleSubmit = async () => {
    if (!selectedCp) {
      toast.error('Selecteer een laadpaal');
      return;
    }
    if (periods.length === 0) {
      toast.error('Voeg minimaal één periode toe');
      return;
    }

    try {
      await setProfile.mutateAsync({
        chargePointId: selectedCp,
        connectorId: Number(connectorId),
        profile: {
          stackLevel: Number(stackLevel),
          chargingProfilePurpose: purpose,
          chargingProfileKind: kind,
          chargingSchedule: {
            chargingRateUnit: unit,
            duration: duration ? Number(duration) : undefined,
            minChargingRate: minRate ? Number(minRate) : undefined,
            chargingSchedulePeriod: periods,
          },
        },
      });
      toast.success('Laadprofiel ingesteld');
      setDialogOpen(false);
    } catch {
      toast.error('Fout bij instellen profiel');
    }
  };

  const simScenarios = [
    {
      name: 'Piekuren beperken',
      desc: 'Vermogen verlagen tijdens piekuren (17:00-21:00)',
      purpose: 'ChargePointMaxProfile',
      kind: 'Absolute',
      unit: 'W',
      duration: 86400,
      periods: [
        { startPeriod: 0, limit: 11000 },
        { startPeriod: 61200, limit: 3700 },
        { startPeriod: 75600, limit: 11000 },
      ],
    },
    {
      name: 'Nachtladen',
      desc: 'Alleen laden tussen 23:00-07:00 met max vermogen',
      purpose: 'ChargePointMaxProfile',
      kind: 'Absolute',
      unit: 'W',
      duration: 86400,
      periods: [
        { startPeriod: 0, limit: 0 },
        { startPeriod: 82800, limit: 11000 },
      ],
    },
    {
      name: 'Geleidelijke opbouw',
      desc: 'Start laag en bouw vermogen geleidelijk op',
      purpose: 'TxDefaultProfile',
      kind: 'Relative',
      unit: 'W',
      duration: 7200,
      periods: [
        { startPeriod: 0, limit: 2300 },
        { startPeriod: 1800, limit: 5000 },
        { startPeriod: 3600, limit: 7400 },
        { startPeriod: 5400, limit: 11000 },
      ],
    },
    {
      name: 'Zonnepanelen prioriteit',
      desc: 'Overdag hoog vermogen (zonuren), avond laag',
      purpose: 'ChargePointMaxProfile',
      kind: 'Absolute',
      unit: 'W',
      duration: 86400,
      periods: [
        { startPeriod: 0, limit: 3700 },
        { startPeriod: 28800, limit: 11000 },
        { startPeriod: 57600, limit: 7400 },
        { startPeriod: 72000, limit: 3700 },
      ],
    },
  ];

  const handleSimulate = async (scenario: typeof simScenarios[0]) => {
    if (!selectedCp && chargePoints?.length) {
      setSelectedCp(chargePoints[0].id);
    }
    const cpId = selectedCp || chargePoints?.[0]?.id;
    if (!cpId) {
      toast.error('Geen laadpaal beschikbaar');
      return;
    }
    try {
      await setProfile.mutateAsync({
        chargePointId: cpId,
        connectorId: 0,
        profile: {
          stackLevel: 0,
          chargingProfilePurpose: scenario.purpose,
          chargingProfileKind: scenario.kind,
          chargingSchedule: {
            chargingRateUnit: scenario.unit,
            duration: scenario.duration,
            chargingSchedulePeriod: scenario.periods,
          },
        },
      });
      toast.success(`Simulatie "${scenario.name}" geactiveerd`);
      setSimDialogOpen(false);
    } catch {
      toast.error('Fout bij starten simulatie');
    }
  };

  const handleClear = async (profile: { id: number; charge_point_id: string }) => {
    try {
      await clearProfile.mutateAsync({
        chargePointId: profile.charge_point_id,
        id: profile.id,
      });
      toast.success('Profiel verwijderd');
    } catch {
      toast.error('Fout bij verwijderen profiel');
    }
  };

  const formatLimit = (limit: number, scheduleUnit: string) =>
    scheduleUnit === 'A' ? `${limit} A` : `${(limit / 1000).toFixed(1)} kW`;

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}u${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
  };

  const getCpName = (id: string) => chargePoints?.find(cp => cp.id === id)?.name || id;

  return (
    <AppLayout title="Smart Charging" subtitle="Laadprofielen en vermogenssturing">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {profiles?.length || 0} actieve profielen
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setSimDialogOpen(true)}>
              <Play className="h-4 w-4" />
              Simulatie
            </Button>
            <Button className="gap-2" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Nieuw profiel
            </Button>
          </div>
        </div>

        {/* Profiles list */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Laden...</div>
        ) : !profiles || profiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <Gauge className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Geen actieve laadprofielen</p>
            <p className="text-xs text-muted-foreground mt-1">Maak een profiel aan om het laadvermogen te sturen</p>
          </div>
        ) : (
          <div className="space-y-4">
            {profiles.map(profile => (
              <div key={profile.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {getCpName(profile.charge_point_id)}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          Connector {profile.connector_id}
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        {profile.charging_profile_purpose} · {profile.charging_profile_kind} · Stack {profile.stack_level}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium">
                      {profile.charging_schedule_unit === 'A' ? 'Ampère' : 'Watt'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => handleClear(profile)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Verwijder
                    </Button>
                  </div>
                </div>

                {/* Schedule periods visualization */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Schedule ({profile.schedule_periods.length} perioden)
                    </span>
                    {profile.duration && (
                      <span className="text-xs text-muted-foreground">· Duur: {formatDuration(profile.duration)}</span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {profile.schedule_periods.map((period, idx) => {
                      const nextStart = idx < profile.schedule_periods.length - 1
                        ? profile.schedule_periods[idx + 1].startPeriod
                        : profile.duration || period.startPeriod + 3600;
                      const periodDuration = nextStart - period.startPeriod;
                      const maxLimit = Math.max(...profile.schedule_periods.map(p => p.limit));
                      const widthPct = maxLimit > 0 ? (period.limit / maxLimit) * 100 : 100;

                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="font-mono text-[11px] text-muted-foreground w-16 text-right shrink-0">
                            {formatDuration(period.startPeriod)}
                          </span>
                          <div className="flex-1 h-7 bg-muted/30 rounded overflow-hidden relative">
                            <div
                              className="h-full bg-primary/20 border border-primary/30 rounded flex items-center px-2 transition-all"
                              style={{ width: `${Math.max(widthPct, 10)}%` }}
                            >
                              <span className="font-mono text-[11px] font-semibold text-primary whitespace-nowrap">
                                {formatLimit(period.limit, profile.charging_schedule_unit)}
                              </span>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground w-12 shrink-0">
                            {formatDuration(periodDuration)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Profile Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nieuw laadprofiel</DialogTitle>
            <DialogDescription>Stel een vermogensprofiel in voor een laadpaal</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Laadpaal</Label>
                <Select value={selectedCp} onValueChange={setSelectedCp}>
                  <SelectTrigger><SelectValue placeholder="Kies..." /></SelectTrigger>
                  <SelectContent>
                    {chargePoints?.map(cp => (
                      <SelectItem key={cp.id} value={cp.id}>{cp.name} ({cp.id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Connector ID</Label>
                <Input value={connectorId} onChange={e => setConnectorId(e.target.value)} type="number" className="font-mono text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Purpose</Label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ChargePointMaxProfile">CP Max Profile</SelectItem>
                    <SelectItem value="TxDefaultProfile">TX Default</SelectItem>
                    <SelectItem value="TxProfile">TX Profile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kind</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Absolute">Absolute</SelectItem>
                    <SelectItem value="Relative">Relative</SelectItem>
                    <SelectItem value="Recurring">Recurring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Eenheid</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="W">Watt (W)</SelectItem>
                    <SelectItem value="A">Ampère (A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Stack Level</Label>
                <Input value={stackLevel} onChange={e => setStackLevel(e.target.value)} type="number" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Duur (sec)</Label>
                <Input value={duration} onChange={e => setDuration(e.target.value)} type="number" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min. rate ({unit})</Label>
                <Input value={minRate} onChange={e => setMinRate(e.target.value)} type="number" className="font-mono text-sm" placeholder="optioneel" />
              </div>
            </div>

            {/* Schedule periods */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Schedule perioden</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addPeriod}>
                  <Plus className="h-3 w-3" /> Periode
                </Button>
              </div>
              {periods.map((period, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Start (sec)</Label>
                      <Input
                        value={period.startPeriod}
                        onChange={e => updatePeriod(idx, 'startPeriod', Number(e.target.value))}
                        type="number"
                        className="font-mono text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Limiet ({unit})</Label>
                      <Input
                        value={period.limit}
                        onChange={e => updatePeriod(idx, 'limit', Number(e.target.value))}
                        type="number"
                        className="font-mono text-xs h-8"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive mt-4"
                    onClick={() => removePeriod(idx)}
                    disabled={periods.length <= 1}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleSubmit} disabled={setProfile.isPending}>
              {setProfile.isPending ? 'Instellen...' : 'Profiel instellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Simulation Dialog */}
      <Dialog open={simDialogOpen} onOpenChange={setSimDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              Simulatie scenario's
            </DialogTitle>
            <DialogDescription>
              Kies een scenario om direct een laadprofiel te simuleren
              {chargePoints?.length ? ` op ${selectedCp ? getCpName(selectedCp) : getCpName(chargePoints[0].id)}` : ''}
            </DialogDescription>
          </DialogHeader>

          {chargePoints && chargePoints.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Laadpaal</Label>
              <Select value={selectedCp || chargePoints[0]?.id} onValueChange={setSelectedCp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {chargePoints.map(cp => (
                    <SelectItem key={cp.id} value={cp.id}>{cp.name} ({cp.id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-3">
            {simScenarios.map((scenario, idx) => (
              <button
                key={idx}
                onClick={() => handleSimulate(scenario)}
                disabled={setProfile.isPending}
                className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-semibold text-foreground">{scenario.name}</h4>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {scenario.periods.length} perioden
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{scenario.desc}</p>
                <div className="flex gap-1 mt-2">
                  {scenario.periods.map((p, i) => {
                    const maxLim = Math.max(...scenario.periods.map(x => x.limit));
                    const h = maxLim > 0 ? Math.max((p.limit / maxLim) * 20, 2) : 2;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-primary/30"
                        style={{ height: `${h}px` }}
                      />
                    );
                  })}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default SmartCharging;
