ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.ai_sessions(session_id) ON DELETE SET NULL;

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS monthly_budget_usd NUMERIC(10,4) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_session_id
  ON public.ai_usage_logs(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_agent_month
  ON public.ai_usage_logs(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model
  ON public.ai_usage_logs(model, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_monthly_cost_by_agent(
  p_agent_id UUID,
  p_month    DATE DEFAULT date_trunc('month', now())::DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'agent_id',           p_agent_id,
    'month',              p_month,
    'total_calls',        COUNT(*),
    'total_tokens',       SUM(total_tokens),
    'prompt_tokens',      SUM(prompt_tokens),
    'completion_tokens',  SUM(completion_tokens),
    'cost_usd',           SUM(cost_estimate),
    'avg_latency_ms',     AVG(latency_ms),
    'fallback_count',     COUNT(*) FILTER (WHERE was_fallback = true),
    'error_count',        COUNT(*) FILTER (WHERE error IS NOT NULL)
  )
  INTO v_result
  FROM public.ai_usage_logs
  WHERE agent_id = p_agent_id
    AND created_at >= p_month
    AND created_at < p_month + INTERVAL '1 month';

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;