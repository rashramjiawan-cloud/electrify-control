import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useTransactions } from '@/hooks/useTransactions';
import { useChargePoints } from '@/hooks/useChargePoints';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt, Zap, Clock, Euro, ArrowUpDown } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { nl } from 'date-fns/locale';

const formatCurrency = (val: number | null) => {
  if (val == null) return '—';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(val);
};

const formatEnergy = (wh: number | null) => {
  if (wh == null || wh === 0) return '—';
  return `${(wh).toFixed(2)} kWh`;
};

const formatDuration = (start: string, stop: string | null) => {
  if (!stop) return 'Actief';
  const mins = differenceInMinutes(new Date(stop), new Date(start));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}u ${m}m`;
};

const statusVariant = (status: string) => {
  switch (status) {
    case 'Completed': return 'default';
    case 'Active': return 'secondary';
    default: return 'outline';
  }
};

const Transacties = () => {
  const [limit, setLimit] = useState(50);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: transactions, isLoading } = useTransactions(limit);
  const { data: chargePoints } = useChargePoints();

  const filtered = (transactions || []).filter(t =>
    statusFilter === 'all' ? true : t.status === statusFilter
  );

  const getCpName = (cpId: string) => {
    const cp = chargePoints?.find(c => c.id === cpId);
    return cp ? cp.name : cpId;
  };

  const totalEnergy = filtered.reduce((sum, t) => sum + (t.energy_delivered || 0), 0);
  const totalCost = filtered.reduce((sum, t) => sum + (t.cost || 0), 0);
  const completedCount = filtered.filter(t => t.status === 'Completed').length;
  const activeCount = filtered.filter(t => t.status === 'Active').length;

  return (
    <AppLayout title="Transacties" subtitle="Overzicht van alle laadsessies met kosten en energieverbruik">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Receipt className="h-3.5 w-3.5" />
            Sessies
          </div>
          <p className="text-2xl font-bold font-mono">{filtered.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {activeCount} actief · {completedCount} voltooid
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Zap className="h-3.5 w-3.5" />
            Totaal energie
          </div>
          <p className="text-2xl font-bold font-mono text-primary">{totalEnergy.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">kWh</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Euro className="h-3.5 w-3.5" />
            Totaal kosten
          </div>
          <p className="text-2xl font-bold font-mono">{formatCurrency(totalCost)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">excl. btw</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3.5 w-3.5" />
            Gem. duur
          </div>
          <p className="text-2xl font-bold font-mono">
            {completedCount > 0
              ? (() => {
                  const totalMins = filtered
                    .filter(t => t.stop_time)
                    .reduce((sum, t) => sum + differenceInMinutes(new Date(t.stop_time!), new Date(t.start_time)), 0);
                  const avg = Math.round(totalMins / completedCount);
                  return avg < 60 ? `${avg}m` : `${Math.floor(avg / 60)}u${avg % 60}m`;
                })()
              : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">per sessie</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <ArrowUpDown className="h-3.5 w-3.5 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="Active">Actief</SelectItem>
            <SelectItem value="Completed">Voltooid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25 rijen</SelectItem>
            <SelectItem value="50">50 rijen</SelectItem>
            <SelectItem value="100">100 rijen</SelectItem>
            <SelectItem value="500">500 rijen</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Geen transacties gevonden.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Laadpaal</TableHead>
                <TableHead>RFID Tag</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Duur</TableHead>
                <TableHead>Energie</TableHead>
                <TableHead>Kosten</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{t.id}</TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Zap className="h-3 w-3" />
                      {getCpName(t.charge_point_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.id_tag}</TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(t.start_time), 'dd MMM HH:mm', { locale: nl })}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {formatDuration(t.start_time, t.stop_time)}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-primary font-semibold">
                    {formatEnergy(t.energy_delivered)}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-semibold">
                    {formatCurrency(t.cost)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(t.status)} className={
                      t.status === 'Active' ? 'bg-primary/10 text-primary border-primary/20 animate-pulse' : ''
                    }>
                      {t.status === 'Completed' ? 'Voltooid' : t.status === 'Active' ? 'Actief' : t.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  );
};

export default Transacties;
