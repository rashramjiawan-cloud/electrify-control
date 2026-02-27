import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useChargingInvoices } from '@/hooks/useChargingInvoices';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Search, Euro, Zap, Clock, Car } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { downloadAsCsv } from '@/lib/csvExport';

const statusColors: Record<string, string> = {
  open: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  betaald: 'bg-green-500/10 text-green-600 border-green-500/20',
  vervallen: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const Facturatie = () => {
  const { invoices, isLoading, updateStatus } = useChargingInvoices();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        !search ||
        inv.charge_point_id.toLowerCase().includes(search.toLowerCase()) ||
        inv.vehicle_id?.toLowerCase().includes(search.toLowerCase()) ||
        inv.transaction_id.toString().includes(search);
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, statusFilter]);

  const totals = useMemo(() => ({
    count: filtered.length,
    energy: filtered.reduce((s, i) => s + i.energy_kwh, 0),
    revenue: filtered.reduce((s, i) => s + i.total_cost, 0),
  }), [filtered]);

  const handleExport = () => {
    downloadAsCsv(
      filtered.map((inv) => ({
        Factuurnr: inv.id.slice(0, 8),
        Transactie: inv.transaction_id,
        Laadpaal: inv.charge_point_id,
        Voertuig: inv.vehicle_id || '-',
        'Energie (kWh)': inv.energy_kwh,
        'Duur (min)': inv.duration_min,
        Starttarief: inv.start_fee,
        Energiekosten: inv.energy_cost,
        Stilstandkosten: inv.idle_cost,
        Totaal: inv.total_cost,
        Valuta: inv.currency,
        Status: inv.status,
        Datum: inv.created_at,
      })),
      'facturen'
    );
  };

  return (
    <AppLayout title="Facturatie" subtitle="Automatische facturatie per laadsessie">
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Facturen</p>
              <p className="text-lg font-bold text-foreground">{totals.count}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Totaal energie</p>
              <p className="text-lg font-bold text-foreground">{totals.energy.toFixed(1)} kWh</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Euro className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Totaal omzet</p>
              <p className="text-lg font-bold text-foreground">€ {totals.revenue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek op laadpaal, voertuig of transactie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="betaald">Betaald</SelectItem>
              <SelectItem value="vervallen">Vervallen</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Transactie</TableHead>
                <TableHead>Laadpaal</TableHead>
                <TableHead>Voertuig</TableHead>
                <TableHead className="text-right">kWh</TableHead>
                <TableHead className="text-right">Duur</TableHead>
                <TableHead className="text-right">Starttarief</TableHead>
                <TableHead className="text-right">Energie</TableHead>
                <TableHead className="text-right">Stilstand</TableHead>
                <TableHead className="text-right">Totaal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    Laden...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    Geen facturen gevonden. Facturen worden automatisch aangemaakt bij het afronden van een laadsessie.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">
                      {format(new Date(inv.created_at), 'dd MMM yyyy HH:mm', { locale: nl })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">#{inv.transaction_id}</TableCell>
                    <TableCell className="text-xs font-medium">{inv.charge_point_id}</TableCell>
                    <TableCell className="text-xs">
                      {inv.vehicle_id ? (
                        <span className="flex items-center gap-1">
                          <Car className="h-3 w-3" />
                          {inv.vehicle_id}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-xs">{inv.energy_kwh.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-xs flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" />{inv.duration_min.toFixed(0)}m
                    </TableCell>
                    <TableCell className="text-right text-xs">€{inv.start_fee.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs">€{inv.energy_cost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs">€{inv.idle_cost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs font-bold">€{inv.total_cost.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[inv.status] || ''}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inv.status === 'open' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => updateStatus.mutate({ id: inv.id, status: 'betaald' })}
                        >
                          Betaald
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
};

export default Facturatie;
