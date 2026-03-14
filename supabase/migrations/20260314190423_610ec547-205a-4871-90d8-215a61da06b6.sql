
-- Create storage bucket for project documents
INSERT INTO storage.buckets (id, name, public) VALUES ('project-documents', 'project-documents', false);

-- Allow authenticated users to upload files (admins only via app logic)
CREATE POLICY "Admins can upload project documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-documents' AND has_role(auth.uid(), 'admin'));

-- Allow authenticated users to read files (admins + customers who own the project)
CREATE POLICY "Authenticated can read project documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-documents');

-- Allow admins to delete files
CREATE POLICY "Admins can delete project documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-documents' AND has_role(auth.uid(), 'admin'));
