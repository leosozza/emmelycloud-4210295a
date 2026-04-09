-- ─────────────────────────────────────────────────────────────────────────────
-- Migração: Melhorar o persona-trainer com arquitetura relacional
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adicionar colunas de categoria e prioridade ao persona_training_history
ALTER TABLE public.persona_training_history
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'Comportamento',
  ADD COLUMN IF NOT EXISTS priority int DEFAULT 10;

-- 2. Adicionar base_prompt ao ai_agents
--    Armazena o prompt original sem as regras de treinamento concatenadas,
--    permitindo reconstrução limpa do system_prompt.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS base_prompt text;

-- 3. Migrar os base_prompts existentes:
--    Para agentes que já têm system_prompt, salvar como base_prompt
--    (antes de qualquer treinamento futuro sobrescrever).
UPDATE public.ai_agents
  SET base_prompt = system_prompt
  WHERE base_prompt IS NULL
    AND system_prompt IS NOT NULL
    AND system_prompt != '';

-- 4. Índice de busca por prioridade para reconstrução ordenada do prompt
CREATE INDEX IF NOT EXISTS persona_training_history_priority_idx
  ON public.persona_training_history (agent_id, priority ASC, applied_at ASC)
  WHERE reverted_at IS NULL;

-- 5. Índice de busca por categoria
CREATE INDEX IF NOT EXISTS persona_training_history_category_idx
  ON public.persona_training_history (agent_id, category)
  WHERE reverted_at IS NULL;

-- 6. Atualizar prioridades dos registros existentes (incremento de 10)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY applied_at ASC) * 10 AS new_priority
  FROM public.persona_training_history
  WHERE priority = 10 OR priority IS NULL
)
UPDATE public.persona_training_history p
  SET priority = r.new_priority
  FROM ranked r
  WHERE p.id = r.id;
