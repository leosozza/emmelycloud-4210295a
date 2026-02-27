
CREATE TABLE public.bitrix24_field_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid REFERENCES public.bitrix24_integrations(id) ON DELETE CASCADE,
  bitrix_entity text NOT NULL DEFAULT 'lead',
  bitrix_field_key text NOT NULL,
  bitrix_field_title text,
  supabase_table text NOT NULL DEFAULT 'leads',
  supabase_column text NOT NULL,
  transform_rule text DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sync_direction text NOT NULL DEFAULT 'bitrix_to_supabase',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(integration_id, bitrix_entity, bitrix_field_key, supabase_table, supabase_column)
);

ALTER TABLE public.bitrix24_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access bitrix24_field_mappings" ON public.bitrix24_field_mappings FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Service role full access bitrix24_field_mappings" ON public.bitrix24_field_mappings FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_bitrix24_field_mappings_updated_at
  BEFORE UPDATE ON public.bitrix24_field_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
