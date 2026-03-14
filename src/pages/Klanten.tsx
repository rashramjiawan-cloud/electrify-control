import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useCustomers, useCreateCustomer } from '@/hooks/useUsers';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, ChevronRight, X, Pencil, Trash2, Users, Zap, Loader2, Search, User, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface CustomerStats {
  customer_id: string;
  user_count: number;
  charge_point_count: number;
}

function useCustomerStats() {
  return useQuery({
    queryKey: ['customer-stats'],
    queryFn: async () => {
      const [{ data: profiles }, { data: chargePoints }] = await Promise.all([
        supabase.from('profiles').select('customer_id'),
        supabase.from('charge_points').select('customer_id'),
      ]);

      const stats = new Map<string, CustomerStats>();

      for (const p of profiles || []) {
        if (!p.customer_id) continue;
        if (!stats.has(p.customer_id)) stats.set(p.customer_id, { customer_id: p.customer_id, user_count: 0, charge_point_count: 0 });
        stats.get(p.customer_id)!.user_count++;
      }

      for (const cp of chargePoints || []) {
        if (!cp.customer_id) continue;
        if (!stats.has(cp.customer_id)) stats.set(cp.customer_id, { customer_id: cp.customer_id, user_count: 0, charge_point_count: 0 });
        stats.get(cp.customer_id)!.charge_point_count++;
      }

      return stats;
    },
  });
}

