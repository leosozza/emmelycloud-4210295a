-- ─────────────────────────────────────────────────────────────────────────────
-- Cost Tracker — Colunas adicionais
-- Inspirado no cost_tracker.py do Claw Code
-- ─────────────────────────────────────────────────────────────────────────────

-- Adicionar session_id ao ai_usage_logs para rastreamento por sessão
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.ai_sessions(session_id) ON DELETE SET NULL;

-- Adicionar budget mensal ao ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS monthly_budget_usd NUMERIC(10,4) DEFAULT NULL;

-- Índice para consultas de custo por sessão
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_session_id
  ON public.ai_usage_logs(session_id)
  WHERE session_id IS NOT NULL;

-- Índice para relatórios mensais por agente
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_agent_month
  ON public.ai_usage_logs(agent_id, created_at DESC);

-- Índice para relatórios por modelo
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model
  ON public.ai_usage_logs(model, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Função RPC para custo mensal por agente (usada pelo cost tracker)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_monthly_cost_by_agent(
  p_agent_id UUID,
  p_month    DATE DEFAULT date_trunc('month', now())::DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

COMMENT ON COLUMN public.ai_usage_logs.session_id IS
  'Referência à sessão de IA (ai_sessions) — permite rastrear custo total por sessão.';

COMMENT ON COLUMN public.ai_agents.monthly_budget_usd IS
  'Budget mensal em USD para este agente. Quando atingido, emite alerta no cost tracker.';
