-- PR1: Qualificação completa das partes na tabela proposals
-- Adiciona campos necessários para geração automática de contratos com validade jurídica
-- conforme os modelos reais do escritório Emmely Fernandes Advocacia.
-- Foro: Lisboa | Moeda: EUR | Formato de datas: dd/MM/yyyy (aplicado na camada UI/PDF)

-- ── 1. Campos de identificação estruturada do contratante ────────────────────
-- Substitui o campo livre client_document por campos estruturados e separados.
-- O campo client_document original é mantido por retrocompatibilidade.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS client_gender          TEXT,         -- 'M', 'F' ou 'N' (neutro)
  ADD COLUMN IF NOT EXISTS client_nationality     TEXT,         -- ex: 'Brasileira', 'Portuguesa'
  ADD COLUMN IF NOT EXISTS client_document_type   TEXT,         -- 'NIF', 'CPF', 'Passaporte', 'CC', 'BI'
  ADD COLUMN IF NOT EXISTS client_document_number TEXT,         -- número do documento
  ADD COLUMN IF NOT EXISTS client_document_validity DATE,       -- validade do documento
  ADD COLUMN IF NOT EXISTS client_document_issuer TEXT;         -- órgão emissor, ex: 'SEF', 'Polícia Federal'

-- ── 2. Campos de detalhamento financeiro ────────────────────────────────────
-- Permite especificar separadamente o valor da entrada (Forma_Assinatura)
-- e o valor de cada parcela subsequente (Forma_Parcela), conforme o modelo de contrato.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS upfront_value      NUMERIC(12, 2), -- valor a pagar na assinatura
  ADD COLUMN IF NOT EXISTS installment_value  NUMERIC(12, 2); -- valor de cada parcela subsequente

-- ── 3. Constraint de validação para client_gender ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposals_client_gender_check'
  ) THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_client_gender_check
      CHECK (client_gender IN ('M', 'F', 'N') OR client_gender IS NULL);
  END IF;
END;
$$;

-- ── 4. Constraint de validação para client_document_type ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposals_client_document_type_check'
  ) THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_client_document_type_check
      CHECK (client_document_type IN ('NIF', 'CPF', 'Passaporte', 'CC', 'BI') OR client_document_type IS NULL);
  END IF;
END;
$$;

-- ── 5. Comentários descritivos nas colunas ──────────────────────────────────
COMMENT ON COLUMN public.proposals.client_gender           IS 'Género do contratante: M (Masculino), F (Feminino), N (Neutro/Empresa). Usado para flexão de tratamento nos documentos (Prezado/Prezada, Sr./Sra.).';
COMMENT ON COLUMN public.proposals.client_nationality      IS 'Nacionalidade do contratante, por extenso. Ex: Brasileira, Portuguesa, Angolana.';
COMMENT ON COLUMN public.proposals.client_document_type    IS 'Tipo de documento de identificação: NIF, CPF, Passaporte, CC (Cartão de Cidadão), BI (Bilhete de Identidade).';
COMMENT ON COLUMN public.proposals.client_document_number  IS 'Número do documento de identificação (separado do campo livre client_document por retrocompatibilidade).';
COMMENT ON COLUMN public.proposals.client_document_validity IS 'Data de validade do documento de identificação. Formato de exibição na UI e PDFs: dd/MM/yyyy (PT-PT).';
COMMENT ON COLUMN public.proposals.client_document_issuer  IS 'Órgão emissor do documento. Ex: SEF, AIMA, Polícia Federal, IRN.';
COMMENT ON COLUMN public.proposals.upfront_value           IS 'Valor a pagar na data de assinatura do contrato (Forma_Assinatura). Moeda definida pelo campo currency (default EUR).';
COMMENT ON COLUMN public.proposals.installment_value       IS 'Valor de cada parcela subsequente após a entrada (Forma_Parcela). Moeda definida pelo campo currency (default EUR).';
