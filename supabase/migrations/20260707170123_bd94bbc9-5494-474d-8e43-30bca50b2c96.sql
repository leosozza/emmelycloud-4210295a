
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'gupshup',
  app_id text,
  element_name text NOT NULL,
  category text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  body text NOT NULL,
  header jsonb,
  footer text,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  example jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  rejection_reason text,
  gupshup_template_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, app_id, element_name)
);

CREATE INDEX idx_whatsapp_templates_status ON public.whatsapp_templates(status);
CREATE INDEX idx_whatsapp_templates_provider ON public.whatsapp_templates(provider);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp templates"
  ON public.whatsapp_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert whatsapp templates"
  ON public.whatsapp_templates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update whatsapp templates"
  ON public.whatsapp_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete whatsapp templates"
  ON public.whatsapp_templates FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
