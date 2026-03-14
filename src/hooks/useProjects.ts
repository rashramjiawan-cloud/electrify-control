import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Project {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  project_type: string;
  status: string;
  progress_pct: number;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  customers?: { name: string } | null;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  content: string;
  author_name: string | null;
  author_id: string | null;
  created_at: string;
}

export function useProjects(customerId?: string) {
  return useQuery({
    queryKey: ['projects', customerId],
    queryFn: async () => {
      let q = supabase
        .from('projects')
        .select('*, customers(name)')
        .order('created_at', { ascending: false });
      if (customerId) q = q.eq('customer_id', customerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Project[];
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (project: Partial<Project>) => {
      const { data, error } = await supabase.from('projects').insert(project as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Project>) => {
      const { error } = await supabase.from('projects').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// Tasks
export function useProjectTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-tasks', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('project_id', projectId!)
        .order('sort_order');
      if (error) throw error;
      return data as ProjectTask[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: { project_id: string; title: string; sort_order?: number }) => {
      const { data, error } = await supabase.from('project_tasks').insert(task).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['project-tasks', v.project_id] }),
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, completed, project_id }: { id: string; completed: boolean; project_id: string }) => {
      const { error } = await supabase.from('project_tasks').update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      }).eq('id', id);
      if (error) throw error;
      return project_id;
    },
    onSuccess: (pid) => qc.invalidateQueries({ queryKey: ['project-tasks', pid] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id }: { id: string; project_id: string }) => {
      const { error } = await supabase.from('project_tasks').delete().eq('id', id);
      if (error) throw error;
      return project_id;
    },
    onSuccess: (pid) => qc.invalidateQueries({ queryKey: ['project-tasks', pid] }),
  });
}

// Notes
export function useProjectNotes(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-notes', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_notes')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProjectNote[];
    },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: { project_id: string; content: string; author_name?: string; author_id?: string }) => {
      const { data, error } = await supabase.from('project_notes').insert(note).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['project-notes', v.project_id] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id }: { id: string; project_id: string }) => {
      const { error } = await supabase.from('project_notes').delete().eq('id', id);
      if (error) throw error;
      return project_id;
    },
    onSuccess: (pid) => qc.invalidateQueries({ queryKey: ['project-notes', pid] }),
  });
}
