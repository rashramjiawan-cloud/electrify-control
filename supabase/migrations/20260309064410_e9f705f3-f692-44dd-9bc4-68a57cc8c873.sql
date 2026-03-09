
-- Create firmware storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('firmware', 'firmware', false);

-- Allow authenticated users to upload firmware files
CREATE POLICY "Authenticated users can upload firmware"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'firmware');

-- Allow authenticated users to read firmware files
CREATE POLICY "Authenticated users can read firmware"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'firmware');

-- Allow authenticated users to delete firmware files
CREATE POLICY "Authenticated users can delete firmware"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'firmware');
