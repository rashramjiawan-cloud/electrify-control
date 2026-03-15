
CREATE TABLE public.firmware_file_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL UNIQUE,
  label text,
  notes text,
  assigned_charge_point_id text REFERENCES public.charge_points(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firmware_file_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read firmware metadata"
  ON public.firmware_file_metadata FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert firmware metadata"
  ON public.firmware_file_metadata FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update firmware metadata"
  ON public.firmware_file_metadata FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated can delete firmware metadata"
  ON public.firmware_file_metadata FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER update_firmware_file_metadata_updated_at
  BEFORE UPDATE ON public.firmware_file_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
