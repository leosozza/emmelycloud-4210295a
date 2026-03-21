
CREATE TABLE public.receipt_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  bitrix24_deal_id text,
  client_name text,
  deal_title text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_links ENABLE ROW LEVEL SECURITY;

-- Public read by token (no auth needed)
CREATE POLICY "Anyone can read receipt_links by token"
ON public.receipt_links FOR SELECT TO anon, authenticated
USING (true);

-- Service role full access
CREATE POLICY "Service role full access receipt_links"
ON public.receipt_links FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Admins and financeiro can manage
CREATE POLICY "Admins full access receipt_links"
ON public.receipt_links FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Financeiro can manage receipt_links"
ON public.receipt_links FOR ALL TO authenticated
USING (public.is_financeiro()) WITH CHECK (public.is_financeiro());

-- Index for fast token lookup
CREATE INDEX idx_receipt_links_token ON public.receipt_links(token);
CREATE INDEX idx_receipt_links_contract_id ON public.receipt_links(contract_id);
CREATE INDEX idx_receipt_links_bitrix24_deal_id ON public.receipt_links(bitrix24_deal_id);
