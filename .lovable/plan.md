

## Plano: Normalizar dados do cliente, unificar proposals+contracts e vincular serviços ao Bitrix

Este é um refactoring estrutural significativo que afecta ~15 ficheiros. Proponho dividir em **3 fases** para reduzir risco.

---

### Fase 1 — Leads usam nome do client vinculado

**Problema**: `leads.name` duplica `clients.name`. O lead já tem `client_id` FK.

**Alteração**: No frontend (Leads, Dashboard, etc.), quando `client_id` está presente, buscar o nome via join em vez de usar `leads.name` directamente. Não remover a coluna `name` (necessária para leads sem cliente vinculado).

**Ficheiros**:
- `src/pages/Leads.tsx` — select com join: `.select("*, clients(name)")`, exibir `lead.clients?.name || lead.name`
- `src/components/leads/LeadCard.tsx`, `LeadSheet.tsx`, `LeadListView.tsx` — usar nome do client quando disponível
- `src/components/leads/LeadKanbanBoard.tsx` — idem

---

### Fase 2 — Adicionar `bitrix24_id` à tabela `services`

**Migração SQL**:
```sql
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS bitrix24_id text;
CREATE INDEX IF NOT EXISTS idx_services_bitrix24_id ON public.services(bitrix24_id) WHERE bitrix24_id IS NOT NULL;
```

**Backend** (`import-access-data`):
- Na sincronização, ao criar/encontrar produto no Bitrix24 via `crm.product.list`/`crm.product.add`, guardar o ID retornado em `services.bitrix24_id`.

**Frontend** (`src/pages/Servicos.tsx`):
- Mostrar coluna "ID Bitrix" na tabela de serviços (read-only).

---

### Fase 3 — Unificar `proposals` + `contracts` (mais complexo)

**Contexto actual**:
- `proposals` → status: rascunho → enviada → aceita → recusada/expirada
- `contracts` → status: pendente → assinado → cancelado
- `contracts` tem FK para `proposals` (1:1) e `cases`
- `financial_records` tem FK para `contracts`
- `digital_signatures` tem FK para `contracts`
- `payment_transactions` tem FK para `contracts`

**Abordagem**: Absorver os campos de `contracts` na tabela `proposals`, adicionando novos status e colunas. Isto evita quebrar as relações existentes.

**Migração SQL**:
```sql
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
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric;

-- Migrar dados existentes de contracts para proposals
UPDATE public.proposals p
SET 
  contract_status = c.status::text,
  file_url = c.file_url,
  starts_at = c.starts_at,
  expires_at = c.expires_at,
  signed_at = c.signed_at,
  sign_token = c.sign_token,
  signer_name = c.signer_name,
  signer_email = c.signer_email,
  signer_phone = c.signer_phone,
  notes = c.notes,
  cancelled_at = c.cancelled_at,
  cancel_reason = c.cancel_reason,
  refund_amount = c.refund_amount
FROM public.contracts c
WHERE c.proposal_id = p.id;

-- Redirecionar FKs de financial_records, digital_signatures, payment_transactions
-- para proposals (via proposal_id já existente em financial_records→contract→proposal)
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES proposals(id);
UPDATE public.financial_records fr SET proposal_id = c.proposal_id FROM public.contracts c WHERE fr.contract_id = c.id;

ALTER TABLE public.digital_signatures ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES proposals(id);
UPDATE public.digital_signatures ds SET proposal_id = c.proposal_id FROM public.contracts c WHERE ds.contract_id = c.id;
```

**Frontend** (9+ ficheiros):
- Eliminar página `Contratos.tsx` ou transformá-la num filtro dentro de `Propostas.tsx` (aba "Contratos" = proposals com status aceita + contract_status)
- `ContratoForm.tsx` → integrar em `PropostaForm.tsx`
- `SignContract.tsx`, `sign-contract/index.ts`, `signature-certificate/index.ts`, `proposal-accept/index.ts` → usar `proposals` em vez de `contracts`
- `financial_records` → usar `proposal_id` em vez de `contract_id`
- Hooks: `useFinancialDashboard.ts`, `useDashboardData.ts` → actualizar queries

**Nota**: A tabela `contracts` não será eliminada imediatamente (backward compat), mas todo o código novo usará `proposals`.

---

### Ficheiros afectados (total ~15)

| Fase | Ficheiro | Tipo |
|------|----------|------|
| 1 | `src/pages/Leads.tsx` | Edit |
| 1 | `src/components/leads/LeadCard.tsx` | Edit |
| 1 | `src/components/leads/LeadListView.tsx` | Edit |
| 1 | `src/components/leads/LeadKanbanBoard.tsx` | Edit |
| 2 | Migração SQL (services) | Novo |
| 2 | `supabase/functions/import-access-data/index.ts` | Edit |
| 2 | `src/pages/Servicos.tsx` | Edit |
| 3 | Migração SQL (unificação) | Novo |
| 3 | `src/pages/Propostas.tsx` | Edit (major) |
| 3 | `src/pages/Contratos.tsx` | Remove/Redirect |
| 3 | `src/pages/SignContract.tsx` | Edit |
| 3 | `supabase/functions/sign-contract/index.ts` | Edit |
| 3 | `supabase/functions/proposal-accept/index.ts` | Edit |
| 3 | `supabase/functions/signature-certificate/index.ts` | Edit |
| 3 | `src/hooks/useFinancialDashboard.ts` | Edit |
| 3 | `src/hooks/useDashboardData.ts` | Edit |
| 3 | `src/App.tsx` (rotas) | Edit |

### Recomendação
Dada a complexidade, sugiro implementar **Fase 1 + Fase 2** agora (baixo risco), e a **Fase 3** (unificação proposals+contracts) num segundo momento com testes cuidadosos. Aprova esta abordagem?

