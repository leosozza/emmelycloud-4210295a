CREATE TABLE IF NOT EXISTS public.conversation_summaries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id             UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  summary_text                TEXT NOT NULL,
  messages_summarized         INTEGER NOT NULL DEFAULT 0,
  message_count_at_compaction INTEGER NOT NULL DEFAULT 0,
  oldest_message_id           UUID,
  newest_summarized_id        UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation_id
  ON public.conversation_summaries(conversation_id, created_at DESC);

ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read conversation_summaries"
  ON public.conversation_summaries FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role full access conversation_summaries"
  ON public.conversation_summaries FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cleanup_old_summaries()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
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