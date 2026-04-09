
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS products_json jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS bitrix24_deal_id text;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS accept_stage_id text;
