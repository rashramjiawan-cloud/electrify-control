import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
import { Zap, Plus, Trash2, Clock, Gauge, Play, Sun, BatteryCharging, Cable, Bolt, Euro, GripVertical, Eye, EyeOff, Settings2, Activity, Send, Power, PowerOff, RefreshCw, Pencil, Wifi } from 'lucide-react';
import PowerChart from '@/components/PowerChart';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEnergyMeters, useCreateMeter, useUpdateMeter, useDeleteMeter, usePollMeter, useTestMeterConnection, type EnergyMeter } from '@/hooks/useEnergyMeters';
import { useLocalAutoPoll } from '@/hooks/useLocalPoll';
import EnergyFlowWidget from '@/components/EnergyFlowWidget';
import SmartChargingVisualization from '@/components/SmartChargingVisualization';
import ChargingBehaviorModels from '@/components/ChargingBehaviorModels';
import PredictiveSchedules from '@/components/PredictiveSchedules';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import MqttStatusBadge from '@/components/MqttStatusBadge';
import MqttConfigDialog from '@/components/MqttConfigDialog';
import { useMqttConfigForAsset } from '@/hooks/useMqttConfigurations';

type ModuleId = 'energy-flow' | 'power-chart' | 'profiles' | 'shelly-meter' | 'ems-auto' | 'sc-visualization' | 'behavior-models' | 'predictive-schedules';

interface ModuleConfig {
  id: ModuleId;
  label: string;
  visible: boolean;
}

const DEFAULT_MODULES: ModuleConfig[] = [
  { id: 'sc-visualization', label: 'Smart Charging Overzicht', visible: true },
  { id: 'energy-flow', label: 'Energiestromen (GTV)', visible: true },
  { id: 'power-chart', label: 'Vermogensgrafiek', visible: true },
  { id: 'profiles', label: 'Laadprofielen', visible: true },
  { id: 'shelly-meter', label: 'Shelly Energiemeter', visible: true },
  { id: 'ems-auto', label: 'EMS Auto-sturing', visible: true },
  { id: 'behavior-models', label: 'Gedragsmodellen (AI)', visible: true },
  { id: 'predictive-schedules', label: 'Voorspellende Laadschema\'s (AI)', visible: true },
];

