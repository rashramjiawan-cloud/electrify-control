import { useMemo } from 'react';
import { useChargePoints } from '@/hooks/useChargePoints';
import { useEnergyMeters } from '@/hooks/useEnergyMeters';
import { useChargingProfiles } from '@/hooks/useChargingProfiles';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Zap, Sun, BatteryCharging, Cable, Gauge, ArrowDown } from 'lucide-react';

const SmartChargingVisualization = () => {
  const { data: chargePoints } = useChargePoints();
  const { data: meters } = useEnergyMeters();
  const { data: profiles } = useChargingProfiles();
  const { getSetting } = useSystemSettings();

  const gridMeter = meters?.find(m => m.enabled && m.meter_type === 'grid');
  const pvMeter = meters?.find(m => m.enabled && m.meter_type === 'pv');
  const batMeter = meters?.find(m => m.enabled && m.meter_type === 'battery');

  const gridPowerW = useMemo(() => {
    if (!gridMeter?.last_reading?.channels) return 0;
    return (gridMeter.last_reading.channels as any[]).reduce(
      (s: number, c: any) => s + (c.active_power || 0), 0
    );
  }, [gridMeter]);

  const pvPowerW = useMemo(() => {
    if (!pvMeter?.last_reading?.channels) return 0;
    return Math.abs((pvMeter.last_reading.channels as any[]).reduce(
      (s: number, c: any) => s + (c.active_power || 0), 0
    ));
  }, [pvMeter]);

  const batPowerW = useMemo(() => {
    if (!batMeter?.last_reading?.channels) return 0;
    return (batMeter.last_reading.channels as any[]).reduce(
      (s: number, c: any) => s + (c.active_power || 0), 0
    );
  }, [batMeter]);

  const gtvLimitKw = Number(getSetting('gtv_import_kw')?.value ?? 150);
  const totalAvailableW = gridPowerW + pvPowerW + Math.max(batPowerW, 0);

  const chargingCPs = chargePoints?.filter(cp => cp.status === 'Charging') || [];
  const availableCPs = chargePoints?.filter(cp => cp.status === 'Available') || [];
  const occupiedCPs = chargePoints?.filter(cp => cp.status === 'Occupied' || cp.status === 'SuspendedEVSE' || cp.status === 'SuspendedEV') || [];

  const activeProfiles = profiles?.filter(p => p.active) || [];
  const totalChargingPower = chargingCPs.reduce((s, cp) => s + (cp.max_power || 0), 0);

  const gridUsagePct = gtvLimitKw > 0 ? Math.min((gridPowerW / 1000 / gtvLimitKw) * 100, 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Gauge className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Smart Charging Overzicht</h3>
            <p className="text-xs text-muted-foreground">Realtime energieverdeling en laadstatus</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {activeProfiles.length} actieve profielen
          </span>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* ── Energy Sources Row ── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Grid */}
          <SourceCard
            icon={<Cable className="h-5 w-5" />}
            label="Netaansluiting"
            powerW={gridPowerW}
            color="text-foreground"
            bgColor="bg-muted/50"
            subLabel={`GTV: ${gtvLimitKw} kW`}
          />
          {/* Solar */}
          <SourceCard
            icon={<Sun className="h-5 w-5" />}
            label="Zonnepanelen"
            powerW={pvPowerW}
            color="text-yellow-500"
            bgColor="bg-yellow-500/10"
            subLabel={pvMeter ? 'Actief' : 'Niet geconfigureerd'}
          />
          {/* Battery */}
          <SourceCard
            icon={<BatteryCharging className="h-5 w-5" />}
            label="Batterij"
            powerW={batPowerW}
            color="text-primary"
            bgColor="bg-primary/10"
            subLabel={batMeter ? (batPowerW > 0 ? 'Ontladen' : batPowerW < 0 ? 'Opladen' : 'Stand-by') : 'Niet geconfigureerd'}
          />
        </div>

        {/* ── Flow Arrows ── */}
        <EnergyFlowArrow
          label={`${(totalAvailableW / 1000).toFixed(1)} kW beschikbaar`}
          active={totalAvailableW > 0}
        />

        {/* ── Smart Controller ── */}
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Smart Charging Controller</span>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              activeProfiles.length > 0 
                ? 'bg-primary/20 text-primary' 
                : 'bg-muted text-muted-foreground'
            }`}>
              {activeProfiles.length > 0 ? 'Actief' : 'Inactief'}
            </span>
          </div>

          {/* GTV Usage Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Netbelasting</span>
              <span className="font-mono">{(gridPowerW / 1000).toFixed(1)} / {gtvLimitKw} kW ({gridUsagePct.toFixed(0)}%)</span>
            </div>
            <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  gridUsagePct > 90 ? 'bg-destructive' :
                  gridUsagePct > 70 ? 'bg-yellow-500' :
                  'bg-primary'
                }`}
                style={{ width: `${gridUsagePct}%` }}
              />
            </div>
          </div>

          {/* Active Profiles Summary */}
          {activeProfiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeProfiles.slice(0, 4).map(p => (
                <span key={p.id} className="inline-flex items-center gap-1 text-[10px] font-mono rounded-md bg-background border border-border px-2 py-0.5">
                  <Zap className="h-2.5 w-2.5 text-primary" />
                  {p.charging_profile_purpose === 'ChargePointMaxProfile' ? 'Max' : p.charging_profile_purpose === 'TxDefaultProfile' ? 'TxDef' : 'Tx'}
                  {' · '}
                  {p.schedule_periods?.[0]?.limit != null
                    ? `${(p.schedule_periods[0].limit / 1000).toFixed(1)} kW`
                    : '—'}
                </span>
              ))}
              {activeProfiles.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{activeProfiles.length - 4} meer</span>
              )}
            </div>
          )}
        </div>

        {/* ── Flow Arrows ── */}
        <EnergyFlowArrow
          label={`Verdeling → ${chargePoints?.length || 0} laadpunten`}
          active={totalAvailableW > 0 || chargingCPs.length > 0}
        />

        {/* ── Charge Points Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {chargePoints?.map(cp => {
            const isCharging = cp.status === 'Charging';
            const isAvailable = cp.status === 'Available';
            const profile = activeProfiles.find(p => p.charge_point_id === cp.id);
            const currentLimit = profile?.schedule_periods?.[0]?.limit;
            const maxPower = cp.max_power || 0;
            const usagePct = maxPower > 0 && currentLimit ? Math.min((currentLimit / maxPower) * 100, 100) : (isCharging ? 100 : 0);

            return (
              <div
                key={cp.id}
                className={`rounded-lg border p-3 space-y-2 transition-colors ${
                  isCharging 
                    ? 'border-primary/40 bg-primary/5' 
                    : isAvailable 
                      ? 'border-border bg-card' 
                      : 'border-destructive/30 bg-destructive/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground truncate">{cp.name}</span>
                  <span className={`flex h-2 w-2 rounded-full ${
                    isCharging ? 'bg-primary' : isAvailable ? 'bg-muted-foreground/40' : 'bg-destructive'
                  }`}>
                    {isCharging && (
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75" />
                    )}
                  </span>
                </div>

                {/* Power bar */}
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isCharging ? 'bg-primary' : 'bg-muted-foreground/20'
                    }`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {isCharging ? 'Laden' : isAvailable ? 'Beschikbaar' : cp.status}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {currentLimit ? `${(currentLimit / 1000).toFixed(1)} kW` : maxPower > 0 ? `${(maxPower / 1000).toFixed(1)} kW` : '—'}
                  </span>
                </div>

                {profile && (
                  <div className="flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5 text-primary" />
                    <span className="text-[9px] font-mono text-primary">Profiel actief</span>
                  </div>
                )}
              </div>
            );
          })}

          {(!chargePoints || chargePoints.length === 0) && (
            <div className="col-span-full text-center py-6">
              <Cable className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Geen laadpalen geconfigureerd</p>
            </div>
          )}
        </div>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border">
          <StatMini label="Laden" value={chargingCPs.length} suffix="palen" color="text-primary" />
          <StatMini label="Beschikbaar" value={availableCPs.length} suffix="palen" color="text-muted-foreground" />
          <StatMini label="Totaal laden" value={`${(totalChargingPower / 1000).toFixed(1)}`} suffix="kW" color="text-primary" />
          <StatMini label="GTV headroom" value={`${Math.max(gtvLimitKw - gridPowerW / 1000, 0).toFixed(1)}`} suffix="kW" color={gridUsagePct > 80 ? 'text-destructive' : 'text-foreground'} />
        </div>
      </div>
    </div>
  );
};

/* ── Sub-components ─────────────────────────── */

const EnergyFlowArrow = ({ label, active }: { label: string; active: boolean }) => (
  <div className="flex items-center justify-center gap-2">
    <div className="flex-1 h-px bg-border relative overflow-hidden">
      {active && (
        <div className="absolute inset-0">
          <div className="h-px w-8 bg-gradient-to-r from-transparent via-primary to-transparent animate-energy-flow-down"
               style={{ animation: 'energy-flow-horizontal 1.5s ease-in-out infinite', position: 'absolute', top: 0, left: 0 }} />
        </div>
      )}
    </div>
    <div className="flex flex-col items-center gap-1">
      {/* Animated flow dots */}
      <div className="relative h-6 w-4 flex justify-center overflow-hidden">
        {active ? (
          <>
            <div className="absolute w-1.5 h-1.5 rounded-full bg-primary animate-energy-dot" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-primary animate-energy-dot" style={{ animationDelay: '0.33s' }} />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-primary animate-energy-dot" style={{ animationDelay: '0.66s' }} />
          </>
        ) : (
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        )}
      </div>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-border ${
        active ? 'bg-primary/10 border-primary/30' : 'bg-muted/50'
      }`}>
        <ArrowDown className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      {/* Bottom flow dots */}
      <div className="relative h-6 w-4 flex justify-center overflow-hidden">
        {active ? (
          <>
            <div className="absolute w-1.5 h-1.5 rounded-full bg-primary/60 animate-energy-dot" style={{ animationDelay: '0.15s' }} />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-primary/60 animate-energy-dot" style={{ animationDelay: '0.5s' }} />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-primary/60 animate-energy-dot" style={{ animationDelay: '0.85s' }} />
          </>
        ) : (
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        )}
      </div>
    </div>
    <div className="flex-1 h-px bg-border" />
  </div>
);

const SourceCard = ({
  icon, label, powerW, color, bgColor, subLabel,
}: {
  icon: React.ReactNode;
  label: string;
  powerW: number;
  color: string;
  bgColor: string;
  subLabel: string;
}) => (
  <div className={`rounded-lg ${bgColor} border border-border p-3 space-y-2`}>
    <div className="flex items-center justify-between">
      <div className={`${color}`}>{icon}</div>
      <span className="text-[10px] text-muted-foreground">{subLabel}</span>
    </div>
    <div>
      <p className={`font-mono text-lg font-bold ${color}`}>
        {(Math.abs(powerW) / 1000).toFixed(1)}
      </p>
      <p className="text-[10px] text-muted-foreground">kW · {label}</p>
    </div>
  </div>
);

const StatMini = ({
  label, value, suffix, color,
}: {
  label: string;
  value: string | number;
  suffix: string;
  color: string;
}) => (
  <div className="text-center">
    <p className={`font-mono text-sm font-bold ${color}`}>{value}</p>
    <p className="text-[10px] text-muted-foreground">{label}</p>
  </div>
);

export default SmartChargingVisualization;
