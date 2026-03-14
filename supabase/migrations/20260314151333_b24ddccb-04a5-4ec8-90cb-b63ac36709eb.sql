
-- Commission rules table
CREATE TABLE public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL DEFAULT 'comercial',
  legal_area public.legal_area NULL,
  percentage NUMERIC NOT NULL DEFAULT 10,
  min_value NUMERIC DEFAULT 0,
  max_value NUMERIC DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access commission_rules" ON public.commission_rules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Financeiro can read commission_rules" ON public.commission_rules
  FOR SELECT TO authenticated
  USING (public.is_financeiro());

-- Commission entries table
CREATE TABLE public.commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  transaction_id UUID REFERENCES public.payment_transactions(id),
  proposal_id UUID REFERENCES public.proposals(id),
  rule_id UUID REFERENCES public.commission_rules(id),
  base_amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access commission_entries" ON public.commission_entries
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Financeiro can manage commission_entries" ON public.commission_entries
  FOR ALL TO authenticated
  USING (public.is_financeiro())
  WITH CHECK (public.is_financeiro());

CREATE POLICY "Users can read own commissions" ON public.commission_entries
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
