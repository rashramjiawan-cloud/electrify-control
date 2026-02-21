import { useState, useMemo, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useChargePoints } from '@/hooks/useChargePoints';
import { useChargingProfiles, useSetChargingProfile, useClearChargingProfile, type SchedulePeriod } from '@/hooks/useChargingProfiles';
import { useChargingTariffs } from '@/hooks/useChargingTariffs';
import { toast } from 'sonner';
import { Zap, Plus, Trash2, Clock, Gauge, Play, Sun, BatteryCharging, Cable, Bolt, Euro, GripVertical, Eye, EyeOff, Settings2, Activity } from 'lucide-react';
import PowerChart from '@/components/PowerChart';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEnergyMeters, useCreateMeter, useDeleteMeter, usePollMeter, useTestMeterConnection, type EnergyMeter } from '@/hooks/useEnergyMeters';
import { useLocalAutoPoll } from '@/hooks/useLocalPoll';

type ModuleId = 'power-chart' | 'profiles' | 'shelly-meter';

interface ModuleConfig {
  id: ModuleId;
  label: string;
  visible: boolean;
}

const DEFAULT_MODULES: ModuleConfig[] = [
  { id: 'power-chart', label: 'Vermogensgrafiek', visible: true },
  { id: 'profiles', label: 'Laadprofielen', visible: true },
  { id: 'shelly-meter', label: 'Shelly Energiemeter', visible: true },
];

