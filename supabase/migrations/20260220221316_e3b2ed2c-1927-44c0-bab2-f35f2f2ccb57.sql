
-- Create channel_instances table to store WhatsApp and Instagram instance configs
CREATE TABLE IF NOT EXISTS public.channel_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'instagram')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.channel_instances ENABLE ROW LEVEL SECURITY;

-- Admins have full access
CREATE POLICY "Admins full access channel_instances"
ON public.channel_instances
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Authenticated can read
CREATE POLICY "Authenticated can read channel_instances"
ON public.channel_instances
FOR SELECT
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_channel_instances_updated_at
BEFORE UPDATE ON public.channel_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
