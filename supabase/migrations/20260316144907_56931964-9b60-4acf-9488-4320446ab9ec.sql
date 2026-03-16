-- Fase 3: Unificar proposals + contracts
-- Adicionar campos de contrato à tabela proposals
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS contract_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sign_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_email text,
  ADD COLUMN IF NOT EXISTS signer_phone text,
  ADD COLUMN IF NOT EXISTS contract_notes text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric;

-- Redirecionar financial_records para proposals
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id);

-- Redirecionar digital_signatures para proposals
ALTER TABLE public.digital_signatures ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id);

-- Redirecionar payment_transactions para proposals
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fr_proposal_id ON public.financial_records(proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ds_proposal_id ON public.digital_signatures(proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_sign_token ON public.proposals(sign_token) WHERE sign_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_contract_status ON public.proposals(contract_status) WHERE contract_status IS NOT NULL;