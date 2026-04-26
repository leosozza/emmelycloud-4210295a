-- Create media bucket for WhatsApp/Bitrix24 file exchanges
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read access (needed for Bitrix24 to fetch attachment URLs)
CREATE POLICY "Public read access for media bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');

-- Authenticated users (and service role) can upload
CREATE POLICY "Authenticated can upload to media bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'media' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role'));

-- Authenticated users (and service role) can update
CREATE POLICY "Authenticated can update media bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'media' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role'));

-- Authenticated users (and service role) can delete
CREATE POLICY "Authenticated can delete from media bucket"
ON storage.objects FOR DELETE
USING (bucket_id = 'media' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role'));