function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string | null; contact_email?: string | null; contact_phone?: string | null; address?: string | null }) => {
      const { error } = await supabase.from('customers').update(data as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Klant bijgewerkt');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}

function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-stats'] });
      toast.success('Klant verwijderd');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}

const Klanten = () => {
  const { data: customers, isLoading } = useCustomers();
  const { data: statsMap } = useCustomerStats();
  const createCustomer = useCreateCustomer();
  const isMobile = useIsMobile();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const selectedCustomer = customers?.find(c => c.id === selectedId);

  const filtered = customers?.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    createCustomer.mutate(
      { name: newName.trim(), contact_email: newEmail || undefined, description: newDescription || undefined } as any,
      {
        onSuccess: () => {
          setNewOpen(false);
          setNewName('');
          setNewEmail('');
          setNewPhone('');
          setNewAddress('');
          setNewDescription('');
        },
      }
    );
  };

  const detailContent = selectedCustomer ? (
    <CustomerDetailPanel
      customer={selectedCustomer}
      stats={statsMap?.get(selectedCustomer.id)}
      onClose={() => setSelectedId(null)}
    />
  ) : null;

  return (
    <AppLayout title="Klanten" subtitle="Overzicht en beheer van alle klanten">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Totaal klanten" value={customers?.length || 0} icon={<Building2 className="h-4 w-4" />} />
        <SummaryCard
          label="Met gebruikers"
          value={customers?.filter(c => (statsMap?.get(c.id)?.user_count || 0) > 0).length || 0}
          icon={<Users className="h-4 w-4" />}
        />
        <SummaryCard
          label="Met laadpalen"
          value={customers?.filter(c => (statsMap?.get(c.id)?.charge_point_count || 0) > 0).length || 0}
          icon={<Zap className="h-4 w-4" />}
        />
        <SummaryCard
          label="Zonder assets"
          value={customers?.filter(c => !(statsMap?.get(c.id)?.user_count || 0) && !(statsMap?.get(c.id)?.charge_point_count || 0)).length || 0}
          icon={<Building2 className="h-4 w-4" />}
          muted
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-auto lg:h-[calc(100vh-18rem)]">
        {/* List */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-border bg-card flex flex-col lg:h-full">
            <div className="border-b border-border px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Klanten</h2>
                  <p className="text-xs text-muted-foreground">{filtered?.length || 0} klanten</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="relative hidden sm:block">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Zoeken..."
                    className="h-8 w-44 pl-8 text-xs"
                  />
                </div>
                <Dialog open={newOpen} onOpenChange={setNewOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Nieuwe klant</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nieuwe klant aanmaken</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <Field label="Naam *" value={newName} onChange={setNewName} placeholder="Bedrijfsnaam" />
                      <Field label="Contact e-mail" value={newEmail} onChange={setNewEmail} placeholder="info@bedrijf.nl" type="email" />
                      <Field label="Telefoon" value={newPhone} onChange={setNewPhone} placeholder="+31 6 12345678" />
                      <Field label="Adres" value={newAddress} onChange={setNewAddress} placeholder="Straat 1, Stad" />
                      <Field label="Omschrijving" value={newDescription} onChange={setNewDescription} placeholder="Korte omschrijving" />
                      <Button onClick={handleCreate} disabled={!newName.trim()} className="w-full">Aanmaken</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Klant</TableHead>
                    <TableHead className="hidden sm:table-cell">Gebruikers</TableHead>
                    <TableHead className="hidden sm:table-cell">Laadpalen</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Laden...</TableCell></TableRow>
                  ) : !filtered?.length ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Geen klanten gevonden</TableCell></TableRow>
                  ) : filtered.map(customer => {
                    const stats = statsMap?.get(customer.id);
                    return (
                      <TableRow
                        key={customer.id}
                        className={cn('cursor-pointer', selectedId === customer.id && 'bg-primary/5')}
                        onClick={() => setSelectedId(customer.id)}
                      >
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-foreground">{customer.name}</p>
                            {customer.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{customer.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary" className="text-[10px]">
                            <Users className="h-3 w-3 mr-1" />
                            {stats?.user_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary" className="text-[10px]">
                            <Zap className="h-3 w-3 mr-1" />
                            {stats?.charge_point_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">{customer.contact_email || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {isMobile ? (
          <Sheet open={!!selectedCustomer} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
            <SheetContent side="right" className="w-full sm:w-[400px] p-0 overflow-y-auto">
              <SheetHeader className="sr-only">
                <SheetTitle>Klant details</SheetTitle>
              </SheetHeader>
              {detailContent}
            </SheetContent>
          </Sheet>
        ) : (
          selectedCustomer ? (
            <div className="w-96 shrink-0">{detailContent}</div>
          ) : (
            <div className="hidden lg:flex w-96 shrink-0 rounded-xl border border-border bg-card items-center justify-center">
              <p className="text-sm text-muted-foreground">Selecteer een klant</p>
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
};

/* ── Detail panel ── */

interface CustomerDetailPanelProps {
  customer: { id: string; name: string; description: string | null; contact_email: string | null; contact_phone: string | null; address: string | null; created_at?: string };
  stats?: CustomerStats;
  onClose: () => void;
}

const CustomerDetailPanel = ({ customer, stats, onClose }: CustomerDetailPanelProps) => {
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.contact_email || '');
  const [phone, setPhone] = useState(customer.contact_phone || '');
  const [address, setAddress] = useState(customer.address || '');
  const [description, setDescription] = useState(customer.description || '');

  // Fetch linked users
  const { data: linkedUsers } = useQuery({
    queryKey: ['customer-users', customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .eq('customer_id', customer.id);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch linked charge points
  const { data: linkedChargePoints } = useQuery({
    queryKey: ['customer-charge-points', customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charge_points')
        .select('id, name, status, location')
        .eq('customer_id', customer.id);
      if (error) throw error;
      return data || [];
    },
  });

  const handleSave = () => {
    updateCustomer.mutate({
      id: customer.id,
      name: name.trim(),
      contact_email: email || null,
      contact_phone: phone || null,
      address: address || null,
      description: description || null,
    }, { onSuccess: () => setEditing(false) });
  };

  const handleDelete = () => {
    if (!confirm(`Weet je zeker dat je "${customer.name}" wilt verwijderen?`)) return;
    deleteCustomer.mutate(customer.id, { onSuccess: onClose });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'Available': return 'text-green-500';
      case 'Charging': case 'Occupied': return 'text-blue-500';
      case 'Faulted': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{customer.name}</h3>
          {customer.created_at && (
            <p className="text-xs text-muted-foreground">
              Aangemaakt {new Date(customer.created_at).toLocaleDateString('nl-NL')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(!editing)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats?.user_count || 0}</p>
            <p className="text-[11px] text-muted-foreground">Gebruikers</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats?.charge_point_count || 0}</p>
            <p className="text-[11px] text-muted-foreground">Laadpalen</p>
          </div>
        </div>

        {/* Details */}
        {editing ? (
          <div className="space-y-3">
            <Field label="Naam" value={name} onChange={setName} />
            <Field label="E-mail" value={email} onChange={setEmail} type="email" />
            <Field label="Telefoon" value={phone} onChange={setPhone} />
            <Field label="Adres" value={address} onChange={setAddress} />
            <Field label="Omschrijving" value={description} onChange={setDescription} />
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={!name.trim()} className="flex-1" size="sm">Opslaan</Button>
              <Button variant="outline" onClick={() => setEditing(false)} size="sm">Annuleren</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <DetailRow label="Naam" value={customer.name} />
            <DetailRow label="E-mail" value={customer.contact_email} />
            <DetailRow label="Telefoon" value={customer.contact_phone} />
            <DetailRow label="Adres" value={customer.address} />
            <DetailRow label="Omschrijving" value={customer.description} />
          </div>
        )}

        {/* Linked Users */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Gekoppelde gebruikers ({linkedUsers?.length || 0})
            </span>
          </div>
          {linkedUsers && linkedUsers.length > 0 ? (
            <div className="space-y-1">
              {linkedUsers.map(u => (
                <div key={u.user_id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-muted/40">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <User className="h-3 w-3 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.display_name || '—'}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{u.email}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic px-1">Geen gebruikers gekoppeld</p>
          )}
        </div>

        {/* Linked Charge Points */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Gekoppelde laadpalen ({linkedChargePoints?.length || 0})
            </span>
          </div>
          {linkedChargePoints && linkedChargePoints.length > 0 ? (
            <div className="space-y-1">
              {linkedChargePoints.map(cp => (
                <div key={cp.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-muted/40">
                  <Circle className={cn('h-2.5 w-2.5 fill-current shrink-0', statusColor(cp.status))} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cp.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {cp.status}{cp.location ? ` · ${cp.location}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic px-1">Geen laadpalen gekoppeld</p>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Small helpers ── */

const SummaryCard = ({ label, value, icon, muted }: { label: string; value: number; icon: React.ReactNode; muted?: boolean }) => (
  <div className="rounded-xl border border-border bg-card px-4 py-3">
    <div className="flex items-center gap-2 mb-1">
      <span className={cn('text-primary', muted && 'text-muted-foreground')}>{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <p className={cn('text-xl font-bold', muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</p>
  </div>
);

const DetailRow = ({ label, value }: { label: string; value: string | null }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
    <p className="text-sm text-foreground">{value || '—'}</p>
  </div>
);

const Field = ({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} />
  </div>
);

export default Klanten;
