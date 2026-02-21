import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from 'recharts';
import type { DbChargePoint } from '@/hooks/useChargePoints';

interface ChargePointDonutChartsProps {
  chargePoints: Array<DbChargePoint & { last_heartbeat: string | null }>;
}

const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const isOnline = (lastHeartbeat: string | null) => {
  if (!lastHeartbeat) return false;
  return Date.now() - new Date(lastHeartbeat).getTime() < HEARTBEAT_TIMEOUT_MS;
};

interface DonutData {
  name: string;
  value: number;
  color: string;
}

const DonutCard = ({ title, data, total }: { title: string; data: DonutData[]; total: number }) => {
  const nonZero = data.filter(d => d.value > 0);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex items-center gap-4 pt-0">
        <div className="w-[140px] h-[140px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={nonZero.length > 0 ? nonZero : [{ name: 'Geen', value: 1, color: 'hsl(var(--muted))' }]}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={62}
                paddingAngle={nonZero.length > 1 ? 3 : 0}
                dataKey="value"
                strokeWidth={0}
              >
                {(nonZero.length > 0 ? nonZero : [{ name: 'Geen', value: 1, color: 'hsl(var(--muted))' }]).map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
                <Label
                  value={total}
                  position="center"
                  className="text-2xl font-bold fill-foreground"
                />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          {data.map((item) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground truncate">{item.name}</span>
                <span className="ml-auto font-medium tabular-nums text-foreground whitespace-nowrap">
                  {item.value} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const ChargePointDonutCharts = ({ chargePoints }: ChargePointDonutChartsProps) => {
  const stats = useMemo(() => {
    const total = chargePoints.length;
    const now = Date.now();

    // 1. EVSE Status
    const available = chargePoints.filter(cp => cp.status === 'Available').length;
    const charging = chargePoints.filter(cp => cp.status === 'Charging').length;
    const preparing = chargePoints.filter(cp => ['Preparing', 'SuspendedEV', 'Finishing'].includes(cp.status)).length;
    const faulted = chargePoints.filter(cp => cp.status === 'Faulted').length;
    const unavailable = total - available - charging - preparing - faulted;

    // 2. Connection Status
    const online = chargePoints.filter(cp => isOnline(cp.last_heartbeat)).length;
    const offline = total - online;

    // 3. Last OCPP message
    const last4h = chargePoints.filter(cp => {
      if (!cp.last_heartbeat) return false;
      return now - new Date(cp.last_heartbeat).getTime() < FOUR_HOURS_MS;
    }).length;
    const last30d = chargePoints.filter(cp => {
      if (!cp.last_heartbeat) return false;
      const diff = now - new Date(cp.last_heartbeat).getTime();
      return diff >= FOUR_HOURS_MS && diff < THIRTY_DAYS_MS;
    }).length;
    const older = total - last4h - last30d;

    // 4. Charge Station Status (Available vs Unavailable/Faulted)
    const enabled = chargePoints.filter(cp => cp.status !== 'Unavailable' && cp.status !== 'Faulted').length;
    const disabled = total - enabled;

    return {
      total,
      evse: [
        { name: 'Beschikbaar', value: available, color: 'hsl(142, 71%, 45%)' },
        { name: 'Laden', value: charging, color: 'hsl(217, 91%, 60%)' },
        { name: 'Voorbereiden', value: preparing, color: 'hsl(45, 93%, 47%)' },
        { name: 'Storing', value: faulted, color: 'hsl(0, 84%, 60%)' },
        { name: 'Niet beschikbaar', value: unavailable, color: 'hsl(var(--muted))' },
      ],
      connection: [
        { name: 'Online', value: online, color: 'hsl(142, 71%, 45%)' },
        { name: 'Offline', value: offline, color: 'hsl(var(--muted))' },
      ],
      lastMessage: [
        { name: 'Laatste 4 uur', value: last4h, color: 'hsl(142, 71%, 45%)' },
        { name: '4u - 30 dagen', value: last30d, color: 'hsl(45, 93%, 47%)' },
        { name: 'Ouder / Nooit', value: older, color: 'hsl(var(--muted))' },
      ],
      stationStatus: [
        { name: 'Actief', value: enabled, color: 'hsl(142, 71%, 45%)' },
        { name: 'Uitgeschakeld', value: disabled, color: 'hsl(var(--muted))' },
      ],
    };
  }, [chargePoints]);

  if (stats.total === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
      <DonutCard title="EVSE Status" data={stats.evse} total={stats.total} />
      <DonutCard title="Verbindingsstatus" data={stats.connection} total={stats.total} />
      <DonutCard title="Laatste OCPP Bericht" data={stats.lastMessage} total={stats.total} />
      <DonutCard title="Laadstation Status" data={stats.stationStatus} total={stats.total} />
    </div>
  );
};

export default ChargePointDonutCharts;
