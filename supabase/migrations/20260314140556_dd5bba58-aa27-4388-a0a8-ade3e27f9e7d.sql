
-- Fix #2: Add enable_self_eval opt-in field to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS enable_self_eval boolean DEFAULT false;

-- Fix #8: Create search_chunks_fts RPC for native PostgreSQL full-text search
CREATE OR REPLACE FUNCTION public.search_chunks_fts(
  search_query text,
  doc_ids uuid[],
  max_results integer DEFAULT 20
)
RETURNS TABLE(id uuid, document_id uuid, content text, chunk_index integer, rank real)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.chunk_index,
    ts_rank(to_tsvector('simple', kc.content), plainto_tsquery('simple', search_query)) AS rank
  FROM public.knowledge_chunks kc
  WHERE kc.document_id = ANY(doc_ids)
    AND to_tsvector('simple', kc.content) @@ plainto_tsquery('simple', search_query)
  ORDER BY rank DESC
  LIMIT max_results;
$$;
