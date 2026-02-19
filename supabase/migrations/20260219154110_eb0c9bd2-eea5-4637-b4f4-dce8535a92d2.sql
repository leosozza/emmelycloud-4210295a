
ALTER TABLE public.bitrix24_integrations
ADD COLUMN IF NOT EXISTS bitrix_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;
