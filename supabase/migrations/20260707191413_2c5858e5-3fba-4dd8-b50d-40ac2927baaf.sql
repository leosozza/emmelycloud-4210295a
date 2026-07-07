ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS header jsonb,
  ADD COLUMN IF NOT EXISTS cards jsonb;