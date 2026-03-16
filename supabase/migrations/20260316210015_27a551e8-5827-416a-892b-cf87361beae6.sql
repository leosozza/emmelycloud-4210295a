
CREATE TABLE public.bitrix24_sync_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  cache_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, cache_type)
);

ALTER TABLE public.bitrix24_sync_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access bitrix24_sync_cache" ON public.bitrix24_sync_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
