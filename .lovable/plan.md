

## Plano: Fase 3 — Migração e Unificação proposals + contracts

### Contexto
A tabela `contracts` será absorvida pela tabela `proposals`. Todos os ficheiros que referenciam `contracts` precisam ser actualizados. A tabela `contracts` será mantida temporariamente (backward compat) mas todo o código passará a usar `proposals`.

### 1. Migração SQL

Adicionar colunas de contrato à tabela `proposals`, migrar dados existentes, e redirecionar FKs:

```sql
-- Adicionar campos de contrato à proposals
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

-- Migrar dados de contracts para proposals
UPDATE public.proposals p SET
  contract_status = c.status::text,
  file_url = c.file_url,
  starts_at = c.starts_at,
  expires_at = c.expires_at,
  signed_at = c.signed_at,
  sign_token = c.sign_token,
  signer_name = c.signer_name,
  signer_email = c.signer_email,
  signer_phone = c.signer_phone,
  contract_notes = c.notes,
  cancelled_at = c.cancelled_at,
  cancel_reason = c.cancel_reason,
  refund_amount = c.refund_amount
FROM public.contracts c WHERE c.proposal_id = p.id;

-- Redirecionar financial_records para proposals
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES proposals(id);
UPDATE public.financial_records fr SET proposal_id = c.proposal_id FROM public.contracts c WHERE fr.contract_id = c.id;

-- Redirecionar digital_signatures para proposals
ALTER TABLE public.digital_signatures ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES proposals(id);
UPDATE public.digital_signatures ds SET proposal_id = c.proposal_id FROM public.contracts c WHERE ds.contract_id = c.id;

-- Índices
CREATE INDEX IF NOT EXISTS idx_fr_proposal_id ON public.financial_records(proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ds_proposal_id ON public.digital_signatures(proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_sign_token ON public.proposals(sign_token) WHERE sign_token IS NOT NULL;
```

**Nota:** A tabela `contracts` NÃO será eliminada agora para manter backward compat. O código é que deixa de a usar.

### 2. Frontend — Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `src/pages/Contratos.tsx` | Reescrever para usar `proposals` (filtro por `contract_status IS NOT NULL`) |
| `src/components/contratos/ContratoForm.tsx` | Usar `proposals` em vez de `contracts` |
| `src/pages/SignContract.tsx` | `sign-contract` edge fn já retorna dados — frontend mantém-se quase igual |
| `src/components/AppSidebar.tsx` | Manter link "Contratos" (agora filtra proposals com contract_status) |
| `src/hooks/useDashboardData.ts` | `pendingContracts` → query `proposals` com `contract_status = 'pendente'` |
| `src/hooks/useFinancialDashboard.ts` | Receita por área: `financial_records.proposal_id → proposals.case_id` (eliminar salto via contracts) |

### 3. Backend — Edge Functions alteradas

| Ficheiro | Alteração |
|----------|-----------|
| `supabase/functions/proposal-accept/index.ts` | Em vez de `contracts.insert`, faz `proposals.update` com `contract_status: 'pendente'` |
| `supabase/functions/sign-contract/index.ts` | Buscar por `proposals.sign_token`, usar `proposals` em vez de `contracts` |
| `supabase/functions/signature-certificate/index.ts` | Buscar de `proposals` com `sign_token` ou `id` |
| `supabase/functions/payment-reminder/index.ts` | Usar `proposal_id` em vez de `contract_id → proposal_id` |
| `supabase/functions/import-access-data/index.ts` | Eliminar criação de contracts; usar `proposals` directamente com `contract_status` |
| `src/pages/Bitrix24App.tsx` | Actualizar referências a `contracts` para usar `proposals` com `contract_status` |

### 4. Fluxo actualizado

```text
Proposta criada (status: rascunho)
  → Enviada (status: enviada)
  → Aceita (status: aceita, contract_status: pendente, sign_token gerado)
  → Assinada (contract_status: assinado, signed_at preenchido)
  → Cancelada (contract_status: cancelado, cancel_reason, cancelled_at)
```

### Complexidade e Risco
- **Alto**: `import-access-data` e `Bitrix24App.tsx` têm lógica extensa com contracts
- **Médio**: Edge functions de assinatura
- **Baixo**: Dashboard hooks, sidebar

Recomendo implementar por partes: primeiro a migração SQL + edge functions core, depois o frontend.

