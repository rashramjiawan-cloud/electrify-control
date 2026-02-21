
-- Firmware updates tracking table
CREATE TABLE public.firmware_updates (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'Firmware', -- 'Firmware' or 'Diagnostics'
  location TEXT NOT NULL, -- URL for firmware download or diagnostics upload
  status TEXT NOT NULL DEFAULT 'Pending', -- Pending, Downloading, Downloaded, Installing, Installed, InstallationFailed, DownloadFailed, Idle, Uploading, Uploaded, UploadFailed
  retrieve_date TIMESTAMP WITH TIME ZONE,
  retries INTEGER DEFAULT 0,
  retry_interval INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.firmware_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read firmware updates"
  ON public.firmware_updates FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert firmware updates"
  ON public.firmware_updates FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can update firmware updates"
  ON public.firmware_updates FOR UPDATE USING (true);

CREATE POLICY "Authenticated can delete firmware updates"
  ON public.firmware_updates FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_firmware_updates_updated_at
  BEFORE UPDATE ON public.firmware_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
