import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useEnergyMeters } from '@/hooks/useEnergyMeters';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Thermometer, Signal, Clock, AlertTriangle, Wifi, Activity, Server } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';

type TimeRange = '1h' | '6h' | '24h' | '7d';

const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

function useDeviceHealth(meterId: string | undefined, range: TimeRange) {
  const since = useMemo(() => {
    return new Date(Date.now() - RANGE_MS[range]).toISOString();
  }, [range]);

  return useQuery({
    queryKey: ['device-health', meterId, range],
    enabled: !!meterId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meter_device_health')
        .select('*')
        .eq('meter_id', meterId!)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const formatTime = (ts: string, range: TimeRange) => {
  const d = new Date(ts);
  if (range === '7d') return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
};

const formatUptime = (sec: number) => {
  if (sec > 86400) return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}u`;
  if (sec > 3600) return `${Math.floor(sec / 3600)}u ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 60)}m`;
};

const StatCard = ({ icon: Icon, label, value, subtext, color }: {
  icon: any; label: string; value: string; subtext?: string; color: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
    <div className="flex items-center gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
    <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
    {subtext && <p className="text-[10px] text-muted-foreground">{subtext}</p>}
  </div>
);

const DeviceHealth = () => {
  const { data: meters } = useEnergyMeters();
  const wsMeters = meters?.filter(m => m.connection_type === 'outbound_ws' || m.connection_type === 'webhook') ?? [];
  const [selectedMeterId, setSelectedMeterId] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<TimeRange>('6h');

  const activeMeter = selectedMeterId
    ? wsMeters.find(m => m.id === selectedMeterId)
    : wsMeters[0];

  const { data: healthData, isLoading } = useDeviceHealth(activeMeter?.id, range);

  // Current values from last_reading
  const deviceInfo = activeMeter?.last_reading?.device_info as any | undefined;
  const phaseFaults = activeMeter?.last_reading?.phase_faults as any[] | undefined;

  // Chart data
  const chartData = useMemo(() => {
    if (!healthData?.length) return [];
    return healthData.map((h: any) => ({
      time: h.recorded_at,
      timeLabel: formatTime(h.recorded_at, range),
      temperature: h.temperature,
      wifi_rssi: h.wifi_rssi,
      uptime: h.uptime ? Math.round(h.uptime / 3600) : null,
      faults: h.phase_faults?.length ?? 0,
    }));
  }, [healthData, range]);

  // Stats
  const latestTemp = deviceInfo?.temperature ?? chartData[chartData.length - 1]?.temperature ?? null;
  const latestRssi = deviceInfo?.wifi_rssi ?? chartData[chartData.length - 1]?.wifi_rssi ?? null;
  const latestUptime = deviceInfo?.uptime ?? (chartData[chartData.length - 1]?.uptime ? chartData[chartData.length - 1].uptime * 3600 : null);
  const maxTemp = chartData.length > 0
    ? Math.max(...chartData.filter((d: any) => d.temperature != null).map((d: any) => d.temperature))
    : null;
  const avgRssi = chartData.length > 0
    ? Math.round(chartData.filter((d: any) => d.wifi_rssi != null).reduce((s: number, d: any) => s + d.wifi_rssi, 0) / chartData.filter((d: any) => d.wifi_rssi != null).length)
    : null;
  const totalFaults = chartData.reduce((s: number, d: any) => s + d.faults, 0);

  return (
    <AppLayout title="Device Health" subtitle="Monitoring van Shelly energiemeters">
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={activeMeter?.id ?? ''}
            onValueChange={setSelectedMeterId}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Selecteer meter" />
            </SelectTrigger>
            <SelectContent>
              {wsMeters.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['1h', '6h', '24h', '7d'] as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {activeMeter && (
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${
                activeMeter.last_poll_at ? 'border-green-500/30 text-green-600 dark:text-green-400' : 'border-muted-foreground/30 text-muted-foreground'
              }`}>
                {activeMeter.last_poll_at ? 'Online' : 'Offline'}
              </Badge>
            </div>
          )}
        </div>

        {!activeMeter ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Server className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Geen meters met push-verbinding gevonden.</p>
          </div>
        ) : (
          <>
            {/* Current Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={Thermometer}
                label="Temperatuur"
                value={latestTemp != null ? `${Number(latestTemp).toFixed(1)}°C` : '—'}
                subtext={maxTemp != null ? `Max: ${maxTemp.toFixed(1)}°C` : undefined}
                color={latestTemp != null && latestTemp > 70 ? 'bg-destructive/10 text-destructive' : latestTemp != null && latestTemp > 55 ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}
              />
              <StatCard
                icon={Signal}
                label="WiFi Signaal"
                value={latestRssi != null ? `${latestRssi} dBm` : '—'}
                subtext={avgRssi != null ? `Gem: ${avgRssi} dBm · ${deviceInfo?.wifi_ssid ?? ''}` : deviceInfo?.wifi_ssid ?? undefined}
                color={latestRssi != null && latestRssi > -50 ? 'bg-green-500/10 text-green-600 dark:text-green-400' : latestRssi != null && latestRssi > -70 ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-500'}
              />
              <StatCard
                icon={Clock}
                label="Uptime"
                value={latestUptime != null ? formatUptime(latestUptime) : '—'}
                subtext={deviceInfo?.wifi_ip ? `IP: ${deviceInfo.wifi_ip}` : undefined}
                color="bg-primary/10 text-primary"
              />
              <StatCard
                icon={AlertTriangle}
                label="Fase-fouten"
                value={`${totalFaults}`}
                subtext={totalFaults > 0 ? `In de afgelopen ${range}` : 'Geen fouten gedetecteerd'}
                color={totalFaults > 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600 dark:text-green-400'}
              />
            </div>

            {/* Active Phase Faults */}
            {phaseFaults && phaseFaults.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">Actieve fase-fouten</span>
                </div>
                {phaseFaults.map((f: any, i: number) => (
                  <p key={i} className="text-xs text-destructive/80 ml-6">
                    {f.type === 'phase_loss' && `⚠ Fase ${f.phase + 1}: Faseverlies (${Number(f.value).toFixed(1)}V)`}
                    {f.type === 'undervoltage' && `↓ Fase ${f.phase + 1}: Onderspanning (${Number(f.value).toFixed(1)}V)`}
                    {f.type === 'overvoltage' && `↑ Fase ${f.phase + 1}: Overspanning (${Number(f.value).toFixed(1)}V)`}
                    {!['phase_loss', 'undervoltage', 'overvoltage'].includes(f.type) && `⚡ ${f.type}`}
                  </p>
                ))}
              </div>
            )}

            {/* Temperature Chart */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3 flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Temperatuur</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">°C</span>
              </div>
              <div className="p-4 h-[200px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any) => [`${Number(v).toFixed(1)}°C`, 'Temperatuur']}
                      />
                      <ReferenceLine y={70} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: '70°C', fill: 'hsl(var(--destructive))', fontSize: 10 }} />
                      <Area
                        type="monotone"
                        dataKey="temperature"
                        stroke="hsl(var(--destructive))"
                        fill="url(#tempGrad)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    {isLoading ? 'Laden…' : 'Geen data beschikbaar voor deze periode'}
                  </div>
                )}
              </div>
            </div>

            {/* WiFi RSSI Chart */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3 flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">WiFi Signaalsterkte</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">dBm</span>
              </div>
              <div className="p-4 h-[200px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="rssiGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" domain={[-100, -20]} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any) => [`${v} dBm`, 'WiFi RSSI']}
                      />
                      <ReferenceLine y={-70} stroke="hsl(var(--chart-2))" strokeDasharray="4 4" label={{ value: 'Zwak', fill: 'hsl(var(--chart-2))', fontSize: 10 }} />
                      <Area
                        type="monotone"
                        dataKey="wifi_rssi"
                        stroke="hsl(var(--primary))"
                        fill="url(#rssiGrad)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    {isLoading ? 'Laden…' : 'Geen data beschikbaar voor deze periode'}
                  </div>
                )}
              </div>
            </div>

            {/* Uptime Chart */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Uptime</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">uren</span>
              </div>
              <div className="p-4 h-[200px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any) => [`${v}u`, 'Uptime']}
                      />
                      <Line
                        type="stepAfter"
                        dataKey="uptime"
                        stroke="hsl(var(--chart-4))"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    {isLoading ? 'Laden…' : 'Geen data beschikbaar voor deze periode'}
                  </div>
                )}
              </div>
            </div>

            {/* Device Details */}
            {deviceInfo && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-3 flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Device Details</h3>
                </div>
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {deviceInfo.mac && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">MAC</span>
                      <p className="text-xs font-mono text-foreground">{deviceInfo.mac}</p>
                    </div>
                  )}
                  {deviceInfo.wifi_ip && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">IP Adres</span>
                      <p className="text-xs font-mono text-foreground">{deviceInfo.wifi_ip}</p>
                    </div>
                  )}
                  {deviceInfo.wifi_ssid && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">WiFi Netwerk</span>
                      <p className="text-xs font-mono text-foreground">{deviceInfo.wifi_ssid}</p>
                    </div>
                  )}
                  {deviceInfo.firmware_version && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Firmware Update</span>
                      <p className="text-xs font-mono text-foreground">{deviceInfo.firmware_version}</p>
                    </div>
                  )}
                  {activeMeter.shelly_device_id && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Device ID</span>
                      <p className="text-xs font-mono text-foreground">{activeMeter.shelly_device_id}</p>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Verbinding</span>
                    <p className="text-xs font-mono text-foreground">{activeMeter.connection_type}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Meter Type</span>
                    <p className="text-xs font-mono text-foreground">{activeMeter.meter_type}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Laatste Data</span>
                    <p className="text-xs font-mono text-foreground">
                      {activeMeter.last_poll_at
                        ? new Date(activeMeter.last_poll_at).toLocaleString('nl-NL')
                        : 'Nooit'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default DeviceHealth;
