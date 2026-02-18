
-- Table: bitrix24_integrations
CREATE TABLE public.bitrix24_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE,
  domain TEXT,
  client_endpoint TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  application_token TEXT,
  connector_registered BOOLEAN NOT NULL DEFAULT false,
  connector_active BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bitrix24_integrations ENABLE ROW LEVEL SECURITY;

-- Only service_role (edge functions) access this table
CREATE POLICY "Service role full access bitrix24_integrations"
  ON public.bitrix24_integrations FOR ALL
  USING (true) WITH CHECK (true);

-- Admins can read for the frontend config page
CREATE POLICY "Admins can read bitrix24_integrations"
  ON public.bitrix24_integrations FOR SELECT
  USING (is_admin());

CREATE TRIGGER update_bitrix24_integrations_updated_at
  BEFORE UPDATE ON public.bitrix24_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: bitrix24_channel_mappings
CREATE TABLE public.bitrix24_channel_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.bitrix24_integrations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  line_id INTEGER,
  line_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bitrix24_channel_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access bitrix24_channel_mappings"
  ON public.bitrix24_channel_mappings FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Admins can read bitrix24_channel_mappings"
  ON public.bitrix24_channel_mappings FOR SELECT
  USING (is_admin());

CREATE TRIGGER update_bitrix24_channel_mappings_updated_at
  BEFORE UPDATE ON public.bitrix24_channel_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: bitrix24_debug_logs
CREATE TABLE public.bitrix24_debug_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID REFERENCES public.bitrix24_integrations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  direction TEXT, -- inbound, outbound
  payload JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bitrix24_debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access bitrix24_debug_logs"
  ON public.bitrix24_debug_logs FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Admins can read bitrix24_debug_logs"
  ON public.bitrix24_debug_logs FOR SELECT
  USING (is_admin());

-- Index for quick lookups
CREATE INDEX idx_bitrix24_debug_logs_created_at ON public.bitrix24_debug_logs(created_at DESC);
CREATE INDEX idx_bitrix24_debug_logs_integration_id ON public.bitrix24_debug_logs(integration_id);
