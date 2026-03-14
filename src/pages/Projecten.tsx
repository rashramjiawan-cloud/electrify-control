import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject, useProjectTasks, useCreateTask, useToggleTask, useDeleteTask, useProjectNotes, useCreateNote, useDeleteNote } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, FolderKanban, ClipboardList, CalendarDays, MessageSquare, X, Send, CheckCircle2, Clock, Pause, XCircle, Wrench, Settings2, Layers, FileUp, FileText, Download, Loader2, LayoutList, GanttChart } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import ProjectGanttChart from '@/components/ProjectGanttChart';

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  planned: { label: 'Gepland', color: 'bg-muted text-muted-foreground', icon: Clock },
  in_progress: { label: 'In uitvoering', color: 'bg-primary/10 text-primary', icon: Settings2 },
  on_hold: { label: 'On hold', color: 'bg-chart-2/10 text-chart-2', icon: Pause },
  completed: { label: 'Afgerond', color: 'bg-green-500/10 text-green-600 dark:text-green-400', icon: CheckCircle2 },
  cancelled: { label: 'Geannuleerd', color: 'bg-destructive/10 text-destructive', icon: XCircle },
};

const TYPE_MAP: Record<string, { label: string; icon: React.ElementType }> = {
  installation: { label: 'Installatie', icon: Wrench },
  service: { label: 'Service', icon: Settings2 },
  general: { label: 'Algemeen', icon: Layers },
};

