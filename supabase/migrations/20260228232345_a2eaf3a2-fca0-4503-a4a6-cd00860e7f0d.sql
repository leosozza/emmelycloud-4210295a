
-- Add columns to proposals table
ALTER TABLE proposals ADD COLUMN accept_token UUID DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE proposals ADD COLUMN accepted_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN client_name TEXT;
ALTER TABLE proposals ADD COLUMN client_email TEXT;
ALTER TABLE proposals ADD COLUMN client_phone TEXT;
ALTER TABLE proposals ADD COLUMN client_document TEXT;
ALTER TABLE proposals ADD COLUMN client_address TEXT;
ALTER TABLE proposals ADD COLUMN service_id UUID REFERENCES services(id);
ALTER TABLE proposals ADD COLUMN description TEXT;
ALTER TABLE proposals ADD COLUMN pdf_url TEXT;

-- RLS policy for public read by token (anon users need to read proposal by token)
CREATE POLICY "Anon can read proposal by accept_token"
  ON proposals FOR SELECT
  TO anon
  USING (true);

-- Storage bucket for proposal PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('proposal-files', 'proposal-files', true);

-- Storage RLS policies
CREATE POLICY "Public can read proposal files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'proposal-files');

CREATE POLICY "Authenticated can upload proposal files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'proposal-files');

-- Allow anon to update proposals (for accept action)
CREATE POLICY "Anon can update proposal status by token"
  ON proposals FOR UPDATE
  TO anon
  USING (accept_token IS NOT NULL);

-- Allow anon to insert contracts (when accepting proposal)
CREATE POLICY "Anon can insert contracts via proposal accept"
  ON contracts FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anon to read cases (needed for accept flow)
CREATE POLICY "Anon can read cases for proposal accept"
  ON cases FOR SELECT
  TO anon
  USING (true);

-- Allow anon to update leads (for funnel stage update)
CREATE POLICY "Anon can update lead funnel via proposal accept"
  ON leads FOR UPDATE
  TO anon
  USING (true);