// Extracted meter item with local poll hook (hooks must be at top level)
const MeterItem = ({ meter, pollMeter, deleteMeter }: { meter: EnergyMeter; pollMeter: any; deleteMeter: any }) => {
  const [localActive, setLocalActive] = useState(false);
  const localAutoRef = useLocalAutoPoll(localActive ? meter : undefined, 10000);

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{meter.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {meter.connection_type === 'tcp_ip' ? `TCP/IP ${meter.host}:${meter.port}` : `RS485 addr ${meter.modbus_address}`}
            {meter.last_poll_at && ` · Laatste poll: ${new Date(meter.last_poll_at).toLocaleTimeString('nl-NL')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Local auto-poll toggle */}
          <div className="flex items-center gap-1.5 mr-2">
            <Switch
              checked={localActive}
              onCheckedChange={setLocalActive}
              className="scale-75"
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {localActive ? (
                <span className="flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  Lokaal actief
                </span>
              ) : 'Lokaal'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={pollMeter.isPending}
            onClick={() => meter.host && pollMeter.mutate(
              { meter_id: meter.id, host: meter.host!, port: meter.port },
              {
                onSuccess: (res: any) => {
                  if (res?.success) toast.success('Meterdata opgehaald (cloud)');
                  else toast.error(res?.error || 'Fout bij ophalen');
                },
                onError: () => toast.error('Cloud verbinding mislukt'),
              }
            )}
          >
            <Zap className="h-3 w-3" />
            {pollMeter.isPending ? 'Ophalen...' : 'Cloud Poll'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm('Meter verwijderen?')) {
                deleteMeter.mutate(meter.id, {
                  onSuccess: () => toast.success('Meter verwijderd'),
                });
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Local poll error */}
      {localActive && localAutoRef.error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-xs text-destructive">{localAutoRef.error}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Zorg dat de Shelly op hetzelfde netwerk zit als je browser en CORS toestaat.
          </p>
        </div>
      )}

      {/* Last local poll indicator */}
      {localActive && localAutoRef.lastPoll && (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
          </span>
          <span className="text-[10px] text-muted-foreground">
            Lokaal gepolled: {localAutoRef.lastPoll.toLocaleTimeString('nl-NL')} · elke 10s
          </span>
        </div>
      )}

      {/* Live data display */}
      {meter.last_reading?.channels && (
        <div className="grid grid-cols-2 gap-3">
          {(meter.last_reading.channels as any[]).map((ch: any) => (
            <div key={ch.channel} className="rounded-lg bg-muted/30 p-3 space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Kanaal {ch.channel + 1}
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {ch.voltage != null && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Spanning</span>
                    <span className="font-mono text-xs text-foreground">{Number(ch.voltage).toFixed(1)} V</span>
                  </div>
                )}
                {ch.current != null && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Stroom</span>
                    <span className="font-mono text-xs text-foreground">{Number(ch.current).toFixed(2)} A</span>
                  </div>
                )}
                {ch.active_power != null && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Vermogen</span>
                    <span className="font-mono text-xs font-bold text-primary">{Number(ch.active_power).toFixed(0)} W</span>
                  </div>
                )}
                {ch.power_factor != null && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">PF</span>
                    <span className="font-mono text-xs text-foreground">{Number(ch.power_factor).toFixed(2)}</span>
                  </div>
                )}
                {ch.total_energy != null && (
                  <div className="flex justify-between col-span-2">
                    <span className="text-xs text-muted-foreground">Totaal</span>
                    <span className="font-mono text-xs text-foreground">{Number(ch.total_energy).toFixed(1)} kWh</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SmartCharging = () => {
  const { data: chargePoints } = useChargePoints();
  const { data: profiles, isLoading } = useChargingProfiles();
  const setProfile = useSetChargingProfile();
  const clearProfile = useClearChargingProfile();
  const { data: meters } = useEnergyMeters();
  const createMeter = useCreateMeter();
  const deleteMeter = useDeleteMeter();
  const pollMeter = usePollMeter();
  const testConnection = useTestMeterConnection();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [meterHost, setMeterHost] = useState('');
  const [meterPort, setMeterPort] = useState('80');
  const [meterName, setMeterName] = useState('Shelly PRO EM-50');
  const [meterConnType, setMeterConnType] = useState('tcp_ip');
  const [simDialogOpen, setSimDialogOpen] = useState(false);
  const [simView, setSimView] = useState<'list' | 'advanced'>('list');
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

  const [modules, setModules] = useState<ModuleConfig[]>(() => {
    try {
      const saved = localStorage.getItem('sc-modules');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_MODULES;
  });
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const saveModules = useCallback((mods: ModuleConfig[]) => {
    setModules(mods);
    localStorage.setItem('sc-modules', JSON.stringify(mods));
  }, []);

  const toggleModule = useCallback((id: ModuleId) => {
    saveModules(modules.map(m => m.id === id ? { ...m, visible: !m.visible } : m));
  }, [modules, saveModules]);

  const handleDragStart = useCallback((idx: number) => {
    dragItem.current = idx;
  }, []);

  const handleDragEnter = useCallback((idx: number) => {
    dragOverItem.current = idx;
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const copy = [...modules];
    const dragged = copy.splice(dragItem.current, 1)[0];
    copy.splice(dragOverItem.current, 0, dragged);
    dragItem.current = null;
    dragOverItem.current = null;
    saveModules(copy);
  }, [modules, saveModules]);

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
    {
      name: '15-min blokken',
      desc: 'Afwisselend vermogen per kwartier (2 uur profiel)',
      purpose: 'TxDefaultProfile',
      kind: 'Relative',
      unit: 'W',
      duration: 7200,
      periods: [
        { startPeriod: 0, limit: 3700 },
        { startPeriod: 900, limit: 7400 },
        { startPeriod: 1800, limit: 11000 },
        { startPeriod: 2700, limit: 7400 },
        { startPeriod: 3600, limit: 5000 },
        { startPeriod: 4500, limit: 11000 },
        { startPeriod: 5400, limit: 3700 },
        { startPeriod: 6300, limit: 7400 },
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                  <Settings2 className="h-4 w-4" />
                  Modules
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                <p className="text-xs font-semibold text-foreground mb-2">Modules weergeven</p>
                <div className="space-y-2">
                  {modules.map(m => (
                    <div key={m.id} className="flex items-center justify-between">
                      <span className="text-sm text-foreground">{m.label}</span>
                      <Switch checked={m.visible} onCheckedChange={() => toggleModule(m.id)} />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-3">Sleep modules om de volgorde te wijzigen</p>
              </PopoverContent>
            </Popover>
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

        {/* Draggable Modules */}
        {modules.map((mod, idx) => {
          if (!mod.visible) return null;
          return (
            <div
              key={mod.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="group relative"
            >
              <div className="absolute -left-7 top-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>

              {mod.id === 'power-chart' && <PowerChart />}

              {mod.id === 'profiles' && (
                <>
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
                              {profile.schedule_periods.map((period, idx2) => {
                                const nextStart = idx2 < profile.schedule_periods.length - 1
                                  ? profile.schedule_periods[idx2 + 1].startPeriod
                                  : profile.duration || period.startPeriod + 3600;
                                const periodDuration = nextStart - period.startPeriod;
                                const maxLimitVal = Math.max(...profile.schedule_periods.map(p => p.limit));
                                const widthPct = maxLimitVal > 0 ? (period.limit / maxLimitVal) * 100 : 100;

                                return (
                                  <div key={idx2} className="flex items-center gap-3">
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
                </>
              )}

              {mod.id === 'shelly-meter' && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Activity className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Shelly Energiemeter</h3>
                        <p className="text-xs text-muted-foreground">PRO EM-50 · TCP/IP of RS485</p>
                      </div>
                    </div>
                    <Button size="sm" className="gap-1.5 text-xs" onClick={() => setMeterDialogOpen(true)}>
                      <Plus className="h-3 w-3" />
                      Meter toevoegen
                    </Button>
                  </div>
                  <div className="divide-y divide-border">
                    {(!meters || meters.length === 0) ? (
                      <div className="p-8 text-center">
                        <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Geen meters geconfigureerd</p>
                        <p className="text-xs text-muted-foreground mt-1">Voeg een Shelly PRO EM-50 toe via TCP/IP</p>
                      </div>
                    ) : meters.map(meter => (
                      <MeterItem
                        key={meter.id}
                        meter={meter}
                        pollMeter={pollMeter}
                        deleteMeter={deleteMeter}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Meter Dialog */}
      <Dialog open={meterDialogOpen} onOpenChange={setMeterDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Shelly PRO EM-50 toevoegen
            </DialogTitle>
            <DialogDescription>
              Verbind een energiemeter via TCP/IP (WiFi/Ethernet) of RS485 (Modbus)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Naam</Label>
              <Input value={meterName} onChange={e => setMeterName(e.target.value)} className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Verbinding</Label>
              <Select value={meterConnType} onValueChange={setMeterConnType}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp_ip">TCP/IP (WiFi / Ethernet)</SelectItem>
                  <SelectItem value="rs485">RS485 (Modbus RTU)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {meterConnType === 'tcp_ip' ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">IP-adres</Label>
                  <Input value={meterHost} onChange={e => setMeterHost(e.target.value)} placeholder="192.168.1.100" className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Poort</Label>
                  <Input value={meterPort} onChange={e => setMeterPort(e.target.value)} type="number" className="font-mono text-sm" />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">
                  RS485/Modbus wordt ondersteund via een Modbus-TCP gateway (bijv. USR-TCP232). 
                  Configureer de gateway en voer het IP-adres in.
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs">Gateway IP</Label>
                    <Input value={meterHost} onChange={e => setMeterHost(e.target.value)} placeholder="192.168.1.200" className="font-mono text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Poort</Label>
                    <Input value={meterPort} onChange={e => setMeterPort(e.target.value)} type="number" className="font-mono text-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={!meterHost || testConnection.isPending}
              onClick={() => testConnection.mutate(
                { host: meterHost, port: Number(meterPort) },
                {
                  onSuccess: (res: any) => {
                    if (res?.success) {
                      toast.success(`Verbonden! ${res.data?.type || 'Shelly'} (${res.data?.mac || ''})`);
                    } else {
                      toast.error(res?.error || 'Verbinding mislukt');
                    }
                  },
                  onError: () => toast.error('Kan niet verbinden'),
                }
              )}
            >
              {testConnection.isPending ? 'Testen...' : 'Test verbinding'}
            </Button>
            <Button
              disabled={!meterHost || createMeter.isPending}
              onClick={() => {
                createMeter.mutate(
                  {
                    name: meterName,
                    device_type: 'shelly_pro_em_50',
                    connection_type: meterConnType,
                    host: meterHost,
                    port: Number(meterPort),
                  },
                  {
                    onSuccess: () => {
                      toast.success('Meter toegevoegd');
                      setMeterDialogOpen(false);
                      setMeterHost('');
                    },
                    onError: () => toast.error('Fout bij toevoegen'),
                  }
                );
              }}
            >
              {createMeter.isPending ? 'Toevoegen...' : 'Meter toevoegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <Dialog open={simDialogOpen} onOpenChange={(v) => { setSimDialogOpen(v); if (!v) setSimView('list'); }}>
        <DialogContent className={simView === 'advanced' ? 'sm:max-w-xl max-h-[90vh] overflow-y-auto' : 'sm:max-w-lg max-h-[85vh] overflow-y-auto'}>
          {simView === 'list' ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-primary" />
                  Simulatie scenario's
                </DialogTitle>
                <DialogDescription>
                  Kies een vooraf ingesteld scenario of maak een geavanceerde simulatie
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

              <div className="border-t border-border pt-3">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setSimView('advanced')}
                >
                  <Bolt className="h-4 w-4" />
                  Geavanceerde simulatie
                </Button>
              </div>
            </>
          ) : (
            <AdvancedSimContent
              chargePoints={chargePoints || []}
              onApply={async (cpId, pds, dur) => {
                try {
                  await setProfile.mutateAsync({
                    chargePointId: cpId,
                    connectorId: 0,
                    profile: {
                      stackLevel: 0,
                      chargingProfilePurpose: 'ChargePointMaxProfile',
                      chargingProfileKind: 'Absolute',
                      chargingSchedule: {
                        chargingRateUnit: 'W',
                        duration: dur,
                        chargingSchedulePeriod: pds,
                      },
                    },
                  });
                  toast.success('Simulatieprofiel toegepast');
                  setSimDialogOpen(false);
                  setSimView('list');
                } catch {
                  toast.error('Fout bij toepassen simulatie');
                }
              }}
              onBack={() => setSimView('list')}
              isPending={setProfile.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

/* ── Advanced Simulation Dialog ─────────────────────────── */

interface AdvSimContentProps {
  chargePoints: { id: string; name: string }[];
  onApply: (cpId: string, periods: SchedulePeriod[], duration: number) => void;
  onBack: () => void;
  isPending: boolean;
}

const AdvancedSimContent = ({ chargePoints, onApply, onBack, isPending }: AdvSimContentProps) => {
  const { data: tariffs } = useChargingTariffs();
  const [numCps, setNumCps] = useState(3);
  const [gridPower, setGridPower] = useState(25);
  const [hasSolar, setHasSolar] = useState(true);
  const [solarPeak, setSolarPeak] = useState(10);
  const [hasBattery, setHasBattery] = useState(false);
  const [batteryCapacity, setBatteryCapacity] = useState(13.5);
  const [batteryPower, setBatteryPower] = useState(5);
  const [selectedCp, setSelectedCp] = useState(chargePoints[0]?.id || '');

  const generatedProfile = useMemo(() => {
    const blocksPerHour = 4;
    const totalBlocks = 24 * blocksPerHour;
    const periods: SchedulePeriod[] = [];

    for (let i = 0; i < totalBlocks; i++) {
      const hour = i / blocksPerHour;
      const startPeriod = i * 900;

      let solarW = 0;
      if (hasSolar && hour >= 6 && hour <= 20) {
        const x = (hour - 13) / 3.5;
        solarW = solarPeak * 1000 * Math.exp(-x * x / 2) * 0.85;
      }

      let batteryW = 0;
      if (hasBattery) {
        if (hour >= 17 && hour < 22) {
          batteryW = batteryPower * 1000 * 0.8;
        } else if (hasSolar && hour >= 10 && hour < 15) {
          batteryW = -batteryPower * 1000 * 0.5;
        }
      }

      const availableW = gridPower * 1000 + solarW + batteryW;
      const perCpLimit = Math.max(Math.floor(availableW / numCps / 100) * 100, 0);
      const limit = Math.min(perCpLimit, 22000);

      if (periods.length > 0 && periods[periods.length - 1].limit === limit) continue;
      periods.push({ startPeriod, limit });
    }

    return periods;
  }, [numCps, gridPower, hasSolar, solarPeak, hasBattery, batteryCapacity, batteryPower]);

  // Cost calculation based on default tariff
  const defaultTariff = tariffs?.find(t => t.is_default && t.active) || tariffs?.[0];
  const pricePerKwh = defaultTariff?.price_per_kwh ?? 0.30;

  const dailyCost = useMemo(() => {
    let totalWhPerDay = 0;
    for (let i = 0; i < generatedProfile.length; i++) {
      const nextStart = i < generatedProfile.length - 1
        ? generatedProfile[i + 1].startPeriod
        : 86400;
      const durationHours = (nextStart - generatedProfile[i].startPeriod) / 3600;
      // Assume average 60% utilization of the limit per charge point
      totalWhPerDay += generatedProfile[i].limit * 0.6 * durationHours;
    }
    const totalKwhPerDay = (totalWhPerDay / 1000) * numCps;
    return { kwhPerDay: totalKwhPerDay, costPerDay: totalKwhPerDay * pricePerKwh };
  }, [generatedProfile, numCps, pricePerKwh]);

  const maxLimit = Math.max(...generatedProfile.map(p => p.limit), 1);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Bolt className="h-5 w-5 text-primary" />
          Geavanceerde simulatie
        </DialogTitle>
        <DialogDescription>
          Configureer je installatie en genereer automatisch een slim laadprofiel
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* Grid & Charge Points */}
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Cable className="h-4 w-4 text-muted-foreground" />
            Installatie
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Aantal laadpalen</Label>
              <div className="flex items-center gap-3">
                <Slider value={[numCps]} onValueChange={([v]) => setNumCps(v)} min={1} max={20} step={1} className="flex-1" />
                <span className="font-mono text-sm w-8 text-right">{numCps}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Netvermogen (kW)</Label>
              <div className="flex items-center gap-3">
                <Slider value={[gridPower]} onValueChange={([v]) => setGridPower(v)} min={3} max={100} step={1} className="flex-1" />
                <span className="font-mono text-sm w-10 text-right">{gridPower}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Solar */}
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sun className="h-4 w-4 text-yellow-500" />
              Zonnepanelen
            </div>
            <Switch checked={hasSolar} onCheckedChange={setHasSolar} />
          </div>
          {hasSolar && (
            <div className="space-y-2">
              <Label className="text-xs">Piekvermogen (kWp)</Label>
              <div className="flex items-center gap-3">
                <Slider value={[solarPeak]} onValueChange={([v]) => setSolarPeak(v)} min={1} max={50} step={0.5} className="flex-1" />
                <span className="font-mono text-sm w-10 text-right">{solarPeak}</span>
              </div>
            </div>
          )}
        </div>

        {/* Battery */}
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BatteryCharging className="h-4 w-4 text-primary" />
              Thuisbatterij
            </div>
            <Switch checked={hasBattery} onCheckedChange={setHasBattery} />
          </div>
          {hasBattery && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Capaciteit (kWh)</Label>
                <div className="flex items-center gap-3">
                  <Slider value={[batteryCapacity]} onValueChange={([v]) => setBatteryCapacity(v)} min={5} max={50} step={0.5} className="flex-1" />
                  <span className="font-mono text-sm w-10 text-right">{batteryCapacity}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Vermogen (kW)</Label>
                <div className="flex items-center gap-3">
                  <Slider value={[batteryPower]} onValueChange={([v]) => setBatteryPower(v)} min={1} max={25} step={0.5} className="flex-1" />
                  <span className="font-mono text-sm w-10 text-right">{batteryPower}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Gegenereerd profiel — {generatedProfile.length} perioden
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              Max {(maxLimit / 1000).toFixed(1)} kW / laadpaal
            </span>
          </div>
          <div className="flex items-end gap-px h-20">
            {generatedProfile.map((p, i) => {
              const nextStart = i < generatedProfile.length - 1
                ? generatedProfile[i + 1].startPeriod
                : 86400;
              const widthPct = ((nextStart - p.startPeriod) / 86400) * 100;
              const heightPct = maxLimit > 0 ? (p.limit / maxLimit) * 100 : 0;
              const hour = p.startPeriod / 3600;
              const isSolarHour = hour >= 8 && hour <= 18;
              return (
                <div
                  key={i}
                  className={`rounded-t-sm transition-all ${isSolarHour && hasSolar ? 'bg-yellow-500/40' : 'bg-primary/40'}`}
                  style={{ width: `${widthPct}%`, height: `${Math.max(heightPct, 2)}%` }}
                  title={`${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')} — ${(p.limit / 1000).toFixed(1)} kW`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
          </div>
        </div>

        {/* Cost indication */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Euro className="h-4 w-4 text-primary" />
            Geschatte kosten (60% bezetting)
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Energie / dag</span>
              <p className="font-mono text-sm font-bold text-foreground">{dailyCost.kwhPerDay.toFixed(0)} kWh</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Kosten / dag</span>
              <p className="font-mono text-sm font-bold text-primary">€{dailyCost.costPerDay.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Kosten / maand</span>
              <p className="font-mono text-sm font-bold text-primary">€{(dailyCost.costPerDay * 30).toFixed(2)}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Tarief: €{pricePerKwh.toFixed(2)}/kWh{defaultTariff ? ` (${defaultTariff.name})` : ' (standaard)'} · {numCps} laadpalen
          </p>
        </div>

        {/* Target charge point */}
        {chargePoints.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Toepassen op laadpaal</Label>
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
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onBack}>← Terug</Button>
        <Button
          onClick={() => onApply(selectedCp || chargePoints[0]?.id, generatedProfile, 86400)}
          disabled={isPending || !chargePoints.length}
          className="gap-2"
        >
          <Play className="h-4 w-4" />
          {isPending ? 'Toepassen...' : 'Profiel toepassen'}
        </Button>
      </DialogFooter>
    </>
  );
};

export default SmartCharging;
