
-- Add flow_type and trigger_config to flows
ALTER TABLE public.flows ADD COLUMN IF NOT EXISTS flow_type text NOT NULL DEFAULT 'hybrid';
ALTER TABLE public.flows ADD COLUMN IF NOT EXISTS trigger_config jsonb DEFAULT '{}'::jsonb;

-- Add training/sub-agent fields to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS training_collection_ids text[] DEFAULT '{}'::text[];
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS sub_agent_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS routing_rules jsonb DEFAULT '{}'::jsonb;
