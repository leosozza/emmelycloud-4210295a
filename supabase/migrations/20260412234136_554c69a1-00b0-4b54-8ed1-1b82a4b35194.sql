
-- Add bitrix_bot_id column to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN bitrix_bot_id text;

-- Drop bitrix_agent_id from bitrix24_integrations (no longer needed)
ALTER TABLE public.bitrix24_integrations DROP COLUMN IF EXISTS bitrix_agent_id;
