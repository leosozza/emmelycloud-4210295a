-- Phase 2: Structured output schema for skills
ALTER TABLE public.agent_skills
ADD COLUMN IF NOT EXISTS output_schema jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS requires_confirmation boolean DEFAULT false;

-- Phase 3: Routing mode for hierarchical agent management
ALTER TABLE public.ai_agents
ADD COLUMN IF NOT EXISTS routing_mode text NOT NULL DEFAULT 'direct';

COMMENT ON COLUMN public.ai_agents.routing_mode IS 'direct = responds directly, hierarchical = acts as manager dispatching to sub-agents';
COMMENT ON COLUMN public.agent_skills.output_schema IS 'JSON Schema defining the expected structured output for this skill';
COMMENT ON COLUMN public.agent_skills.requires_confirmation IS 'When true, agent pauses and asks operator for confirmation before executing this skill';