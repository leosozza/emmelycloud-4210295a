ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS bitrix24_deal_id text;
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS bitrix24_invoice_id text;
CREATE INDEX IF NOT EXISTS idx_fr_bitrix24_deal_id ON public.financial_records(bitrix24_deal_id) WHERE bitrix24_deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fr_bitrix24_invoice_id ON public.financial_records(bitrix24_invoice_id) WHERE bitrix24_invoice_id IS NOT NULL;