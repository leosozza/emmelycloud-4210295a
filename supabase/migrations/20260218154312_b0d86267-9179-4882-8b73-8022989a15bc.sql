
-- Table to store integration credentials (API keys, tokens, etc.)
CREATE TABLE public.integration_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,        -- e.g. 'callbell', 'meta', 'whatsapp_direct'
  credential_key text NOT NULL,  -- e.g. 'CALLBELL_API_TOKEN', 'META_PAGE_ACCESS_TOKEN'
  credential_value text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(provider, credential_key)
);

-- Enable RLS
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can manage credentials
CREATE POLICY "Admins full access integration_credentials"
ON public.integration_credentials
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_integration_credentials_updated_at
BEFORE UPDATE ON public.integration_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
