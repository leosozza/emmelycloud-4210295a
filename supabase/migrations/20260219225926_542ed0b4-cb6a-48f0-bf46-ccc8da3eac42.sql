
CREATE TABLE IF NOT EXISTS public.chatbot_channel_settings (
  channel    TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  agent_id   UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.chatbot_channel_settings (channel, enabled)
VALUES ('whatsapp', false), ('instagram', false)
ON CONFLICT (channel) DO NOTHING;

ALTER TABLE public.chatbot_channel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access chatbot_channel_settings"
  ON public.chatbot_channel_settings
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Authenticated can read chatbot_channel_settings"
  ON public.chatbot_channel_settings
  FOR SELECT
  USING (true);

NOTIFY pgrst, 'reload schema';
