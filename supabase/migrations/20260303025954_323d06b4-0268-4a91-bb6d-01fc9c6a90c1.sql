
-- Create sync dedup cache table
CREATE TABLE public.sync_dedup_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  external_id text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dedup_entity_external ON public.sync_dedup_cache(entity_type, external_id, source);
CREATE INDEX idx_dedup_created_at ON public.sync_dedup_cache(created_at);

ALTER TABLE public.sync_dedup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access sync_dedup_cache"
  ON public.sync_dedup_cache FOR ALL
  USING (true) WITH CHECK (true);

-- Add sync_source to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sync_source text;
