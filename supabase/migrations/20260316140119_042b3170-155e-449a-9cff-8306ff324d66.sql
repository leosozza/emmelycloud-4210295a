
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS id_access text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS bitrix24_id text;
CREATE INDEX IF NOT EXISTS idx_clients_id_access ON public.clients(id_access) WHERE id_access IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_bitrix24_id ON public.clients(bitrix24_id) WHERE bitrix24_id IS NOT NULL;
