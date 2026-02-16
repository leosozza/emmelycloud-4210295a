
-- =============================================
-- Tabela: clients (Cadastro de Clientes)
-- =============================================
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  document_type text,
  document_number text,
  nationality text,
  birth_date date,
  nib text,
  address text,
  postal_code text,
  freguesia text,
  concelho text,
  distrito text,
  country text DEFAULT 'PORTUGAL',
  has_active_contract boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Tabela: client_contacts
-- =============================================
CREATE TABLE public.client_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  mobile text,
  email text
);

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to client_contacts" ON public.client_contacts FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- Tabela: services (Cadastro de Serviços)
-- =============================================
CREATE TABLE public.services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  value numeric NOT NULL DEFAULT 0,
  budget_details text,
  contract_intro text,
  contract_details text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to services" ON public.services FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Tabela: sef_locations (Cadastro de SEF)
-- =============================================
CREATE TABLE public.sef_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  regional_direction text NOT NULL,
  name text NOT NULL,
  details text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sef_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to sef_locations" ON public.sef_locations FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_sef_locations_updated_at
  BEFORE UPDATE ON public.sef_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Vincular leads a clients
-- =============================================
ALTER TABLE public.leads ADD COLUMN client_id uuid REFERENCES public.clients(id);
