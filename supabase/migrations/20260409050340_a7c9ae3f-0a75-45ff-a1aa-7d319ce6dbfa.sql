ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS auto_payment_config JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_auto_payment_config
  ON public.proposals(id)
  WHERE auto_payment_config IS NOT NULL;

COMMENT ON COLUMN public.proposals.auto_payment_config IS
  'Configuração de pagamento automático após assinatura do contrato. Estrutura: { send_payment: boolean, payment_method: string, installments: number }.';