

## Cadastro de Empresas com Integração de Pagamento Própria

### Problema

Actualmente o sistema assume uma única entidade emissora. O utilizador tem 2-3 empresas (filiais) com CNPJs diferentes, e cada uma precisa da sua própria configuração de pagamento (chaves Stripe/Asaas diferentes). O robot precisa saber **qual empresa** está a emitir a cobrança.

### Plano

#### 1. Nova tabela `companies`

```sql
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  document_number text, -- CNPJ/NIF
  country text DEFAULT 'Portugal',
  currency text DEFAULT 'EUR',
  address text,
  city text,
  state text,
  postal_code text,
  phone text,
  email text,
  logo_url text,
  -- Payment gateway credentials (references to integration_credentials)
  stripe_credential_key text,    -- e.g. "stripe_pt_empresa1" → maps to integration_credentials
  asaas_credential_key text,     -- e.g. "asaas_empresa1"
  default_gateway text DEFAULT 'auto', -- auto, stripe_pt, stripe_br, asaas, direto
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
```

#### 2. Adicionar `company_id` na tabela `payment_transactions`

```sql
ALTER TABLE public.payment_transactions ADD COLUMN company_id uuid REFERENCES public.companies(id);
```

Isto permite saber qual empresa emitiu cada cobrança.

#### 3. Adicionar campo `company_id` no Robot `emmely_create_charge`

**`bitrix24-robot-handler`**: O robot recebe um novo parâmetro `company_id` (ou `COMPANY_ID`). Ao criar a cobrança, busca a empresa na tabela `companies`, obtém as credenciais de pagamento específicas dela (via `stripe_credential_key` / `asaas_credential_key`), e passa para o `payment-create` como `force_gateway` + credential override.

**`bitrix24-reregister-bot`**: Registar o novo campo `company_id` como propriedade do robot (tipo `string`, nome "Empresa").

#### 4. Actualizar `payment-create` para aceitar credential overrides

O `payment-create` passa a aceitar opcionalmente `credential_provider` e `credential_key` no body. Se presentes, usa essas credenciais em vez das padrão. Isto permite que cada empresa use as suas próprias chaves.

#### 5. UI de gestão de Empresas no `Bitrix24App.tsx`

Nova view "Empresas" no sidebar do iframe Bitrix24 com:
- Lista de empresas cadastradas (nome, CNPJ, gateway padrão)
- Formulário para criar/editar empresa (nome, razão social, CNPJ, moeda, gateway padrão)
- Campos para associar chaves de pagamento: seleccionar provider/key existentes na `integration_credentials` ou criar novos
- Botão activar/desactivar

#### 6. Payment Tab — exibir empresa na parcela

O `bitrix24-payment-tab` passa a mostrar o nome da empresa emissora em cada parcela (busca de `companies` pelo `company_id` da transacção).

### Ficheiros Afectados

| Ficheiro | Alteração |
|---|---|
| **Migração SQL** | Criar tabela `companies`, adicionar `company_id` em `payment_transactions` |
| `src/pages/Bitrix24App.tsx` | Nova view "Empresas" com CRUD; adicionar item no sidebar |
| `supabase/functions/bitrix24-robot-handler/index.ts` | Aceitar `company_id`, buscar empresa, passar credenciais ao `payment-create` |
| `supabase/functions/payment-create/index.ts` | Aceitar `credential_provider`/`credential_key` opcionais para override |
| `supabase/functions/bitrix24-reregister-bot/index.ts` | Registar campo `company_id` no robot |
| `supabase/functions/bitrix24-payment-tab/index.ts` | Exibir nome da empresa na parcela |

### Fluxo Resumido

```text
Robot emmely_create_charge
  │ company_id: "uuid-empresa-X"
  │ amount, installments, gateway...
  ▼
bitrix24-robot-handler
  │
  ├─ SELECT * FROM companies WHERE id = company_id
  │   → stripe_credential_key, asaas_credential_key, default_gateway
  │
  ├─ POST /payment-create
  │   { ..., company_id, credential_provider: "stripe_pt_empresa1",
  │     credential_key: "STRIPE_SECRET_KEY" }
  │
  └─ crm.invoice.add (com dados da empresa)

Payment Tab
  └─ Exibe: Empresa X | Parcela 1/5 | €200 | 02/04/2026
```

