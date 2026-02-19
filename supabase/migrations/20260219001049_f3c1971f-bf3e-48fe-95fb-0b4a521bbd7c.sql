
-- Create storage bucket for knowledge documents
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-files', 'knowledge-files', false);

-- RLS: Authenticated users can upload
CREATE POLICY "Authenticated can upload knowledge files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'knowledge-files' AND auth.role() = 'authenticated');

-- RLS: Authenticated users can read
CREATE POLICY "Authenticated can read knowledge files"
ON storage.objects FOR SELECT
USING (bucket_id = 'knowledge-files' AND auth.role() = 'authenticated');

-- RLS: Admins can delete
CREATE POLICY "Admins can delete knowledge files"
ON storage.objects FOR DELETE
USING (bucket_id = 'knowledge-files' AND public.is_admin());
