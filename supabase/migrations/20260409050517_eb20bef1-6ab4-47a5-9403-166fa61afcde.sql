CREATE TABLE IF NOT EXISTS public.ai_sessions (
  session_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  agent_id          UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'error', 'timeout')),
  turn_count        INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  total_cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  avg_latency_ms    NUMERIC(10,2) DEFAULT NULL,
  session_metadata  JSONB DEFAULT '{}',
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_conversation_id
  ON public.ai_sessions(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_agent_id
  ON public.ai_sessions(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_active
  ON public.ai_sessions(status, last_activity_at DESC)
  WHERE status = 'active';

ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai_sessions"
  ON public.ai_sessions FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role full access ai_sessions"
  ON public.ai_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_ai_session_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_sessions_updated_at ON public.ai_sessions;
CREATE TRIGGER trg_ai_sessions_updated_at
  BEFORE UPDATE ON public.ai_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_session_timestamp();

CREATE OR REPLACE FUNCTION public.timeout_inactive_sessions(
  p_timeout_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.ai_sessions
  SET status = 'timeout', completed_at = now()
  WHERE status = 'active'
    AND last_activity_at < now() - (p_timeout_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;