import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useUsers, useCustomers, useModulePermissions, useUpdateUserRole, useUpdateUserCustomer, useUpsertModulePermission, useCreateCustomer } from '@/hooks/useUsers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, Building2, Blocks, Plus, ChevronRight, X, UserPlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const ALL_MODULES = [
  { path: '/', label: 'Dashboard' },
  { path: '/laadpalen', label: 'Laadpalen' },
  { path: '/transacties', label: 'Transacties' },
  { path: '/batterij', label: 'Batterij' },
  { path: '/zonne-energie', label: 'Zonne-energie' },
  { path: '/ems', label: 'EMS' },
  { path: '/virtual-grids', label: 'Virtuele Grids' },
  { path: '/rfid', label: 'RFID Tags' },
  { path: '/plug-and-charge', label: 'Plug & Charge' },
  { path: '/tarieven', label: 'Tarieven' },
  { path: '/facturatie', label: 'Facturatie' },
  { path: '/smart-charging', label: 'Smart Charging' },
  { path: '/firmware', label: 'Firmware' },
  { path: '/reserveringen', label: 'Reserveringen' },
  { path: '/alerts', label: 'Alerts' },
  { path: '/instellingen', label: 'Instellingen' },
  { path: '/setup-guide', label: 'Setup Guide' },
];

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'bg-red-500/10 text-red-500' },
  { value: 'manager', label: 'Manager', color: 'bg-amber-500/10 text-amber-500' },
  { value: 'operator', label: 'Operator', color: 'bg-blue-500/10 text-blue-500' },
  { value: 'user', label: 'Gebruiker', color: 'bg-muted text-muted-foreground' },
  { value: 'viewer', label: 'Viewer', color: 'bg-muted text-muted-foreground' },
];

const Gebruikers = () => {
  const { data: users, isLoading } = useUsers();
  const { data: customers } = useCustomers();
  const updateRole = useUpdateUserRole();
  const updateCustomer = useUpdateUserCustomer();
  const createCustomer = useCreateCustomer();
  const queryClient = useQueryClient();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');

  // Invite state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviteLoading, setInviteLoading] = useState(false);

  const selectedUser = users?.find(u => u.user_id === selectedUserId);

  const handleCreateCustomer = () => {
    if (!newCustomerName.trim()) return;
    createCustomer.mutate({ name: newCustomerName.trim(), contact_email: newCustomerEmail || undefined }, {
      onSuccess: () => { setNewCustomerOpen(false); setNewCustomerName(''); setNewCustomerEmail(''); }
    });
  };

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail.trim(), display_name: inviteName.trim() || undefined, role: inviteRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || 'Gebruiker uitgenodigd');
      setInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('user');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e: any) {
      toast.error(`Fout: ${e.message}`);
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <AppLayout title="Gebruikersbeheer" subtitle="Beheer gebruikers, rollen, modules en klanten">
      <div className="flex gap-6 h-[calc(100vh-10rem)]">
        {/* Users table */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-border bg-card h-full flex flex-col">
            <div className="border-b border-border px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Gebruikers</h2>
                  <p className="text-xs text-muted-foreground">{users?.length || 0} gebruikers</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <UserPlus className="h-3.5 w-3.5" />
                      Uitnodigen
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Gebruiker uitnodigen</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">E-mailadres *</Label>
                        <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="gebruiker@bedrijf.nl" type="email" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Naam</Label>
                        <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Volledige naam" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rol</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleInviteUser} disabled={!inviteEmail.trim() || inviteLoading} className="w-full gap-2">
                        {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                        {inviteLoading ? 'Bezig...' : 'Uitnodigen'}
                      </Button>
                      <p className="text-[11px] text-muted-foreground">De gebruiker wordt aangemaakt en ontvangt een wachtwoord-reset link om een eigen wachtwoord in te stellen.</p>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      <Plus className="h-3 w-3" />
                      Klant
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nieuwe klant aanmaken</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Naam</Label>
                        <Input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Bedrijfsnaam" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Contact e-mail</Label>
                        <Input value={newCustomerEmail} onChange={e => setNewCustomerEmail(e.target.value)} placeholder="info@bedrijf.nl" />
                      </div>
                      <Button onClick={handleCreateCustomer} disabled={!newCustomerName.trim()} className="w-full">Aanmaken</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gebruiker</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Klant</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Laden...</TableCell></TableRow>
                  ) : users?.map(user => {
                    const roleInfo = ROLES.find(r => r.value === user.role) || ROLES[3];
                    return (
                      <TableRow
                        key={user.user_id}
                        className={cn('cursor-pointer', selectedUserId === user.user_id && 'bg-primary/5')}
                        onClick={() => setSelectedUserId(user.user_id)}
                      >
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-foreground">{user.display_name || '—'}</p>
                            <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn('text-[10px] font-semibold', roleInfo.color)}>
                            {roleInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{user.customer_name || '—'}</span>
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
        {selectedUser ? (
          <UserDetailPanel
            user={selectedUser}
            customers={customers || []}
            onClose={() => setSelectedUserId(null)}
            onUpdateRole={(role) => updateRole.mutate({ userId: selectedUser.user_id, role })}
            onUpdateCustomer={(customerId) => updateCustomer.mutate({ profileId: selectedUser.id, customerId })}
          />
        ) : (
          <div className="w-96 shrink-0 rounded-xl border border-border bg-card flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Selecteer een gebruiker</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

interface UserDetailPanelProps {
  user: ReturnType<typeof useUsers>['data'] extends (infer T)[] | undefined ? T : never;
  customers: { id: string; name: string }[];
  onClose: () => void;
  onUpdateRole: (role: string) => void;
  onUpdateCustomer: (customerId: string | null) => void;
}

const UserDetailPanel = ({ user, customers, onClose, onUpdateRole, onUpdateCustomer }: UserDetailPanelProps) => {
  const { data: permissions } = useModulePermissions(user.user_id);
  const upsertPermission = useUpsertModulePermission();

  const permissionMap = new Map(permissions?.map(p => [p.module_path, p.enabled]) || []);

  const isModuleEnabled = (path: string) => {
    return permissionMap.has(path) ? permissionMap.get(path)! : true; // default enabled
  };

  return (
    <div className="w-96 shrink-0 rounded-xl border border-border bg-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{user.display_name || user.email}</h3>
          <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Role */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rol</Label>
          </div>
          <Select value={user.role} onValueChange={onUpdateRole}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Customer */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Klant</Label>
          </div>
          <Select value={user.customer_id || '__none__'} onValueChange={v => onUpdateCustomer(v === '__none__' ? null : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Geen klant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Geen klant</SelectItem>
              {customers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Module permissions */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-primary" />
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modules</Label>
          </div>
          <div className="space-y-1">
            {ALL_MODULES.map(mod => (
              <div key={mod.path} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                <span className="text-sm text-foreground">{mod.label}</span>
                <Switch
                  checked={isModuleEnabled(mod.path)}
                  onCheckedChange={(checked) => upsertPermission.mutate({
                    userId: user.user_id,
                    modulePath: mod.path,
                    enabled: checked,
                  })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Gebruikers;
