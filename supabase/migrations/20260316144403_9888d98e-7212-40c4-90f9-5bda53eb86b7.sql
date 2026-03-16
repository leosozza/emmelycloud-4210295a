ALTER TABLE public.services ADD COLUMN IF NOT EXISTS bitrix24_id text;
CREATE INDEX IF NOT EXISTS idx_services_bitrix24_id ON public.services(bitrix24_id) WHERE bitrix24_id IS NOT NULL;