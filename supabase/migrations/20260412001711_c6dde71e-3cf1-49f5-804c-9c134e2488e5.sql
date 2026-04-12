
-- 1. Agent Skills table
CREATE TABLE public.agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  skill_type TEXT NOT NULL,
  skill_config JSONB DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access agent_skills"
  ON public.agent_skills FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated can read agent_skills"
  ON public.agent_skills FOR SELECT
  USING (true);

-- 2. Agent Heartbeats table
CREATE TABLE public.agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL DEFAULT '0 9 * * 1-5',
  action_type TEXT NOT NULL,
  action_config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access agent_heartbeats"
  ON public.agent_heartbeats FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated can read agent_heartbeats"
  ON public.agent_heartbeats FOR SELECT
  TO authenticated
  USING (true);

-- 3. Flow Execution Logs table
CREATE TABLE public.flow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.flows(id) ON DELETE SET NULL,
  conversation_id UUID,
  trigger_type TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  node_results JSONB DEFAULT '[]'::jsonb,
  variables JSONB DEFAULT '{}'::jsonb,
  error TEXT
);

ALTER TABLE public.flow_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read flow_execution_logs"
  ON public.flow_execution_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role full access flow_execution_logs"
  ON public.flow_execution_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_flow_execution_logs_flow_id ON public.flow_execution_logs(flow_id);
CREATE INDEX idx_flow_execution_logs_status ON public.flow_execution_logs(status);

-- 4. Add governance_mode to ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN governance_mode TEXT NOT NULL DEFAULT 'autonomous';
