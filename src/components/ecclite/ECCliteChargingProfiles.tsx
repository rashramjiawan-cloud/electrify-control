import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Trash2 } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry, OcppSendFn } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
  sendOcpp: OcppSendFn;
}

interface ConnectorProfile {
  profileId: number;
  stackLevel: number;
  purpose: string;
  kind: string;
  unit: string;
  limit: number;
  phases: number;
}

const DEFAULT_PROFILE: ConnectorProfile = {
  profileId: 1,
  stackLevel: 0,
  purpose: 'TxDefaultProfile',
  kind: 'Absolute',
  unit: 'A',
  limit: 0,
  phases: 3,
};

const ECCliteChargingProfiles = ({ controller, addLog, sendOcpp }: Props) => {
  const [profiles, setProfiles] = useState<[ConnectorProfile, ConnectorProfile]>([
    { ...DEFAULT_PROFILE, profileId: 1 },
    { ...DEFAULT_PROFILE, profileId: 2 },
  ]);

  const updateProfile = (idx: 0 | 1, updates: Partial<ConnectorProfile>) => {
    setProfiles(prev => {
      const next = [...prev] as [ConnectorProfile, ConnectorProfile];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  };

  const setChargingProfile = async (connectorId: 1 | 2) => {
    if (!controller.connected) return;
    const p = profiles[connectorId - 1];

    addLog(`SetChargingProfile connectorId:${connectorId} limit:${p.limit}${p.unit} purpose:${p.purpose}`, 'blue');

    try {
      await sendOcpp('SetChargingProfile', {
        connectorId,
        csChargingProfiles: {
          chargingProfileId: p.profileId,
          stackLevel: p.stackLevel,
          chargingProfilePurpose: p.purpose,
          chargingProfileKind: p.kind,
          chargingSchedule: {
            chargingRateUnit: p.unit,
            chargingSchedulePeriod: [{
              startPeriod: 0,
              limit: p.limit,
              numberPhases: p.phases,
            }],
          },
        },
      });
      addLog(`Connector ${connectorId}: Laadprofiel ingesteld op ${p.limit}${p.unit}`, 'green');
    } catch (err) {
      addLog(`SetChargingProfile failed: ${(err as Error).message}`, 'red');
    }
  };

  const clearChargingProfile = async (connectorId: 1 | 2) => {
    if (!controller.connected) return;
    updateProfile((connectorId - 1) as 0 | 1, { limit: 0 });

    try {
      await sendOcpp('ClearChargingProfile', { connectorId });
      addLog(`Connector ${connectorId}: Laadprofiel verwijderd`, 'yellow');
    } catch (err) {
      addLog(`ClearChargingProfile failed: ${(err as Error).message}`, 'red');
    }
  };

  const getTimelineColor = (limit: number) => {
    if (limit === 0) return 'bg-destructive/40';
    if (limit <= 8) return 'bg-yellow-500/70';
    if (limit <= 16) return 'bg-primary/70';
    return 'bg-emerald-500/70';
  };

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Laadprofielen</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">OCPP Smart Charging – profiel per connector</p>
      </div>

      {!controller.connected && (
        <p className="text-xs text-destructive text-center py-2 bg-destructive/5">
          Verbind eerst met de controller
        </p>
      )}

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-5">
          {profiles.map((p, idx) => {
            const connectorId = (idx + 1) as 1 | 2;
            return (
              <div key={idx} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-foreground tracking-wider uppercase">
                  Connector {connectorId} Profiel
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">PROFIEL ID</Label>
                    <Input
                      type="number"
                      value={p.profileId}
                      onChange={e => updateProfile(idx as 0 | 1, { profileId: Number(e.target.value) })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">STACK LEVEL</Label>
                    <Input
                      type="number"
                      value={p.stackLevel}
                      onChange={e => updateProfile(idx as 0 | 1, { stackLevel: Number(e.target.value) })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">DOEL</Label>
                    <Select value={p.purpose} onValueChange={v => updateProfile(idx as 0 | 1, { purpose: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TxDefaultProfile" className="text-xs">TxDefaultProfile</SelectItem>
                        <SelectItem value="TxProfile" className="text-xs">TxProfile</SelectItem>
                        <SelectItem value="ChargePointMaxProfile" className="text-xs">ChargePointMaxProfile</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">SOORT</Label>
                    <Select value={p.kind} onValueChange={v => updateProfile(idx as 0 | 1, { kind: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Absolute" className="text-xs">Absolute</SelectItem>
                        <SelectItem value="Recurring" className="text-xs">Recurring</SelectItem>
                        <SelectItem value="Relative" className="text-xs">Relative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">EENHEID</Label>
                    <Select value={p.unit} onValueChange={v => updateProfile(idx as 0 | 1, { unit: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A" className="text-xs">Ampère (A)</SelectItem>
                        <SelectItem value="W" className="text-xs">Watt (W)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">MAX LIMIET</Label>
                    <Input
                      type="number"
                      min={0}
                      max={p.unit === 'A' ? 32 : 22080}
                      value={p.limit}
                      onChange={e => updateProfile(idx as 0 | 1, { limit: Number(e.target.value) })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-mono tracking-wider">FASEN</Label>
                  <Select value={String(p.phases)} onValueChange={v => updateProfile(idx as 0 | 1, { phases: Number(v) })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1" className="text-xs">1-fase</SelectItem>
                      <SelectItem value="3" className="text-xs">3-fase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => setChargingProfile(connectorId)}
                    disabled={!controller.connected}
                    className="gap-1.5 text-xs flex-1"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Instellen
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => clearChargingProfile(connectorId)}
                    disabled={!controller.connected}
                    className="gap-1.5 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Visual timeline */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground tracking-wider uppercase">Visueel Profiel</h3>

          <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-0.5">
            <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>24:00</span>
          </div>

          {profiles.map((p, idx) => (
            <div key={idx}>
              <div className={`
                h-12 rounded flex items-center justify-center font-mono text-xs font-bold
                ${getTimelineColor(p.limit)}
                text-background
              `}>
                {p.limit}{p.unit}
              </div>
              <p className="text-[9px] font-mono text-muted-foreground mt-1 tracking-wider">CONNECTOR {idx + 1}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ECCliteChargingProfiles;
