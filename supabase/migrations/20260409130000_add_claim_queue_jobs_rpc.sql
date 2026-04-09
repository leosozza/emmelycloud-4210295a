-- ─────────────────────────────────────────────────────────────────────────────
-- Migração: Função RPC claim_queue_jobs com SELECT FOR UPDATE SKIP LOCKED
-- Resolve o race condition do queue-worker: múltiplas invocações simultâneas
-- não podem mais pegar o mesmo job, eliminando mensagens duplicadas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_queue_jobs(
  p_cutoff timestamptz,
  p_limit int DEFAULT 50
)
RETURNS SETOF public.message_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.message_queue
  SET
    status = 'processing',
    processing_at = now()
  WHERE id IN (
    SELECT id
    FROM public.message_queue
    WHERE status = 'pending'
      AND created_at < p_cutoff
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED  -- ← chave: ignora rows bloqueadas por outros workers
  )
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.claim_queue_jobs IS
  'Atomicamente marca jobs como "processing" usando SELECT FOR UPDATE SKIP LOCKED.
   Garante que múltiplos workers simultâneos não processem o mesmo job,
   eliminando mensagens duplicadas enviadas ao cliente.';

-- Índice para a query de claim (status + created_at + priority)
CREATE INDEX IF NOT EXISTS message_queue_claim_idx
  ON public.message_queue (status, created_at ASC, priority DESC)
  WHERE status = 'pending';

-- Índice para cleanup de jobs travados
CREATE INDEX IF NOT EXISTS message_queue_processing_idx
  ON public.message_queue (status, processing_at)
  WHERE status = 'processing';
