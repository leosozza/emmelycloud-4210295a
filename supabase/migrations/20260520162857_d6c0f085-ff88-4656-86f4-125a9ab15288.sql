
-- ============================================
-- FASE A: Chat Chain Engine — Fundação
-- ============================================

-- 1. Definição declarativa de Chains
CREATE TABLE IF NOT EXISTS public.ai_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  -- Lista ordenada de fases: [{role, agent_id?, goal, success_criteria, max_turns, requires_review, model?}]
  phases JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.75 CHECK (quality_threshold BETWEEN 0 AND 1),
  on_failure TEXT NOT NULL DEFAULT 'escalate' CHECK (on_failure IN ('retry','escalate','abort')),
  max_retries INT NOT NULL DEFAULT 2,
  reviewer_agent_id UUID, -- agente revisor opcional dedicado
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chains_active ON public.ai_chains(is_active) WHERE is_active = true;

-- 2. Execuções completas de chain
CREATE TABLE IF NOT EXISTS public.ai_chain_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES public.ai_chains(id) ON DELETE CASCADE,
  conversation_id UUID,
  lead_id UUID,
  triggered_by TEXT NOT NULL DEFAULT 'system', -- 'system' | 'user' | 'flow' | 'cron'
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','escalated','aborted')),
  current_phase_index INT NOT NULL DEFAULT 0,
  final_score NUMERIC(3,2),
  final_output JSONB,
  error TEXT,
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  total_tokens INT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_chain_exec_status ON public.ai_chain_executions(status);
CREATE INDEX IF NOT EXISTS idx_chain_exec_conv ON public.ai_chain_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chain_exec_chain ON public.ai_chain_executions(chain_id, started_at DESC);

-- 3. Auditoria por fase
CREATE TABLE IF NOT EXISTS public.ai_phase_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_execution_id UUID NOT NULL REFERENCES public.ai_chain_executions(id) ON DELETE CASCADE,
  phase_index INT NOT NULL,
  phase_role TEXT NOT NULL,         -- ex.: 'triagem', 'especialista_civel', 'revisor'
  phase_goal TEXT NOT NULL,
  agent_id UUID,                    -- agente que executou
  input_context JSONB,
  output_data JSONB,
  turns_used INT NOT NULL DEFAULT 1,
  review_score NUMERIC(3,2),        -- 0..1 do reviewer
  review_feedback TEXT,
  hallucination_flags JSONB DEFAULT '[]'::jsonb, -- ex.: [{field:'amount',reason:'not_in_context'}]
  clarifications_asked INT NOT NULL DEFAULT 0,
  tokens_used INT DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','passed','failed','retried','skipped')),
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_phase_exec_chain ON public.ai_phase_executions(chain_execution_id, phase_index);
CREATE INDEX IF NOT EXISTS idx_phase_exec_agent ON public.ai_phase_executions(agent_id, started_at DESC);

-- 4. Versionamento de agentes (apenas adiciona colunas se ai_agents existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_agents') THEN
    ALTER TABLE public.ai_agents
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS is_active_version BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES public.ai_agents(id);

    CREATE INDEX IF NOT EXISTS idx_ai_agents_active_version
      ON public.ai_agents(parent_agent_id) WHERE is_active_version = true;
  END IF;
END $$;

-- 5. Métrica de alucinação por chamada
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_usage_logs') THEN
    ALTER TABLE public.ai_usage_logs
      ADD COLUMN IF NOT EXISTS hallucination_score NUMERIC(3,2),
      ADD COLUMN IF NOT EXISTS chain_execution_id UUID,
      ADD COLUMN IF NOT EXISTS phase_execution_id UUID;
  END IF;
END $$;

-- 6. Triggers de updated_at
CREATE TRIGGER trg_ai_chains_updated_at
BEFORE UPDATE ON public.ai_chains
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. RLS
ALTER TABLE public.ai_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chain_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_phase_executions ENABLE ROW LEVEL SECURITY;

-- ai_chains: leitura para autenticados, escrita só admin
CREATE POLICY "ai_chains_select_authenticated" ON public.ai_chains
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_chains_admin_write" ON public.ai_chains
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ai_chain_executions: leitura para autenticados
CREATE POLICY "chain_exec_select_authenticated" ON public.ai_chain_executions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chain_exec_admin_write" ON public.ai_chain_executions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ai_phase_executions: leitura para autenticados
CREATE POLICY "phase_exec_select_authenticated" ON public.ai_phase_executions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "phase_exec_admin_write" ON public.ai_phase_executions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8. Seed: chain padrão "Atendimento Jurídico Completo" (template inicial)
INSERT INTO public.ai_chains (name, description, phases, quality_threshold, on_failure)
VALUES (
  'atendimento_juridico_padrao',
  'Cadeia padrão: triagem inicial → especialista da área → revisor antes de enviar',
  '[
    {
      "role": "triagem",
      "goal": "Identificar a área jurídica, urgência e dados básicos do cliente",
      "success_criteria": "Área jurídica classificada e nome do cliente confirmado",
      "max_turns": 3,
      "requires_review": false
    },
    {
      "role": "especialista",
      "goal": "Aprofundar análise do caso e propor próximos passos",
      "success_criteria": "Próxima ação clara e fundamentada",
      "max_turns": 5,
      "requires_review": true
    },
    {
      "role": "revisor",
      "goal": "Validar coerência factual, tom e compliance antes do envio",
      "success_criteria": "Score >= quality_threshold",
      "max_turns": 1,
      "requires_review": false
    }
  ]'::jsonb,
  0.75,
  'escalate'
)
ON CONFLICT (name) DO NOTHING;
