-- Criar tabela persona_training_history se não existir
CREATE TABLE IF NOT EXISTS public.persona_training_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  instruction TEXT NOT NULL,
  rule_text   TEXT DEFAULT NULL,
  category    TEXT DEFAULT 'general',
  priority    INTEGER DEFAULT 50,
  is_active   BOOLEAN DEFAULT TRUE,
  applied_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns if they don't exist (idempotent for existing table)
ALTER TABLE public.persona_training_history
  ADD COLUMN IF NOT EXISTS category    TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS priority    INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rule_text   TEXT DEFAULT NULL;

-- Enable RLS
ALTER TABLE public.persona_training_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'persona_training_history' AND policyname = 'Admins full access persona_training_history') THEN
    CREATE POLICY "Admins full access persona_training_history"
      ON public.persona_training_history FOR ALL
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'persona_training_history' AND policyname = 'Service role full access persona_training_history') THEN
    CREATE POLICY "Service role full access persona_training_history"
      ON public.persona_training_history FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- base_prompt no ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS base_prompt TEXT DEFAULT NULL;

-- Migrar system_prompt → base_prompt
UPDATE public.ai_agents
SET base_prompt = system_prompt
WHERE base_prompt IS NULL AND system_prompt IS NOT NULL;

-- Índice
CREATE INDEX IF NOT EXISTS idx_persona_training_active
  ON public.persona_training_history(agent_id, is_active, priority DESC)
  WHERE is_active = TRUE;