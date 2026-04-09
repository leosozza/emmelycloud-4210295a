-- ─────────────────────────────────────────────────────────────────────────────
-- AI Sessions Runtime Table
-- Inspirado no session_store.py do Claw Code:
-- Persistência explícita de sessões de IA com budget de tokens,
-- histórico de eventos auditáveis e resultado do último turno.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_sessions (
  session_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  agent_id          UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,

  -- Configuração do engine (espelho do QueryEngineConfig do Claw)
  config            JSONB NOT NULL DEFAULT '{
    "max_turns": 50,
    "max_budget_tokens": 100000,
    "compact_after_turns": 20,
    "enable_self_eval": false,
    "enable_sentiment": true,
    "enable_memory": true
  }'::jsonb,

  -- Estado da sessão
  turn_count        INTEGER NOT NULL DEFAULT 0,
  total_usage       JSONB NOT NULL DEFAULT '{
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "aux_calls": 0,
    "estimated_cost_usd": 0
  }'::jsonb,

  -- Histórico de eventos auditáveis (espelho do HistoryLog do Claw)
  history_events    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Resultado do último turno (espelho do TurnResult do Claw)
  last_turn_result  JSONB,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ai_sessions_conversation_id
  ON public.ai_sessions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_agent_id
  ON public.ai_sessions(agent_id);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_updated_at
  ON public.ai_sessions(updated_at DESC);

-- Índice para analytics por período
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created_at
  ON public.ai_sessions(created_at DESC);

-- Índice parcial para sessões ativas (turn_count < max_turns)
-- Útil para encontrar sessões que ainda podem receber turnos
CREATE INDEX IF NOT EXISTS idx_ai_sessions_active
  ON public.ai_sessions(conversation_id, updated_at DESC)
  WHERE turn_count < 50;

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.update_ai_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_sessions_updated_at ON public.ai_sessions;
CREATE TRIGGER trg_ai_sessions_updated_at
  BEFORE UPDATE ON public.ai_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_sessions_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Função RPC para analytics de sessões por período
-- Inspirado no render_summary do Claw Code
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ai_session_analytics(
  p_start_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_end_date   TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_sessions',         COUNT(*),
    'total_turns',            SUM((total_usage->>'total_tokens')::NUMERIC),
    'total_tokens',           SUM((total_usage->>'total_tokens')::NUMERIC),
    'total_cost_usd',         SUM((total_usage->>'estimated_cost_usd')::NUMERIC),
    'avg_turns_per_session',  AVG(turn_count),
    'avg_tokens_per_session', AVG((total_usage->>'total_tokens')::NUMERIC),
    'period_start',           p_start_date,
    'period_end',             p_end_date
  )
  INTO v_result
  FROM public.ai_sessions
  WHERE created_at BETWEEN p_start_date AND p_end_date;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Função RPC para limpeza de sessões antigas (> 90 dias)
-- Manutenção automática da tabela
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_ai_sessions(
  p_older_than_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.ai_sessions
  WHERE updated_at < now() - (p_older_than_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Comentários para documentação
COMMENT ON TABLE public.ai_sessions IS
  'Sessões de IA persistidas — inspirado no session_store.py do Claw Code. '
  'Cada conversa pode ter múltiplas sessões (uma por agente ou reinício). '
  'Armazena budget de tokens, histórico de eventos auditáveis e resultado do último turno.';

COMMENT ON COLUMN public.ai_sessions.config IS
  'Configuração do engine de sessão: max_turns, max_budget_tokens, compact_after_turns, '
  'enable_self_eval, enable_sentiment, enable_memory.';

COMMENT ON COLUMN public.ai_sessions.history_events IS
  'Log auditável de eventos da sessão (espelho do HistoryLog do Claw Code). '
  'Cada evento tem: title, detail, timestamp.';

COMMENT ON COLUMN public.ai_sessions.last_turn_result IS
  'Resultado do último turno (espelho do TurnResult do Claw Code). '
  'Inclui: stop_reason, matched_tools, denied_tools, usage, latency_ms.';
