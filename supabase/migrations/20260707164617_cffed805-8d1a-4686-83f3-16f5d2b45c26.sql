ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS bitrix_timeline_comment_id BIGINT,
  ADD COLUMN IF NOT EXISTS bitrix_entity_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_bitrix_comment ON public.messages(bitrix_timeline_comment_id);