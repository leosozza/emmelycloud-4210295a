ALTER TABLE public.message_queue
  ADD COLUMN IF NOT EXISTS claimed_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS claimed_by    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retry_count   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_message_queue_pending_created
  ON public.message_queue(status, created_at ASC)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_message_queue_conversation_pending
  ON public.message_queue(conversation_id, status)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_queue_jobs(
  p_limit       INTEGER DEFAULT 10,
  p_worker_id   TEXT    DEFAULT NULL,
  p_max_retries INTEGER DEFAULT 3,
  p_cutoff      TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.message_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.message_queue
  SET
    status     = 'processing',
    claimed_at = now(),
    claimed_by = COALESCE(p_worker_id, gen_random_uuid()::text),
    processing_at = now()
  WHERE id IN (
    SELECT id
    FROM public.message_queue
    WHERE status = 'pending'
      AND (p_cutoff IS NULL OR created_at < p_cutoff)
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stuck_jobs(
  p_stuck_minutes INTEGER DEFAULT 5
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.message_queue
  SET
    status      = 'pending',
    claimed_at  = NULL,
    claimed_by  = NULL,
    processing_at = NULL,
    retry_count = retry_count + 1
  WHERE status = 'processing'
    AND claimed_at < now() - (p_stuck_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;