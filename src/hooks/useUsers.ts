import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  customer_id: string | null;
  created_at: string;
  role: string;
  customer_name?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModulePermission {
  id: string;
  user_id: string;
  module_path: string;
  enabled: boolean;
}

export function useUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      // Get all profiles (admin policy allows this)
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (pErr) throw pErr;

      // Get all roles
      const { data: roles, error: rErr } = await supabase
        .from('user_roles')
        .select('*');
      if (rErr) throw rErr;

      // Get all customers
      const { data: customers, error: cErr } = await supabase
        .from('customers')
        .select('*');
      if (cErr) throw cErr;

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      const customerMap = new Map(customers?.map(c => [c.id, c.name]) || []);

      return (profiles || []).map(p => ({
        ...p,
        role: roleMap.get(p.user_id) || 'user',
        customer_name: p.customer_id ? customerMap.get(p.customer_id) : null,
      })) as UserProfile[];
    },
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useModulePermissions(userId: string | null) {
  return useQuery({
    queryKey: ['module-permissions', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_module_permissions')
        .select('*')
        .eq('user_id', userId!);
      if (error) throw error;
      return data as ModulePermission[];
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role } as any)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Rol bijgewerkt');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}

export function useUpdateUserCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, customerId }: { profileId: string; customerId: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ customer_id: customerId } as any)
        .eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Klant bijgewerkt');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}

export function useUpsertModulePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, modulePath, enabled }: { userId: string; modulePath: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('user_module_permissions')
        .upsert(
          { user_id: userId, module_path: modulePath, enabled } as any,
          { onConflict: 'user_id,module_path' }
        );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['module-permissions', vars.userId] });
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; contact_email?: string }) => {
      const { error } = await supabase.from('customers').insert(data as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Klant aangemaakt');
    },
    onError: (e: any) => toast.error(`Fout: ${e.message}`),
  });
}
