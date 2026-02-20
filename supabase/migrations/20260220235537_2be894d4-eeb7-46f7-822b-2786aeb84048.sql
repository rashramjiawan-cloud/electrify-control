-- Table for authorized RFID tags
CREATE TABLE public.authorized_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tag text NOT NULL UNIQUE,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  expiry_date timestamp with time zone,
  charge_point_ids text[] DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.authorized_tags ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read, admins can manage
CREATE POLICY "Authenticated can read tags"
ON public.authorized_tags FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert tags"
ON public.authorized_tags FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can update tags"
ON public.authorized_tags FOR UPDATE USING (true);

CREATE POLICY "Authenticated can delete tags"
ON public.authorized_tags FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.authorized_tags;

-- Add updated_at trigger
CREATE TRIGGER update_authorized_tags_updated_at
BEFORE UPDATE ON public.authorized_tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();