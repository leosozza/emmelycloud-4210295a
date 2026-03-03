
-- Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  document_number text,
  country text DEFAULT 'Portugal',
  currency text DEFAULT 'EUR',
  address text,
  city text,
  state text,
  postal_code text,
  phone text,
  email text,
  logo_url text,
  stripe_credential_key text,
  asaas_credential_key text,
  default_gateway text DEFAULT 'auto',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access companies" ON public.companies FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated can read companies" ON public.companies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access companies" ON public.companies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Add company_id to payment_transactions
ALTER TABLE public.payment_transactions ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Trigger for updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
