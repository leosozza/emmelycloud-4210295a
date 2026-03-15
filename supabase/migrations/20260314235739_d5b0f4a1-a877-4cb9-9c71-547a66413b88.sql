
-- Create import-files storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('import-files', 'import-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload/read/delete their files
CREATE POLICY "Authenticated can upload import files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'import-files');

CREATE POLICY "Authenticated can read import files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'import-files');

CREATE POLICY "Authenticated can delete import files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'import-files');

CREATE POLICY "Service role full access import files"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'import-files')
WITH CHECK (bucket_id = 'import-files');

-- Create import_sessions table
CREATE TABLE public.import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phase text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  file_path text,
  total_items integer DEFAULT 0,
  processed_items integer DEFAULT 0,
  logs jsonb DEFAULT '[]'::jsonb,
  filter_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own import sessions"
ON public.import_sessions FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access import_sessions"
ON public.import_sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);
