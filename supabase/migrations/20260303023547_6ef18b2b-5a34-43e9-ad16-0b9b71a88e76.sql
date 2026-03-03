
-- Tabela digital_signatures
CREATE TABLE public.digital_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text,
  signer_phone text,
  signer_document text,
  signature_method text NOT NULL DEFAULT 'draw',
  signature_image_url text,
  ip_address text,
  user_agent text,
  device_info jsonb DEFAULT '{}',
  geolocation jsonb,
  evidence_hash text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.digital_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read digital_signatures" ON public.digital_signatures FOR SELECT USING (true);
CREATE POLICY "Service role full access digital_signatures" ON public.digital_signatures FOR ALL USING (true) WITH CHECK (true);

-- Campos de assinatura na tabela contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS sign_token uuid DEFAULT gen_random_uuid();
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signer_name text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signer_email text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signer_phone text;

-- Policy para anon poder ler contratos por sign_token (pagina publica)
CREATE POLICY "Anon can read contracts by sign_token" ON public.contracts FOR SELECT USING (sign_token IS NOT NULL);

-- Policy para anon poder atualizar status do contrato via assinatura
CREATE POLICY "Anon can update contract status via signature" ON public.contracts FOR UPDATE USING (sign_token IS NOT NULL);

-- Storage bucket para imagens de assinatura
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', true);

CREATE POLICY "Anyone can read signatures bucket" ON storage.objects FOR SELECT USING (bucket_id = 'signatures');
CREATE POLICY "Anyone can upload to signatures bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'signatures');
