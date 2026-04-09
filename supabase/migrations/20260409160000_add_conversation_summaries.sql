-- ─────────────────────────────────────────────────────────────────────────────
-- Conversation Summaries — History Compactor
-- Inspirado no compact_messages_if_needed() do Claw Code
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversation_summaries (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id           UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

  -- Resumo gerado pelo LLM
  summary_text              TEXT NOT NULL,

  -- Metadados da compactação
  messages_summarized       INTEGER NOT NULL DEFAULT 0,
  message_count_at_compaction INTEGER NOT NULL DEFAULT 0,
  oldest_message_id         UUID,
  newest_summarized_id      UUID,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation_id
  ON public.conversation_summaries(conversation_id, created_at DESC);

-- Manter apenas os 5 resumos mais recentes por conversa (limpeza automática)
CREATE OR REPLACE FUNCTION public.cleanup_old_summaries()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.conversation_summaries
  WHERE conversation_id = NEW.conversation_id
    AND id NOT IN (
      SELECT id FROM public.conversation_summaries
      WHERE conversation_id = NEW.conversation_id
      ORDER BY created_at DESC
      LIMIT 5
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_old_summaries ON public.conversation_summaries;
CREATE TRIGGER trg_cleanup_old_summaries
  AFTER INSERT ON public.conversation_summaries
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_old_summaries();

COMMENT ON TABLE public.conversation_summaries IS
  'Resumos compactados de conversas — inspirado no compact_messages_if_needed() do Claw Code. '
  'Quando uma conversa excede 30 mensagens, as mensagens antigas são resumidas e '
  'o resumo é injetado no system prompt para manter o contexto sem exceder o context window.';
