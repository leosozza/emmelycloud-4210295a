

## Revisão Completa do Fluxo de Pagamento com Mapeamento de Campos Bitrix24

### Contexto Atual

O sistema atual tem:
1. **`bitrix24-payment-tab`** — Placement CRM que mostra parcelas e permite criar cobranças manualmente dentro do Bitrix24
2. **`bitrix24-payment-handler`** — Handler de checkout nativo do Bitrix24
3. **`bitrix24-worker` → `handleDealUpdate`** — Auto-cobrança ao fechar deal (ONCRMDEALUPDATE)
4. **Configuração de campos** — Na `PagamentosView` do `Bitrix24App.tsx`, com inputs manuais de texto para campo gateway, valor, moeda, stage
5. **`FieldMappingManager`** — Mapeamento visual existente para sincronização de dados Lead/Deal ↔ Supabase
6. **`BitrixFieldSelector`** — Componente dropdown que busca campos do Bitrix24 via `bitrix24-fields` edge function

### O que o Utilizador Quer

Um fluxo de pagamento completo onde:
1. Um **webhook externo** é chamado com o `deal_id` do Bitrix24
2. O sistema vai ao Bitrix24, busca todos os dados do deal usando **campos mapeados** (configuráveis)
3. Cria parcelas com: número da parcela, valor total, valor de cada parcela, data de vencimento
4. O **Payment Tab (Placement)** exibe tudo correctamente
5. A **configuração de mapeamento** usa o `BitrixFieldSelector` (dropdown com lista real de campos do Bitrix) em vez de inputs de texto manuais

### Plano de Implementação

---

#### 1. Substituir inputs manuais por `BitrixFieldSelector` na configuração de pagamento

**Ficheiro:** `src/pages/Bitrix24App.tsx` (PagamentosView, linhas ~1858-1874)

Actualmente os campos `deal_gateway_field`, `deal_amount_field`, `deal_currency_field` são inputs de texto livre. Substituir por `BitrixFieldSelector` com `entity="deal"` para que o utilizador seleccione de uma lista real de campos do Bitrix24.

Adicionar novos campos mapeáveis:
- `deal_installments_field` — campo do Bitrix que contém o número de parcelas
- `deal_down_payment_field` — campo do Bitrix que contém o valor de entrada
- `deal_first_due_date_field` — campo do Bitrix que contém a data do 1º vencimento
- `deal_interval_days_field` — campo do Bitrix que contém o intervalo entre parcelas (default 30)
- `deal_customer_name_field` — campo do Bitrix para nome do cliente (ou buscar do contacto)
- `deal_customer_email_field` — campo do Bitrix para email
- `deal_customer_cpf_field` — campo do Bitrix para CPF/CNPJ

---

#### 2. Criar Edge Function `bitrix24-payment-webhook`

**Ficheiro:** `supabase/functions/bitrix24-payment-webhook/index.ts`

Endpoint que recebe `POST { deal_id }` e:

1. Busca a integração Bitrix24 activa
2. Lê a configuração de mapeamento de campos de pagamento da `bitrix24_integrations.config`
3. Chama `crm.deal.get` com o `deal_id` recebido
4. Extrai os valores usando os campos mapeados:
   - Valor total (`OPPORTUNITY` ou campo custom)
   - Moeda (`CURRENCY_ID` ou campo custom)
   - Gateway (campo custom)
   - Número de parcelas (campo custom)
   - Entrada (campo custom)
   - Data 1º vencimento (campo custom)
   - Intervalo dias (campo custom, default 30)
5. Busca dados do contacto do deal (nome, email, telefone, CPF)
6. Calcula as parcelas (lógica idêntica à do `bitrix24-payment-tab`)
7. Para cada parcela, chama `payment-create`
8. Opcionalmente cria Smart Invoices no Bitrix24 (entityTypeId 31) para cada parcela
9. Retorna JSON com lista de transações criadas

**Config no `supabase/config.toml`:**
```toml
[functions.bitrix24-payment-webhook]
verify_jwt = false
```

---

#### 3. Actualizar o `bitrix24-payment-tab` para exibir dados correctamente

O tab já funciona bem — busca transações por `metadata.bitrix_deal_id`. A nova edge function `bitrix24-payment-webhook` vai criar transações com a mesma estrutura de metadata, logo o tab continuará a funcionar sem alterações.

Pequena melhoria: garantir que o tab mostra correctamente `due_date` das parcelas (actualmente usa `created_at` como fallback). Ajustar para usar `metadata.due_date` quando disponível.

---

#### 4. Actualizar `bitrix24-worker` `handleDealUpdate` para usar os novos campos

**Ficheiro:** `supabase/functions/bitrix24-worker/index.ts`

Reutilizar a mesma lógica do webhook: ler campos mapeados da config, calcular parcelas, criar transações. Pode chamar directamente o novo `bitrix24-payment-webhook` internamente.

---

### Ficheiros Afectados

| Ficheiro | Alteração |
|---|---|
| `src/pages/Bitrix24App.tsx` | Substituir inputs por `BitrixFieldSelector`, adicionar novos campos de mapeamento |
| `supabase/functions/bitrix24-payment-webhook/index.ts` | **Novo** — Webhook que recebe deal_id e cria parcelas |
| `supabase/functions/bitrix24-payment-tab/index.ts` | Pequeno ajuste para mostrar `due_date` da metadata |
| `supabase/functions/bitrix24-worker/index.ts` | Usar novos campos de parcelas na auto-cobrança |
| `supabase/config.toml` | Adicionar config do novo webhook |

### Fluxo Resumido

```text
Bitrix24 BizProc / Webhook
        │
        ▼
POST /bitrix24-payment-webhook { deal_id: 123 }
        │
        ├─ crm.deal.get(123)
        │   └─ Extrai campos mapeados (valor, parcelas, gateway, datas...)
        │
        ├─ crm.contact.get(CONTACT_ID)
        │   └─ Nome, Email, CPF
        │
        ├─ Calcula parcelas (entrada + N parcelas)
        │
        ├─ Para cada parcela:
        │   ├─ POST /payment-create (Stripe/Asaas/Direto)
        │   └─ crm.item.add (Smart Invoice entityTypeId=31)
        │
        └─ Retorna { ok, transactions: [...] }

Payment Tab (Placement CRM)
        │
        └─ Busca transactions WHERE metadata.bitrix_deal_id = entityId
            └─ Exibe: Parcela X/N | Valor | Vencimento | Status | Ações
```

