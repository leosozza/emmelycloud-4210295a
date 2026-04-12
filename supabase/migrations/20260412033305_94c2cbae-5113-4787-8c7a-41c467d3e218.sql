
-- 1. Simulations table
CREATE TABLE public.simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  scenario_prompt TEXT NOT NULL DEFAULT '',
  persona_ids UUID[] NOT NULL DEFAULT '{}',
  rounds INTEGER NOT NULL DEFAULT 5,
  results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access simulations" ON public.simulations FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated can read simulations" ON public.simulations FOR SELECT TO authenticated
  USING (true);

-- 2. Simulation messages table
CREATE TABLE public.simulation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  round INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.simulation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access simulation_messages" ON public.simulation_messages FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated can read simulation_messages" ON public.simulation_messages FOR SELECT TO authenticated
  USING (true);

-- 3. Swarm reports table
CREATE TABLE public.swarm_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'daily_summary',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  data_snapshot JSONB DEFAULT '{}'::jsonb,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.swarm_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access swarm_reports" ON public.swarm_reports FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated can read swarm_reports" ON public.swarm_reports FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access swarm_reports" ON public.swarm_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access simulations" ON public.simulations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access simulation_messages" ON public.simulation_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. Temporal memory columns on user_memory
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decay_factor NUMERIC NOT NULL DEFAULT 1.0;

-- 5. Memory relevance function
CREATE OR REPLACE FUNCTION public.calculate_memory_relevance(p_memory_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decay NUMERIC;
  v_updated TIMESTAMPTZ;
  v_recency NUMERIC;
BEGIN
  SELECT decay_factor, updated_at INTO v_decay, v_updated
  FROM public.user_memory WHERE id = p_memory_id;

  IF v_decay IS NULL THEN RETURN 0; END IF;

  -- recency bonus: 1.0 for today, decays by 0.01 per day
  v_recency := GREATEST(0.1, 1.0 - (EXTRACT(EPOCH FROM (now() - COALESCE(v_updated, now()))) / 86400.0 * 0.01));

  RETURN ROUND(v_decay * v_recency, 4);
END;
$$;

-- 6. Enable realtime for simulation_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.simulation_messages;
