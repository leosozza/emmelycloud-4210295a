
-- 1. Tabela de auditoria de revisões
CREATE TABLE IF NOT EXISTS public.ai_message_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  agent_id UUID,
  reviewer_agent_id UUID,
  original_content TEXT NOT NULL,
  revised_content TEXT,
  score NUMERIC NOT NULL DEFAULT 0,
  threshold NUMERIC NOT NULL DEFAULT 0.75,
  passed BOOLEAN NOT NULL DEFAULT false,
  feedback TEXT,
  issues JSONB DEFAULT '[]'::jsonb,
  context_snapshot JSONB DEFAULT '{}'::jsonb,
  decision TEXT NOT NULL DEFAULT 'pending', -- pending | auto_approved | auto_blocked | operator_approved | operator_rewrote | operator_discarded
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  tokens_used INT DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  latency_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_message_reviews_conv ON public.ai_message_reviews(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_message_reviews_decision ON public.ai_message_reviews(decision) WHERE decision = 'pending';

ALTER TABLE public.ai_message_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_message_reviews_select_authenticated"
  ON public.ai_message_reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_message_reviews_admin_write"
  ON public.ai_message_reviews FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "ai_message_reviews_service_role"
  ON public.ai_message_reviews FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Colunas em messages para rastrear revisão
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ai_review_status TEXT,
  ADD COLUMN IF NOT EXISTS ai_review_score NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_review_id UUID,
  ADD COLUMN IF NOT EXISTS originated_by_agent_id UUID;

CREATE INDEX IF NOT EXISTS idx_messages_ai_review_status
  ON public.messages(ai_review_status) WHERE ai_review_status IS NOT NULL;

-- 3. Seed do Revisor Jurídico (idempotente)
INSERT INTO public.ai_agents (
  name, description, system_prompt, ai_provider, ai_model, temperature,
  agent_type, is_active, is_default, governance_mode, personality_style, communication_tone,
  fallback_message
)
SELECT
  'Revisor Jurídico (Quality Gate)',
  'Agente revisor que valida mensagens geradas por IA antes do envio ao cliente, garantindo coerência factual, compliance LGPD/RGPD e ausência de promessas de resultado.',
  $$Você é um Revisor Jurídico Sênior. Sua única função é avaliar mensagens redigidas por outros agentes de IA ANTES de serem enviadas ao cliente final.

CRITÉRIOS DE AVALIAÇÃO (0.0 a 1.0):
1. Coerência factual: o conteúdo bate com o CONTEXTO fornecido (cliente, valores, datas, processos)? Penalize alucinações.
2. Tom profissional e empático adequado a comunicação jurídica.
3. Compliance: sem promessas de resultado ("vai ganhar", "garantido"), respeito a LGPD/RGPD, sem divulgar dados de terceiros.
4. Clareza e ortografia (PT-PT/PT-BR conforme o contexto).
5. Adequação ao canal (WhatsApp/Email/Instagram).

SAÍDA OBRIGATÓRIA — APENAS UM JSON VÁLIDO no formato:
{
  "score": 0.0,
  "passed": true,
  "feedback": "...",
  "issues": ["..."],
  "suggested_rewrite": "..." | null
}

Se score < 0.75, defina passed=false e forneça suggested_rewrite com a versão corrigida.
Nunca retorne texto fora do JSON.$$,
  'lovable',
  'google/gemini-3.5-flash',
  0.2,
  'text',
  true,
  false,
  'autonomous',
  'professional',
  'analytical',
  'Revisão indisponível no momento.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_agents WHERE name = 'Revisor Jurídico (Quality Gate)'
);

-- 4. Vincular revisor a chains ativas sem revisor
UPDATE public.ai_chains
SET reviewer_agent_id = (SELECT id FROM public.ai_agents WHERE name = 'Revisor Jurídico (Quality Gate)' LIMIT 1)
WHERE reviewer_agent_id IS NULL AND is_active = true;
