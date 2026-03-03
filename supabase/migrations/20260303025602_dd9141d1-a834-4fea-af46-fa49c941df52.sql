ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS bitrix24_id text,
  ADD COLUMN IF NOT EXISTS sync_source text DEFAULT 'emmely';

CREATE INDEX IF NOT EXISTS idx_leads_bitrix24_id ON public.leads(bitrix24_id) WHERE bitrix24_id IS NOT NULL;