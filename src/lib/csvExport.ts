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

/**
 * Generic CSV export: accepts an array of objects and downloads as CSV.
 */
export function downloadAsCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[],
) {
  if (!data.length) return;

  const cols = columns ?? Object.keys(data[0]).map(k => ({ key: k as keyof T, label: String(k) }));
  const header = cols.map(c => c.label).join(';');
  const rows = data.map(row =>
    cols.map(c => {
      const val = row[c.key];
      if (val == null) return '';
      if (typeof val === 'string' && val.includes(';')) return `"${val}"`;
      return String(val);
    }).join(';')
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
