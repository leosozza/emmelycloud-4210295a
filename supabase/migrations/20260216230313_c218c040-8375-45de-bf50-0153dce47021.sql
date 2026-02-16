
-- 1. Role enum and user_roles table (separate from profiles per security requirements)
CREATE TYPE public.app_role AS ENUM ('admin', 'advogado', 'comercial', 'financeiro');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Convenience helpers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin') $$;

CREATE OR REPLACE FUNCTION public.is_advogado()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'advogado') $$;

CREATE OR REPLACE FUNCTION public.is_comercial()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'comercial') $$;

CREATE OR REPLACE FUNCTION public.is_financeiro()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'financeiro') $$;

-- RLS on user_roles: only admins can manage, authenticated can read own
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Leads table
CREATE TYPE public.funnel_stage AS ENUM (
  'lead', 'triagem', 'proposta', 'analise', 'contrato', 'financeiro', 'fechado'
);
CREATE TYPE public.lead_origin AS ENUM ('whatsapp', 'instagram', 'email', 'landing_page', 'outro');
CREATE TYPE public.legal_area AS ENUM (
  'previdencia', 'cidadania', 'vistos', 'trabalhista', 'familia', 'empresarial', 'tributario', 'outro'
);

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  country TEXT DEFAULT 'Portugal',
  origin lead_origin NOT NULL DEFAULT 'outro',
  legal_area legal_area DEFAULT 'outro',
  funnel_stage funnel_stage NOT NULL DEFAULT 'lead',
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('baixa', 'normal', 'alta', 'urgente')),
  sla_expires_at TIMESTAMPTZ,
  ai_score NUMERIC(3,1) DEFAULT 0,
  ai_viability TEXT DEFAULT 'pendente' CHECK (ai_viability IN ('pendente', 'alta', 'media', 'baixa')),
  notes TEXT DEFAULT '',
  assigned_commercial_id UUID REFERENCES public.profiles(id),
  assigned_attorney_id UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access leads" ON public.leads FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Comercial can read all leads" ON public.leads FOR SELECT TO authenticated
  USING (public.is_comercial());
CREATE POLICY "Comercial can insert leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.is_comercial());
CREATE POLICY "Comercial can update assigned leads" ON public.leads FOR UPDATE TO authenticated
  USING (public.is_comercial() AND assigned_commercial_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Advogado can read assigned leads" ON public.leads FOR SELECT TO authenticated
  USING (public.is_advogado() AND assigned_attorney_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Financeiro can read leads" ON public.leads FOR SELECT TO authenticated
  USING (public.is_financeiro());

-- 5. Cases table
CREATE TYPE public.case_status AS ENUM ('aberto', 'em_andamento', 'pendente_docs', 'concluido', 'arquivado');

CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  legal_area legal_area NOT NULL DEFAULT 'outro',
  status case_status NOT NULL DEFAULT 'aberto',
  assigned_attorney_id UUID REFERENCES public.profiles(id),
  description TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  viability TEXT DEFAULT 'pendente' CHECK (viability IN ('pendente', 'viavel', 'inviavel', 'parcial')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access cases" ON public.cases FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Advogado can read assigned cases" ON public.cases FOR SELECT TO authenticated
  USING (public.is_advogado() AND assigned_attorney_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Advogado can insert cases" ON public.cases FOR INSERT TO authenticated
  WITH CHECK (public.is_advogado());
CREATE POLICY "Advogado can update assigned cases" ON public.cases FOR UPDATE TO authenticated
  USING (public.is_advogado() AND assigned_attorney_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Comercial can read cases" ON public.cases FOR SELECT TO authenticated
  USING (public.is_comercial());
CREATE POLICY "Financeiro can read cases" ON public.cases FOR SELECT TO authenticated
  USING (public.is_financeiro());

-- 6. Proposals table
CREATE TYPE public.proposal_status AS ENUM ('rascunho', 'enviada', 'aceita', 'recusada', 'expirada');
CREATE TYPE public.payment_type AS ENUM ('fixo', 'exito', 'hibrido', 'parcelado');

CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_type payment_type NOT NULL DEFAULT 'fixo',
  installments INTEGER DEFAULT 1,
  status proposal_status NOT NULL DEFAULT 'rascunho',
  conditions TEXT DEFAULT '',
  valid_until TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access proposals" ON public.proposals FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Advogado can read proposals" ON public.proposals FOR SELECT TO authenticated
  USING (public.is_advogado());
CREATE POLICY "Advogado can insert proposals" ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (public.is_advogado());
CREATE POLICY "Advogado can update proposals" ON public.proposals FOR UPDATE TO authenticated
  USING (public.is_advogado());
CREATE POLICY "Comercial can read proposals" ON public.proposals FOR SELECT TO authenticated
  USING (public.is_comercial());
CREATE POLICY "Financeiro can read proposals" ON public.proposals FOR SELECT TO authenticated
  USING (public.is_financeiro());

-- 7. Contracts table
CREATE TYPE public.contract_status AS ENUM ('pendente', 'assinado', 'cancelado');

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE CASCADE NOT NULL,
  case_id UUID REFERENCES public.cases(id),
  status contract_status NOT NULL DEFAULT 'pendente',
  signed_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  file_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access contracts" ON public.contracts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Advogado can read contracts" ON public.contracts FOR SELECT TO authenticated
  USING (public.is_advogado());
CREATE POLICY "Advogado can insert contracts" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (public.is_advogado());
CREATE POLICY "Comercial can read contracts" ON public.contracts FOR SELECT TO authenticated
  USING (public.is_comercial());
CREATE POLICY "Financeiro can read contracts" ON public.contracts FOR SELECT TO authenticated
  USING (public.is_financeiro());

-- 8. Financial records table
CREATE TYPE public.payment_method AS ENUM ('stripe', 'transferencia', 'parcelado_direto');
CREATE TYPE public.installment_status AS ENUM ('pendente', 'paga', 'atrasada', 'vencendo');

CREATE TABLE public.financial_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'transferencia',
  installment_number INTEGER DEFAULT 1,
  total_installments INTEGER DEFAULT 1,
  installment_value NUMERIC(12,2) DEFAULT 0,
  status installment_status NOT NULL DEFAULT 'pendente',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  receipt_url TEXT DEFAULT '',
  stripe_payment_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access financial" ON public.financial_records FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Financeiro can read financial" ON public.financial_records FOR SELECT TO authenticated
  USING (public.is_financeiro());
CREATE POLICY "Financeiro can insert financial" ON public.financial_records FOR INSERT TO authenticated
  WITH CHECK (public.is_financeiro());
CREATE POLICY "Financeiro can update financial" ON public.financial_records FOR UPDATE TO authenticated
  USING (public.is_financeiro());
CREATE POLICY "Advogado can read financial" ON public.financial_records FOR SELECT TO authenticated
  USING (public.is_advogado());
CREATE POLICY "Comercial can read financial" ON public.financial_records FOR SELECT TO authenticated
  USING (public.is_comercial());

-- 9. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financial_updated_at BEFORE UPDATE ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Set SLA automatically on lead creation (24h from now)
CREATE OR REPLACE FUNCTION public.set_lead_sla()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sla_expires_at IS NULL THEN
    NEW.sla_expires_at = now() + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_lead_sla_on_insert BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_sla();
