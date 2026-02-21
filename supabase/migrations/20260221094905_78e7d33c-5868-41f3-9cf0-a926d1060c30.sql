
-- Virtual Grids: groepeer energiebronnen tot één logische grid
CREATE TABLE public.virtual_grids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  gtv_limit_kw NUMERIC NOT NULL DEFAULT 0,
  balancing_strategy TEXT NOT NULL DEFAULT 'proportional',
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Members: apparaten die deel uitmaken van een virtual grid
CREATE TABLE public.virtual_grid_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grid_id UUID NOT NULL REFERENCES public.virtual_grids(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL, -- 'battery', 'energy_meter', 'charge_point', 'solar'
  member_id TEXT NOT NULL, -- references charge_points.id or energy_meters.id (uuid cast to text)
  member_name TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  max_power_kw NUMERIC DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(grid_id, member_type, member_id)
);

-- Enable RLS
ALTER TABLE public.virtual_grids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_grid_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for virtual_grids
CREATE POLICY "Authenticated can read virtual grids" ON public.virtual_grids FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert virtual grids" ON public.virtual_grids FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update virtual grids" ON public.virtual_grids FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete virtual grids" ON public.virtual_grids FOR DELETE USING (true);

-- RLS policies for virtual_grid_members
CREATE POLICY "Authenticated can read grid members" ON public.virtual_grid_members FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert grid members" ON public.virtual_grid_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update grid members" ON public.virtual_grid_members FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete grid members" ON public.virtual_grid_members FOR DELETE USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_virtual_grids_updated_at BEFORE UPDATE ON public.virtual_grids FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_virtual_grid_members_updated_at BEFORE UPDATE ON public.virtual_grid_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.virtual_grids;
ALTER PUBLICATION supabase_realtime ADD TABLE public.virtual_grid_members;
