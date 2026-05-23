CREATE TABLE public.openclaw_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  agent_endpoint TEXT NOT NULL,
  auth_header_name TEXT NOT NULL DEFAULT 'Authorization',
  auth_token TEXT,
  payload_template JSONB NOT NULL DEFAULT '{"message":"{{message}}","conversation_id":"{{conversation_id}}","contact":"{{contact}}"}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.openclaw_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage openclaw_integrations"
ON public.openclaw_integrations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_openclaw_integrations_updated_at
BEFORE UPDATE ON public.openclaw_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();