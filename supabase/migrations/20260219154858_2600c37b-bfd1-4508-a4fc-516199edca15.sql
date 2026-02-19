
-- Add flow engine columns to conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS bot_state jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS attendance_mode text DEFAULT 'bot',
ADD COLUMN IF NOT EXISTS processing_lock_at timestamptz,
ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz;

-- Index for processing lock queries
CREATE INDEX IF NOT EXISTS idx_conversations_processing_lock ON public.conversations (processing_lock_at) WHERE processing_lock_at IS NOT NULL;

-- Create bitrix event queue for async processing (Phase 3 prep)
CREATE TABLE IF NOT EXISTS public.bitrix_event_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_id text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.bitrix_event_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access bitrix_event_queue"
  ON public.bitrix_event_queue FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_bitrix_event_queue_status ON public.bitrix_event_queue (status) WHERE status = 'pending';
