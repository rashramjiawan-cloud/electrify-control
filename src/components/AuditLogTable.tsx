import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollText, Search, CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AuditLog {
  id: number;
  charge_point_id: string;
  action: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

interface AuditLogTableProps {
  logs: AuditLog[];
  chargePointIds: string[];
}

const ACTIONS = [
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'ChangeConfiguration',
  'GetConfiguration',
  'Reset',
  'TriggerMessage',
  'UnlockConnector',
];

const PAGE_SIZE = 10;

const AuditLogTable = ({ logs, chargePointIds }: AuditLogTableProps) => {
  const [searchText, setSearchText] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterCp, setFilterCp] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = logs;

    if (filterAction !== 'all') {
      result = result.filter(l => l.action === filterAction);
    }
    if (filterCp !== 'all') {
      result = result.filter(l => l.charge_point_id === filterCp);
    }
    if (dateFrom) {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);
      result = result.filter(l => new Date(l.created_at) >= start);
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      result = result.filter(l => new Date(l.created_at) <= end);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(l =>
        l.action.toLowerCase().includes(q) ||
        l.charge_point_id.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        JSON.stringify(l.payload).toLowerCase().includes(q)
      );
    }

    return result;
  }, [logs, filterAction, filterCp, dateFrom, dateTo, searchText]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const hasFilters = filterAction !== 'all' || filterCp !== 'all' || !!dateFrom || !!dateTo || searchText.trim() !== '';

  const clearFilters = () => {
    setSearchText('');
    setFilterAction('all');
    setFilterCp('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(0);
  };

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">OCPP Audit Log</h2>
        <span className="text-xs text-muted-foreground">
          ({filtered.length} van {logs.length} commando's)
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Zoeken..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setPage(0); }}
            className="pl-8 h-8 w-48 text-xs"
          />
        </div>

        <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Alle acties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle acties</SelectItem>
            {ACTIONS.map(a => (
              <SelectItem key={a} value={a}>
                <span className="font-mono text-xs">{a}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCp} onValueChange={v => { setFilterCp(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Alle laadpalen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle laadpalen</SelectItem>
            {chargePointIds.map(id => (
              <SelectItem key={id} value={id}>
                <span className="font-mono text-xs">{id}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date From */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("h-8 text-xs gap-1.5 px-2.5", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, 'dd-MM-yyyy') : 'Van'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={d => { setDateFrom(d); setPage(0); }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {/* Date To */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("h-8 text-xs gap-1.5 px-2.5", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, 'dd-MM-yyyy') : 'Tot'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={d => { setDateTo(d); setPage(0); }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Wissen
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tijdstip</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Laadpaal</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Actie</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Details</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Geen resultaten gevonden
                </td>
              </tr>
            ) : (
              paged.map((log) => {
                const payload = typeof log.payload === 'object' && log.payload ? log.payload : {};
                const details = Object.entries(payload)
                  .filter(([k]) => k !== 'type')
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ');
                return (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('nl-NL', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-foreground">{log.charge_point_id}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground max-w-[300px] truncate">
                      {details || '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.status === 'Accepted' || log.status === 'Unlocked' ? 'bg-primary/10 text-primary' :
                        log.status === 'Rejected' ? 'bg-destructive/10 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            Pagina {safePage + 1} van {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={safePage === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogTable;
