ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS bitrix_chat_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_bitrix_chat_id
  ON public.conversations (bitrix_chat_id)
  WHERE bitrix_chat_id IS NOT NULL;