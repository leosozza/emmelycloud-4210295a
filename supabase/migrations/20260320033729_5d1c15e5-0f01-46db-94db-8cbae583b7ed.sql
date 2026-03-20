ALTER TABLE public.proposal_templates
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS header_color text DEFAULT '#1e293b',
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_tagline text,
  ADD COLUMN IF NOT EXISTS layout_blocks jsonb,
  ADD COLUMN IF NOT EXISTS body_html text;