const Projecten = () => {
  const { isAdmin, user } = useAuth();
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');

  // Form state
  const [form, setForm] = useState({ title: '', description: '', project_type: 'general', customer_id: '', start_date: '', due_date: '' });

  // Customers for admin dropdown
  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name').order('name');
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterType !== 'all' && p.project_type !== filterType) return false;
      return true;
    });
  }, [projects, filterStatus, filterType]);

  const stats = useMemo(() => {
    if (!projects) return { total: 0, active: 0, completed: 0, avgProgress: 0 };
    const active = projects.filter(p => p.status === 'in_progress').length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const avgProgress = projects.length ? Math.round(projects.reduce((s, p) => s + p.progress_pct, 0) / projects.length) : 0;
    return { total: projects.length, active, completed, avgProgress };
  }, [projects]);

  const handleCreate = async () => {
    if (!form.title || !form.customer_id) { toast.error('Vul titel en klant in'); return; }
    try {
      await createProject.mutateAsync({
        title: form.title,
        description: form.description || null,
        project_type: form.project_type,
        customer_id: form.customer_id,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
      } as any);
      toast.success('Project aangemaakt');
      setDialogOpen(false);
      setForm({ title: '', description: '', project_type: 'general', customer_id: '', start_date: '', due_date: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updateProject.mutateAsync({ id, status, completed_at: status === 'completed' ? new Date().toISOString() : null } as any);
    toast.success('Status bijgewerkt');
  };

  const handleProgressChange = async (id: string, progress_pct: number) => {
    await updateProject.mutateAsync({ id, progress_pct } as any);
  };

  const selected = projects?.find(p => p.id === selectedProject);

  return (
    <AppLayout title="Projecten" subtitle="Projectvoortgang en overzicht per klant">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Totaal</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-primary">{stats.active}</p><p className="text-xs text-muted-foreground">Actief</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</p><p className="text-xs text-muted-foreground">Afgerond</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-foreground">{stats.avgProgress}%</p><p className="text-xs text-muted-foreground">Gem. voortgang</p></CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle types</SelectItem>
            {Object.entries(TYPE_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {isAdmin && (
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nieuw project
          </Button>
        )}
      </div>

      {/* Project list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Laden...</p>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><FolderKanban className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" /><p className="text-sm text-muted-foreground">Geen projecten gevonden</p></CardContent></Card>
          ) : filtered.map(project => {
            const st = STATUS_MAP[project.status] || STATUS_MAP.planned;
            const tp = TYPE_MAP[project.project_type] || TYPE_MAP.general;
            const StIcon = st.icon;
            const TpIcon = tp.icon;
            return (
              <Card
                key={project.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedProject === project.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedProject(project.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">{project.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(project as any).customers?.name || 'Onbekende klant'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${st.color}`}>
                        <StIcon className="h-3 w-3" />{st.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <TpIcon className="h-3 w-3" />{tp.label}
                      </Badge>
                    </div>
                  </div>
                  {project.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                  )}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Progress value={project.progress_pct} className="h-2" />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-10 text-right">{project.progress_pct}%</span>
                  </div>
                  {(project.start_date || project.due_date) && (
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {project.start_date && <span>{format(new Date(project.start_date), 'd MMM yyyy', { locale: nl })}</span>}
                      {project.start_date && project.due_date && <span>→</span>}
                      {project.due_date && <span>{format(new Date(project.due_date), 'd MMM yyyy', { locale: nl })}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="space-y-4">
          {selected ? (
            <ProjectDetailPanel
              project={selected}
              isAdmin={isAdmin}
              user={user}
              onStatusChange={handleStatusChange}
              onProgressChange={handleProgressChange}
              onDelete={async () => {
                await deleteProject.mutateAsync(selected.id);
                setSelectedProject(null);
                toast.success('Project verwijderd');
              }}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Selecteer een project voor details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nieuw project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Klant</Label>
              <Select value={form.customer_id} onValueChange={v => setForm(f => ({ ...f, customer_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecteer klant" /></SelectTrigger>
                <SelectContent>
                  {customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Titel</Label>
              <Input className="mt-1" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Projectnaam" />
            </div>
            <div>
              <Label className="text-xs">Beschrijving</Label>
              <Textarea className="mt-1" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.project_type} onValueChange={v => setForm(f => ({ ...f, project_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Startdatum</Label>
                <Input className="mt-1" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Deadline</Label>
                <Input className="mt-1" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleCreate} disabled={createProject.isPending}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

// Detail panel component
function ProjectDetailPanel({ project, isAdmin, user, onStatusChange, onProgressChange, onDelete }: {
  project: any;
  isAdmin: boolean;
  user: any;
  onStatusChange: (id: string, status: string) => void;
  onProgressChange: (id: string, pct: number) => void;
  onDelete: () => void;
}) {
  const { data: tasks } = useProjectTasks(project.id);
  const { data: notes } = useProjectNotes(project.id);
  const createTask = useCreateTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  const [newTask, setNewTask] = useState('');
  const [newNote, setNewNote] = useState('');

  const completedTasks = tasks?.filter(t => t.completed).length || 0;
  const totalTasks = tasks?.length || 0;

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    await createTask.mutateAsync({ project_id: project.id, title: newTask.trim(), sort_order: totalTasks });
    setNewTask('');
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await createNote.mutateAsync({
      project_id: project.id,
      content: newNote.trim(),
      author_name: user?.email?.split('@')[0] || 'Onbekend',
      author_id: user?.id,
    });
    setNewNote('');
  };

  const st = STATUS_MAP[project.status] || STATUS_MAP.planned;

  return (
    <>
      {/* Status & progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            {project.title}
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{(project as any).customers?.name}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin && (
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={project.status} onValueChange={v => onStatusChange(project.id, v)}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {!isAdmin && (
            <Badge className={`${st.color} text-xs`}>{st.label}</Badge>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Voortgang</Label>
              <span className="text-xs font-mono text-muted-foreground">{project.progress_pct}%</span>
            </div>
            {isAdmin ? (
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={project.progress_pct}
                onChange={e => onProgressChange(project.id, Number(e.target.value))}
                className="w-full h-2 accent-primary"
              />
            ) : (
              <Progress value={project.progress_pct} className="h-2" />
            )}
          </div>
          {project.description && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">{project.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5" />
            Taken ({completedTasks}/{totalTasks})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks?.map(task => (
            <div key={task.id} className="flex items-center gap-2 group">
              <Checkbox
                checked={task.completed}
                disabled={!isAdmin}
                onCheckedChange={checked => toggleTask.mutate({ id: task.id, completed: !!checked, project_id: project.id })}
              />
              <span className={`text-xs flex-1 ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                {task.title}
              </span>
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteTask.mutate({ id: task.id, project_id: project.id })}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          {isAdmin && (
            <div className="flex gap-2 pt-1">
              <Input
                className="h-7 text-xs"
                placeholder="Nieuwe taak..."
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTask()}
              />
              <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleAddTask} disabled={!newTask.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            Notities ({notes?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notes?.map(note => (
            <div key={note.id} className="rounded-lg bg-muted/30 p-3 group relative">
              <p className="text-xs text-foreground whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground">
                  {note.author_name} · {format(new Date(note.created_at), 'd MMM HH:mm', { locale: nl })}
                </span>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => deleteNote.mutate({ id: note.id, project_id: project.id })}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {isAdmin && (
            <div className="flex gap-2">
              <Input
                className="h-7 text-xs"
                placeholder="Notitie toevoegen..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              />
              <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleAddNote} disabled={!newNote.trim()}>
                <Send className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <ProjectDocuments projectId={project.id} isAdmin={isAdmin} />
    </>
  );
}

// Documents component
function ProjectDocuments({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [uploading, setUploading] = useState(false);
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const { data: files, refetch } = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('project-documents')
        .list(projectId, { sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      return (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${projectId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('project-documents').upload(path, file);
      if (error) throw error;
      toast.success('Document geüpload');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Upload mislukt');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (fileName: string) => {
    const { data, error } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(`${projectId}/${fileName}`, 60);
    if (error || !data?.signedUrl) { toast.error('Download mislukt'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (fileName: string) => {
    const { error } = await supabase.storage
      .from('project-documents')
      .remove([`${projectId}/${fileName}`]);
    if (error) { toast.error('Verwijderen mislukt'); return; }
    toast.success('Document verwijderd');
    refetch();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDisplayName = (name: string) => {
    // Remove timestamp prefix
    const match = name.match(/^\d+_(.+)$/);
    return match ? match[1] : name;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          Documenten ({files?.length || 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {files?.map(file => (
          <div key={file.name} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 group">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{getDisplayName(file.name)}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatSize(file.metadata?.size || 0)}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100" onClick={() => handleDownload(file.name)}>
              <Download className="h-3 w-3" />
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => handleDelete(file.name)}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
        {isAdmin && (
          <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <FileUp className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">{uploading ? 'Uploaden...' : 'Document uploaden'}</span>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </CardContent>
    </Card>
  );
}

export default Projecten;
