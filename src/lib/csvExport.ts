import type { MeterReading } from '@/hooks/useEnergyMeters';

const CSV_HEADERS = [
  'timestamp', 'channel', 'voltage', 'current', 'active_power',
  'apparent_power', 'power_factor', 'frequency', 'total_energy',
];

export function downloadReadingsAsCsv(readings: MeterReading[], filename = 'meterdata.csv') {
  const rows = readings.map(r => [
    r.timestamp,
    r.channel,
    r.voltage ?? '',
    r.current ?? '',
    r.active_power ?? '',
    r.apparent_power ?? '',
    r.power_factor ?? '',
    r.frequency ?? '',
    r.total_energy ?? '',
  ]);

  const csv = [CSV_HEADERS.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
