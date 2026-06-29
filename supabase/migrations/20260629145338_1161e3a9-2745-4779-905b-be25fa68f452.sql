
-- ============ asaas_subscriptions ============
CREATE TABLE IF NOT EXISTS public.asaas_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  bitrix24_deal_id text,
  asaas_subscription_id text NOT NULL,
  asaas_customer_id text NOT NULL,
  billing_type text NOT NULL CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
  cycle text NOT NULL CHECK (cycle IN ('WEEKLY','BIWEEKLY','MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUALLY','YEARLY')),
  value numeric NOT NULL CHECK (value > 0),
  next_due_date date,
  end_date date,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','INACTIVE','CANCELED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asaas_subscription_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_subscriptions TO authenticated;
GRANT ALL ON public.asaas_subscriptions TO service_role;

ALTER TABLE public.asaas_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and finance can manage asaas_subscriptions"
  ON public.asaas_subscriptions FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_financeiro())
  WITH CHECK (public.is_admin() OR public.is_financeiro());

CREATE INDEX IF NOT EXISTS idx_asaas_subs_company ON public.asaas_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_asaas_subs_deal ON public.asaas_subscriptions(bitrix24_deal_id);
CREATE INDEX IF NOT EXISTS idx_asaas_subs_status ON public.asaas_subscriptions(status);

CREATE TRIGGER update_asaas_subscriptions_updated_at
  BEFORE UPDATE ON public.asaas_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ asaas_invoices (NFSe) ============
CREATE TABLE IF NOT EXISTS public.asaas_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  asaas_subscription_id uuid REFERENCES public.asaas_subscriptions(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  asaas_invoice_id text NOT NULL,
  asaas_payment_id text,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','SYNCHRONIZED','AUTHORIZED','PROCESSING_CANCELLATION','CANCELED','CANCELLATION_DENIED','ERROR')),
  pdf_url text,
  xml_url text,
  number text,
  service_description text,
  value numeric NOT NULL CHECK (value >= 0),
  effective_date date,
  municipal_service_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asaas_invoice_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_invoices TO authenticated;
GRANT ALL ON public.asaas_invoices TO service_role;

ALTER TABLE public.asaas_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and finance can manage asaas_invoices"
  ON public.asaas_invoices FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_financeiro())
  WITH CHECK (public.is_admin() OR public.is_financeiro());

CREATE INDEX IF NOT EXISTS idx_asaas_inv_tx ON public.asaas_invoices(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_asaas_inv_sub ON public.asaas_invoices(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_asaas_inv_status ON public.asaas_invoices(status);

CREATE TRIGGER update_asaas_invoices_updated_at
  BEFORE UPDATE ON public.asaas_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ asaas_webhook_events ============
CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

GRANT SELECT ON public.asaas_webhook_events TO authenticated;
GRANT ALL ON public.asaas_webhook_events TO service_role;

ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read asaas_webhook_events"
  ON public.asaas_webhook_events FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_asaas_evt_type ON public.asaas_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_asaas_evt_processed ON public.asaas_webhook_events(processed_at);

-- ============ asaas_robot_registrations ============
CREATE TABLE IF NOT EXISTS public.asaas_robot_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_endpoint text NOT NULL,
  robot_code text NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (client_endpoint, robot_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_robot_registrations TO authenticated;
GRANT ALL ON public.asaas_robot_registrations TO service_role;

ALTER TABLE public.asaas_robot_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage robot registrations"
  ON public.asaas_robot_registrations FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
