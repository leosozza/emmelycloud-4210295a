
-- Create payment_transactions table
CREATE TABLE public.payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES public.contracts(id),
  client_id UUID REFERENCES public.clients(id),
  financial_record_id UUID REFERENCES public.financial_records(id),
  gateway TEXT NOT NULL CHECK (gateway IN ('stripe', 'asaas')),
  gateway_payment_id TEXT,
  gateway_customer_id TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'BRL')),
  payment_method TEXT NOT NULL DEFAULT 'card' CHECK (payment_method IN ('card', 'pix', 'boleto', 'transfer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'received', 'overdue', 'refunded', 'canceled', 'failed')),
  payment_url TEXT,
  pix_qr_code TEXT,
  pix_code TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payment_gateway_config table
CREATE TABLE public.payment_gateway_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway TEXT NOT NULL CHECK (gateway IN ('stripe', 'asaas')),
  environment TEXT NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'production')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(gateway, environment)
);

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_config ENABLE ROW LEVEL SECURITY;

-- RLS for payment_transactions
CREATE POLICY "Admins full access payment_transactions"
  ON public.payment_transactions FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Financeiro can read payment_transactions"
  ON public.payment_transactions FOR SELECT
  USING (is_financeiro());

CREATE POLICY "Financeiro can insert payment_transactions"
  ON public.payment_transactions FOR INSERT
  WITH CHECK (is_financeiro());

CREATE POLICY "Financeiro can update payment_transactions"
  ON public.payment_transactions FOR UPDATE
  USING (is_financeiro());

CREATE POLICY "Service role full access payment_transactions"
  ON public.payment_transactions FOR ALL
  USING (true) WITH CHECK (true);

-- RLS for payment_gateway_config
CREATE POLICY "Admins full access payment_gateway_config"
  ON public.payment_gateway_config FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Service role full access payment_gateway_config"
  ON public.payment_gateway_config FOR ALL
  USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_gateway_config_updated_at
  BEFORE UPDATE ON public.payment_gateway_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for payment_transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;

-- Insert default gateway configs
INSERT INTO public.payment_gateway_config (gateway, environment, is_active) VALUES
  ('stripe', 'test', false),
  ('stripe', 'production', false),
  ('asaas', 'test', false),
  ('asaas', 'production', false);