// Extracted meter item with local poll hook (hooks must be at top level)
const MeterItem = ({ meter, pollMeter, deleteMeter, onEdit, onMqtt }: { meter: EnergyMeter; pollMeter: any; deleteMeter: any; onEdit: (meter: EnergyMeter) => void; onMqtt: (meter: EnergyMeter) => void }) => {
  const [localActive, setLocalActive] = useState(false);
  const localAutoRef = useLocalAutoPoll(localActive ? meter : undefined, 10000);
  const [, forceUpdate] = useState(0);

  // Force re-render every 15s so the webhook staleness indicator stays accurate
  useEffect(() => {
    if (meter.connection_type !== 'webhook') return;
    const iv = setInterval(() => forceUpdate(n => n + 1), 15_000);
    return () => clearInterval(iv);
  }, [meter.connection_type]);

  const webhookStale = meter.connection_type === 'webhook' && meter.last_poll_at
    ? (Date.now() - new Date(meter.last_poll_at).getTime()) > 60_000
    : false;
  const webhookAgeSec = meter.last_poll_at
    ? Math.round((Date.now() - new Date(meter.last_poll_at).getTime()) / 1000)
    : null;

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{meter.name}</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                {meter.shelly_device_id && meter.connection_type === 'webhook'
                  ? `Webhook · ${meter.shelly_device_id}`
                  : meter.shelly_device_id
                  ? `Cloud · ${meter.shelly_device_id}`
                  : meter.connection_type === 'tcp_ip' ? `TCP/IP ${meter.host}:${meter.port}` : `RS485 addr ${meter.modbus_address}`}
              </p>
              {meter.connection_type === 'webhook' && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  !meter.last_poll_at
                    ? 'bg-muted text-muted-foreground'
                    : webhookStale
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-green-500/10 text-green-600 dark:text-green-400'
                }`}>
                  <span className={`relative flex h-1.5 w-1.5`}>
                    {!webhookStale && meter.last_poll_at && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-green-500" />
                    )}
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                      !meter.last_poll_at ? 'bg-muted-foreground' : webhookStale ? 'bg-destructive' : 'bg-green-500'
                    }`} />
                  </span>
                  {!meter.last_poll_at
                    ? 'Wacht op data…'
                    : webhookStale
                    ? `Geen data (${webhookAgeSec! > 3600 ? `${Math.floor(webhookAgeSec! / 3600)}u` : webhookAgeSec! > 60 ? `${Math.floor(webhookAgeSec! / 60)}m` : `${webhookAgeSec}s`} geleden)`
                    : `Live · ${new Date(meter.last_poll_at).toLocaleTimeString('nl-NL')}`}
                </span>
              )}
              {meter.connection_type !== 'webhook' && meter.last_poll_at && (
                <span className="text-[10px] text-muted-foreground">
                  Laatste poll: {new Date(meter.last_poll_at).toLocaleTimeString('nl-NL')}
                </span>
              )}
            </div>
          </div>
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
            meter.meter_type === 'pv' ? 'bg-primary/10 text-primary' :
            meter.meter_type === 'battery' ? 'bg-warning/10 text-warning' :
            'bg-muted text-muted-foreground'
          }`}>
            {meter.meter_type === 'pv' ? 'PV' : meter.meter_type === 'battery' ? 'BAT' : 'GRID'}
          </span>
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
            onClick={() => {
              const pollData: any = {
                meter_id: meter.id,
                shelly_device_id: meter.shelly_device_id || undefined,
                shelly_cloud_server: meter.shelly_cloud_server || undefined,
                host: meter.host || undefined,
                port: meter.port,
                auth_user: meter.auth_user || undefined,
                auth_pass: meter.auth_pass || undefined,
              };
              pollMeter.mutate(pollData, {
                onSuccess: (res: any) => {
                  if (res?.success) toast.success(`Meterdata opgehaald (${res.source || 'cloud'})`);
                  else toast.error(res?.error || 'Fout bij ophalen');
                },
                onError: () => toast.error('Verbinding mislukt'),
              });
            }}
          >
            <Zap className="h-3 w-3" />
            {pollMeter.isPending ? 'Ophalen...' : meter.connection_type === 'webhook' ? 'Webhook' : meter.shelly_device_id ? 'Cloud Poll' : 'Server Poll'}
          </Button>
          <MqttStatusBadge assetType="energy_meter" assetId={meter.id} onClick={() => onMqtt(meter)} />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
            onClick={() => onEdit(meter)}
          >
            <Pencil className="h-3 w-3" />
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
  const { getSetting } = useSystemSettings();
  const createMeter = useCreateMeter();
  const updateMeter = useUpdateMeter();
  const deleteMeter = useDeleteMeter();
  const pollMeter = usePollMeter();
  const testConnection = useTestMeterConnection();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<EnergyMeter | null>(null);
  const [meterHost, setMeterHost] = useState('');
  const [meterPort, setMeterPort] = useState('80');
  const [meterName, setMeterName] = useState('Shelly PRO EM-50');
  const [meterConnType, setMeterConnType] = useState('tcp_ip');
  const [meterDeviceType, setMeterDeviceType] = useState<'shelly_pro_em_50' | 'shelly_pro_3em' | 'smartstuff_ultra_x2'>('shelly_pro_em_50');
  const [meterAuthUser, setMeterAuthUser] = useState('');
  const [meterAuthPass, setMeterAuthPass] = useState('');
  const [meterType, setMeterType] = useState('grid');
  const [meterShellyDeviceId, setMeterShellyDeviceId] = useState('');
  const [meterShellyCloudServer, setMeterShellyCloudServer] = useState('shelly-api-eu.shelly.cloud');
  const [mqttMeterDialogOpen, setMqttMeterDialogOpen] = useState(false);
  const [mqttMeter, setMqttMeter] = useState<EnergyMeter | null>(null);
  const mqttConfig = useMqttConfigForAsset('energy_meter', mqttMeter?.id || '');
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

  const handleActivate = async (profile: any) => {
    try {
      await setProfile.mutateAsync({
        chargePointId: profile.charge_point_id,
        connectorId: profile.connector_id,
        profile: {
          stackLevel: profile.stack_level,
          chargingProfilePurpose: profile.charging_profile_purpose,
          chargingProfileKind: profile.charging_profile_kind,
          chargingSchedule: {
            chargingRateUnit: profile.charging_schedule_unit,
            duration: profile.duration,
            chargingSchedulePeriod: profile.schedule_periods,
          },
        },
      });
      toast.success('Profiel geactiveerd op laadpaal via OCPP');
    } catch {
      toast.error('Fout bij activeren profiel');
    }
  };

  // EMS auto-steer state
  const [emsActive, setEmsActive] = useState(() => {
    try { return localStorage.getItem('ems-auto-active') === 'true'; } catch { return false; }
  });
  const [emsMaxPower, setEmsMaxPower] = useState(() => {
    try { return Number(localStorage.getItem('ems-max-power')) || 11000; } catch { return 11000; }
  });
  const [emsMinPower, setEmsMinPower] = useState(() => {
    try { return Number(localStorage.getItem('ems-min-power')) || 1380; } catch { return 1380; }
  });
  const emsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist EMS settings
  useEffect(() => {
    localStorage.setItem('ems-auto-active', String(emsActive));
    localStorage.setItem('ems-max-power', String(emsMaxPower));
    localStorage.setItem('ems-min-power', String(emsMinPower));
  }, [emsActive, emsMaxPower, emsMinPower]);

  // EMS auto-steer logic: adjust charging based on grid power from meter
  useEffect(() => {
    if (!emsActive) {
      if (emsIntervalRef.current) clearInterval(emsIntervalRef.current);
      emsIntervalRef.current = null;
      return;
    }

    const adjustCharging = async () => {
      const enabledMeter = meters?.find(m => m.enabled && m.meter_type === 'grid');
      if (!enabledMeter?.last_reading?.channels) return;

      const channels = enabledMeter.last_reading.channels as any[];
      const totalGridPower = channels.reduce((sum: number, ch: any) => sum + (ch.active_power || 0), 0);

      const cpId = selectedCp || chargePoints?.[0]?.id;
      if (!cpId) return;

      // GTV-aware: cap total grid import to stay under GTV limit
      const gtvImportW = Number(getSetting('gtv_import_kw')?.value ?? 150) * 1000;
      const gtvWarningPct = Number(getSetting('gtv_warning_pct')?.value ?? 80) / 100;
      const gtvSafeW = gtvImportW * gtvWarningPct; // Stay under warning threshold

      let targetPower = emsMaxPower;
      if (totalGridPower > 0) {
        // Calculate how much headroom remains under GTV
        const headroom = gtvSafeW - totalGridPower;
        // Reduce charging to stay within GTV safe zone
        targetPower = Math.max(emsMinPower, Math.min(emsMaxPower, emsMaxPower + headroom));
      } else {
        // Exporting to grid — can charge at max
        targetPower = emsMaxPower;
      }

      try {
        await setProfile.mutateAsync({
          chargePointId: cpId,
          connectorId: 0,
          profile: {
            stackLevel: 99,
            chargingProfilePurpose: 'ChargePointMaxProfile',
            chargingProfileKind: 'Absolute',
            chargingSchedule: {
              chargingRateUnit: 'W',
              chargingSchedulePeriod: [{ startPeriod: 0, limit: Math.round(targetPower) }],
            },
          },
        });
        console.log(`EMS: Grid=${totalGridPower}W → Charging limited to ${Math.round(targetPower)}W`);
      } catch (err) {
        console.error('EMS auto-steer failed:', err);
      }
    };

    adjustCharging();
    emsIntervalRef.current = setInterval(adjustCharging, 30000);
    return () => { if (emsIntervalRef.current) clearInterval(emsIntervalRef.current); };
  }, [emsActive, emsMaxPower, emsMinPower, meters, chargePoints, selectedCp, setProfile, getSetting]);

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

              {mod.id === 'sc-visualization' && <SmartChargingVisualization />}

              {mod.id === 'behavior-models' && <ChargingBehaviorModels />}

              {mod.id === 'predictive-schedules' && <PredictiveSchedules chargePoints={chargePoints?.map(cp => ({ id: cp.id, name: cp.name, max_power: cp.max_power ?? null }))} />}

              {mod.id === 'energy-flow' && <EnergyFlowWidget />}

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
                                variant="default"
                                size="sm"
                                className="gap-1.5 text-xs"
                                disabled={setProfile.isPending}
                                onClick={() => handleActivate(profile)}
                              >
                                <Send className="h-3 w-3" />
                                {setProfile.isPending ? 'Activeren...' : 'Activeer'}
                              </Button>
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
                        <h3 className="text-sm font-semibold text-foreground">Energiemeters</h3>
                        <p className="text-xs text-muted-foreground">Shelly PRO EM-50 · SmartStuff Ultra X2</p>
                      </div>
                    </div>
                    <Button size="sm" className="gap-1.5 text-xs" onClick={() => {
                      setEditingMeter(null);
                      setMeterName('Shelly PRO EM-50');
                      setMeterDeviceType('shelly_pro_em_50');
                      setMeterConnType('tcp_ip');
                      setMeterHost('');
                      setMeterPort('80');
                      setMeterAuthUser('');
                      setMeterAuthPass('');
                      setMeterType('grid');
                      setMeterShellyDeviceId('');
                      setMeterShellyCloudServer('shelly-api-eu.shelly.cloud');
                      setMeterDialogOpen(true);
                    }}>
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
                        onEdit={(m) => {
                          setEditingMeter(m);
                          setMeterName(m.name);
                          setMeterDeviceType(m.device_type === 'smartstuff_ultra_x2' ? 'smartstuff_ultra_x2' : m.device_type === 'shelly_pro_3em' ? 'shelly_pro_3em' : 'shelly_pro_em_50');
                          setMeterConnType(m.connection_type);
                          setMeterHost(m.host || '');
                          setMeterPort(String(m.port || 80));
                          setMeterAuthUser(m.auth_user || '');
                          setMeterAuthPass(m.auth_pass || '');
                          setMeterType(m.meter_type || 'grid');
                          setMeterShellyDeviceId(m.shelly_device_id || '');
                          setMeterShellyCloudServer(m.shelly_cloud_server || 'shelly-api-eu.shelly.cloud');
                          setMeterDialogOpen(true);
                        }}
                        onMqtt={(m) => { setMqttMeter(m); setMqttMeterDialogOpen(true); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {mod.id === 'ems-auto' && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${emsActive ? 'bg-primary/20' : 'bg-muted'}`}>
                        {emsActive ? <Power className="h-4 w-4 text-primary" /> : <PowerOff className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">EMS Auto-sturing</h3>
                        <p className="text-xs text-muted-foreground">
                          {emsActive ? 'Actief — past laadvermogen automatisch aan op basis van meterdata' : 'Inactief — schakel in om automatisch te sturen'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {emsActive && (
                        <span className="flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                          </span>
                          <span className="text-xs text-primary font-medium">Actief</span>
                        </span>
                      )}
                      <Switch checked={emsActive} onCheckedChange={setEmsActive} />
                    </div>
                  </div>
                  <div className="px-5 py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Max laadvermogen (W)</Label>
                        <Input
                          type="number"
                          value={emsMaxPower}
                          onChange={e => setEmsMaxPower(Number(e.target.value))}
                          className="font-mono text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">Max vermogen als het net het toelaat</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Min laadvermogen (W)</Label>
                        <Input
                          type="number"
                          value={emsMinPower}
                          onChange={e => setEmsMinPower(Number(e.target.value))}
                          className="font-mono text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">Ondergrens (6A = 1380W)</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Laadpaal</Label>
                      <Select value={selectedCp || chargePoints?.[0]?.id || ''} onValueChange={setSelectedCp}>
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Selecteer laadpaal" />
                        </SelectTrigger>
                        <SelectContent>
                          {chargePoints?.map(cp => (
                            <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Live status */}
                    {emsActive && meters?.find(m => m.enabled)?.last_reading?.channels && (
                      <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-3 w-3 text-primary animate-spin" style={{ animationDuration: '3s' }} />
                          <span className="text-xs font-semibold text-foreground">Live status</span>
                        </div>
                        {(() => {
                          const ch = (meters?.find(m => m.enabled)?.last_reading?.channels as any[]) || [];
                          const gridW = ch.reduce((s: number, c: any) => s + (c.active_power || 0), 0);
                          const target = gridW > 0
                            ? Math.max(emsMinPower, emsMaxPower - gridW)
                            : emsMaxPower;
                          return (
                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div>
                                <p className="font-mono text-lg font-bold text-foreground">{(gridW / 1000).toFixed(1)}</p>
                                <p className="text-[10px] text-muted-foreground">Grid (kW)</p>
                              </div>
                              <div>
                                <p className="font-mono text-lg font-bold text-primary">{(target / 1000).toFixed(1)}</p>
                                <p className="text-[10px] text-muted-foreground">Doel laden (kW)</p>
                              </div>
                              <div>
                                <p className="font-mono text-lg font-bold text-foreground">{(emsMaxPower / 1000).toFixed(1)}</p>
                                <p className="text-[10px] text-muted-foreground">Max (kW)</p>
                              </div>
                            </div>
                          );
                        })()}
                        <p className="text-[10px] text-muted-foreground">Stuurt elke 30 seconden via OCPP SetChargingProfile</p>
                      </div>
                    )}

                    {!emsActive && (
                      <div className="rounded-lg border border-dashed border-border p-4 text-center">
                        <Power className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Schakel de auto-sturing in om automatisch het laadvermogen aan te passen op basis van je grid-import.</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Vereist: een actieve energiemeter en een verbonden laadpaal</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Meter Dialog */}
      <Dialog open={meterDialogOpen} onOpenChange={(open) => {
        setMeterDialogOpen(open);
        if (!open) setEditingMeter(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
         <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {editingMeter ? 'Meter bewerken' : 'Energiemeter toevoegen'}
            </DialogTitle>
            <DialogDescription>
              {editingMeter ? 'Wijzig de verbindingsinstellingen van deze meter' : 'Kies een apparaattype en configureer de verbinding'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Device type selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Apparaat</Label>
              <Select value={meterDeviceType} onValueChange={(v: 'shelly_pro_em_50' | 'shelly_pro_3em' | 'smartstuff_ultra_x2') => {
                setMeterDeviceType(v);
                if (v === 'smartstuff_ultra_x2') {
                  setMeterName('SmartStuff Ultra X2');
                  setMeterConnType('mqtt_http');
                } else if (v === 'shelly_pro_3em') {
                  setMeterName('Shelly Pro 3EM');
                  setMeterConnType('tcp_ip');
                  setMeterPort('80');
                } else {
                  setMeterName('Shelly PRO EM-50');
                  setMeterConnType('tcp_ip');
                  setMeterPort('80');
                }
              }}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shelly_pro_em_50">Shelly PRO EM-50</SelectItem>
                  <SelectItem value="shelly_pro_3em">Shelly Pro 3EM</SelectItem>
                  <SelectItem value="smartstuff_ultra_x2">SmartStuff Ultra X2 (P1/DSMR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Naam</Label>
              <Input value={meterName} onChange={e => setMeterName(e.target.value)} className="font-mono text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {meterDeviceType !== 'smartstuff_ultra_x2' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Verbinding</Label>
                  <Select value={meterConnType} onValueChange={setMeterConnType}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp_ip">TCP/IP (WiFi / Ethernet)</SelectItem>
                      <SelectItem value="rs485">RS485 (Modbus RTU)</SelectItem>
                      <SelectItem value="webhook">Webhook (Outbound Push)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Meter type</Label>
                <Select value={meterType} onValueChange={setMeterType}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Grid (net)</SelectItem>
                    <SelectItem value="pv">PV (zonne-energie)</SelectItem>
                    <SelectItem value="battery">Batterij</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* SmartStuff Ultra X2: show webhook URL */}
            {meterDeviceType === 'smartstuff_ultra_x2' ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-foreground">MQTT → HTTP Bridge</h4>
                <p className="text-xs text-muted-foreground">
                  De SmartStuff Ultra X2 publiceert DSMR-data via MQTT. Gebruik een forwarder-script 
                  (bijv. op een Raspberry Pi of Node-RED) om de MQTT berichten als HTTP POST door te sturen naar:
                </p>
                <div className="rounded-md bg-muted p-2.5">
                  <code className="text-xs font-mono text-foreground break-all select-all">
                    {`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/smartstuff-ingest`}
                  </code>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Headers:</strong> <code className="text-[10px] bg-muted px-1 rounded">x-api-key: &lt;jouw ingest API key&gt;</code></p>
                  <p><strong>Body:</strong> De DSMR JSON payload (power_delivered_l1, voltage_l1, etc.)</p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  💡 Configureer je API key via Instellingen → Ingest API. Dezelfde key als voor OCPP ingest.
                </p>
              </div>
            ) : meterConnType === 'webhook' ? (
              <div className="rounded-lg border border-chart-2/20 bg-chart-2/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wifi className="h-3.5 w-3.5 text-chart-2" />
                  <h4 className="text-xs font-semibold text-foreground">Shelly Outbound Webhook</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Configureer je Shelly om periodiek een HTTP POST te sturen met meterdata. 
                  Geen cloud key nodig — de Shelly stuurt zelf data naar jouw endpoint.
                </p>
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Webhook URL</Label>
                  <div className="rounded-md bg-muted p-2.5 cursor-pointer" onClick={() => {
                    navigator.clipboard.writeText(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/shelly-ingest`);
                    toast.success('Webhook URL gekopieerd!');
                  }}>
                    <code className="text-xs font-mono text-foreground break-all select-all">
                      {`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/shelly-ingest`}
                    </code>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Shelly Device ID</Label>
                  <Input value={meterShellyDeviceId} onChange={e => setMeterShellyDeviceId(e.target.value)} placeholder={meterDeviceType === 'shelly_pro_3em' ? 'shellypro3em-A4F00FCFA140' : 'shellyproem50-A4F00FCFA140'} className="font-mono text-sm" />
                  <p className="text-[10px] text-muted-foreground">Het Device ID wordt gebruikt om binnenkomende data te koppelen aan deze meter.</p>
                </div>
                <div className="rounded-md bg-muted/50 p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-foreground">Configuratie op de Shelly:</p>
                  <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open de Shelly web UI (http://&lt;shelly-ip&gt;)</li>
                    <li>Ga naar <strong>Scripts</strong> → maak een nieuw script</li>
                    <li>Plak het onderstaande script en pas <code className="bg-muted px-1 rounded">DEVICE_ID</code> en <code className="bg-muted px-1 rounded">API_KEY</code> aan</li>
                    <li>Sla op en zet het script <strong>aan</strong></li>
                  </ol>
                </div>
                <div className="rounded-md bg-muted p-3 space-y-1">
                  <p className="text-[10px] font-semibold text-foreground">📋 Shelly Script (kopieer & plak):</p>
                  <div className="relative">
                    <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto select-all cursor-pointer" onClick={() => {
                      const script = `// Shelly PRO 3EM → Webhook Push Script
let CONFIG = {
  ENDPOINT: "https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/shelly-ingest",
  DEVICE_ID: "${meterShellyDeviceId || '<JE_DEVICE_ID>'}",
  API_KEY: "<JE_API_KEY>",
  INTERVAL_SEC: 10
};

function sendData() {
  Shelly.call("Shelly.GetStatus", {}, function(result) {
    let body = JSON.stringify({
      device_id: CONFIG.DEVICE_ID,
      status: result
    });
    Shelly.call("HTTP.POST", {
      url: CONFIG.ENDPOINT,
      content_type: "application/json",
      headers: { "x-api-key": CONFIG.API_KEY },
      body: body
    }, function(res) {
      if (res && res.code === 200) {
        print("OK: data verzonden");
      } else {
        print("FOUT: " + JSON.stringify(res));
      }
    });
  });
}

// Start: elke INTERVAL_SEC seconden
Timer.set(CONFIG.INTERVAL_SEC * 1000, true, sendData);
// Direct eerste keer verzenden
sendData();
print("Webhook script gestart, interval: " + CONFIG.INTERVAL_SEC + "s");`;
                      navigator.clipboard.writeText(script);
                      toast.success('Script gekopieerd naar klembord!');
                    }}>{`// Shelly PRO 3EM → Webhook Push Script
let CONFIG = {
  ENDPOINT: "https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/shelly-ingest",
  DEVICE_ID: "${meterShellyDeviceId || '<JE_DEVICE_ID>'}",
  API_KEY: "<JE_API_KEY>",
  INTERVAL_SEC: 10
};

function sendData() {
  Shelly.call("Shelly.GetStatus", {}, function(result) {
    let body = JSON.stringify({
      device_id: CONFIG.DEVICE_ID,
      status: result
    });
    Shelly.call("HTTP.POST", {
      url: CONFIG.ENDPOINT,
      content_type: "application/json",
      headers: { "x-api-key": CONFIG.API_KEY },
      body: body
    }, function(res) {
      if (res && res.code === 200) {
        print("OK: data verzonden");
      } else {
        print("FOUT: " + JSON.stringify(res));
      }
    });
  });
}

Timer.set(CONFIG.INTERVAL_SEC * 1000, true, sendData);
sendData();
print("Webhook script gestart");`}</pre>
                    <p className="text-[9px] text-muted-foreground mt-1">💡 Klik op het script om te kopiëren. API key instellen via <strong>Instellingen → Ingest API</strong>.</p>
                  </div>
                </div>
              </div>
            ) : meterConnType === 'tcp_ip' ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Host (IP-adres of tunnel URL)</Label>
                  <Input value={meterHost} onChange={e => setMeterHost(e.target.value)} placeholder="192.168.1.100 of shelly.jouwdomein.nl" className="font-mono text-sm" />
                  <p className="text-[10px] text-muted-foreground">IP-adres voor lokaal netwerk, of een tunnel URL (Cloudflare/ngrok) voor cloud-toegang</p>
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
                  Configureer de gateway en voer het IP-adres of de tunnel URL in.
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs">Gateway host (IP of tunnel URL)</Label>
                    <Input value={meterHost} onChange={e => setMeterHost(e.target.value)} placeholder="192.168.1.200 of gateway.jouwdomein.nl" className="font-mono text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Poort</Label>
                    <Input value={meterPort} onChange={e => setMeterPort(e.target.value)} type="number" className="font-mono text-sm" />
                  </div>
                </div>
              </div>
            )}

            {/* HTTP Basic Auth (optional) - only for Shelly */}
            {meterDeviceType !== 'smartstuff_ultra_x2' && meterConnType !== 'webhook' && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold">HTTP Authenticatie (optioneel)</Label>
                  <span className="text-[10px] text-muted-foreground">Voor Shelly achter een beveiligde tunnel</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gebruikersnaam</Label>
                    <Input value={meterAuthUser} onChange={e => setMeterAuthUser(e.target.value)} placeholder="admin" className="text-sm" autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Wachtwoord</Label>
                    <Input value={meterAuthPass} onChange={e => setMeterAuthPass(e.target.value)} placeholder="••••••••" type="password" className="text-sm" autoComplete="off" />
                  </div>
                </div>
              </div>
            )}

            {/* Shelly Cloud API (optional) - only for Shelly */}
            {meterDeviceType !== 'smartstuff_ultra_x2' && meterConnType !== 'webhook' && (
              <div className="rounded-lg border border-chart-2/20 bg-chart-2/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wifi className="h-3.5 w-3.5 text-chart-2" />
                  <Label className="text-xs font-semibold">Shelly Cloud API (optioneel)</Label>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Gebruik de Shelly Cloud JRPC API om je meter op afstand uit te lezen zonder lokale netwerktoegang. 
                  Vind je Device ID in de Shelly app → apparaat → Settings → Device Information.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Device ID</Label>
                    <Input value={meterShellyDeviceId} onChange={e => setMeterShellyDeviceId(e.target.value)} placeholder="shellyproem50-XXXXXXXXXXXX" className="font-mono text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cloud Server</Label>
                    <Input value={meterShellyCloudServer} onChange={e => setMeterShellyCloudServer(e.target.value)} className="font-mono text-sm" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  💡 Als Device ID is ingevuld wordt de Cloud API gebruikt. Laat leeg om lokaal te pollen via IP.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {meterDeviceType !== 'smartstuff_ultra_x2' && (
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={(!meterHost && !meterShellyDeviceId) || testConnection.isPending}
                onClick={() => testConnection.mutate(
                  {
                    host: meterHost || undefined,
                    port: Number(meterPort),
                    auth_user: meterAuthUser || undefined,
                    auth_pass: meterAuthPass || undefined,
                    shelly_device_id: meterShellyDeviceId || undefined,
                    shelly_cloud_server: meterShellyCloudServer || undefined,
                  },
                  {
                    onSuccess: (res: any) => {
                      if (res?.success) {
                        const src = res.source === 'cloud' ? '☁️ Cloud' : '🏠 Lokaal';
                        toast.success(`${src} verbonden! ${res.data?.type || res.data?.model || 'Shelly'} (${res.data?.mac || ''})`);
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
            )}
            <Button
              disabled={(meterDeviceType !== 'smartstuff_ultra_x2' && meterConnType !== 'webhook' && !meterHost && !meterShellyDeviceId) || createMeter.isPending || updateMeter.isPending}
              onClick={() => {
                const meterData: any = {
                  name: meterName,
                  device_type: meterDeviceType,
                  connection_type: meterConnType,
                  host: meterDeviceType === 'smartstuff_ultra_x2' ? 'webhook' : meterConnType === 'webhook' ? 'webhook' : meterHost,
                  port: meterDeviceType === 'smartstuff_ultra_x2' ? 443 : meterConnType === 'webhook' ? 443 : Number(meterPort),
                  auth_user: meterAuthUser || null,
                  auth_pass: meterAuthPass || null,
                  meter_type: meterType,
                  shelly_device_id: meterShellyDeviceId || null,
                  shelly_cloud_server: meterShellyCloudServer || null,
                };
                if (editingMeter) {
                  updateMeter.mutate(
                    { id: editingMeter.id, ...meterData },
                    {
                      onSuccess: () => {
                        toast.success('Meter bijgewerkt');
                        setMeterDialogOpen(false);
                        setEditingMeter(null);
                        setMeterHost('');
                        setMeterAuthUser('');
                        setMeterAuthPass('');
                      },
                      onError: () => toast.error('Fout bij bijwerken'),
                    }
                  );
                } else {
                  createMeter.mutate(
                    meterData,
                    {
                      onSuccess: () => {
                        toast.success('Meter toegevoegd');
                        setMeterDialogOpen(false);
                        setMeterHost('');
                        setMeterAuthUser('');
                        setMeterAuthPass('');
                      },
                      onError: () => toast.error('Fout bij toevoegen'),
                    }
                  );
                }
              }}
            >
              {(createMeter.isPending || updateMeter.isPending) 
                ? (editingMeter ? 'Bijwerken...' : 'Toevoegen...') 
                : (editingMeter ? 'Meter bijwerken' : 'Meter toevoegen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MQTT Config Dialog for meters */}
      {mqttMeter && (
        <MqttConfigDialog
          open={mqttMeterDialogOpen}
          onOpenChange={setMqttMeterDialogOpen}
          assetType="energy_meter"
          assetId={mqttMeter.id}
          assetName={mqttMeter.name}
          existing={mqttConfig.data?.[0] || null}
          deviceType={mqttMeter.device_type}
        />
      )}

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
