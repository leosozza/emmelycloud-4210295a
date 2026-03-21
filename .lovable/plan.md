

# Comprovante Permanente com Link Público — Controle de Parcelas

## Conceito

Cada contrato/deal terá um **link público permanente** que exibe o estado atualizado de todas as parcelas. Este link é gerado uma vez e atualizado automaticamente a cada baixa (manual ou automática).

```text
https://.../functions/v1/payment-receipt?token=abc123

┌───────────────────────────────────┐
│ EMMELY FERNANDES ADVOCACIA        │
│ Controle de Parcelas              │
│                                   │
│ Cliente: NOME                     │
│ Serviço: TIPO                     │
│                                   │
│ Parcela | Venc. | Valor | Juros   │
│         | Pago  | Status          │
│ ────────────────────────────────  │
│ 1/6     | PAGO  ✅                │
│ 2/6     | PEND  ⏳                │
│                                   │
│ 📥 Baixar PDF                     │
└───────────────────────────────────┘
```

## Implementação

### 1. Migração — Adicionar `receipt_token` à tabela `financial_records`

Adicionar coluna `receipt_token UUID DEFAULT gen_random_uuid()` à tabela `financial_records`. Isto dá a cada parcela um token, mas o comprovante será agrupado por `contract_id` (ou `bitrix24_deal_id`), usando o token de qualquer parcela do grupo como ponto de entrada.

Alternativa mais limpa: adicionar uma tabela `receipt_links` com:
- `id`, `token` (UUID único), `contract_id` ou `bitrix24_deal_id`, `client_name`, `deal_title`, `created_at`

Isto cria **um link por deal/contrato** que mostra todas as parcelas.

### 2. Edge Function — `payment-receipt` (nova)

**Ficheiro:** `supabase/functions/payment-receipt/index.ts`

- Recebe `?token=UUID` via GET
- Busca o `receipt_links` pelo token → obtém `contract_id` / `bitrix24_deal_id`
- Busca todas as `financial_records` desse contrato/deal, ordenadas por `installment_number`
- Para parcelas atrasadas, calcula juros usando a config de `payment_gateway_config` (gateway = `late_fees`)
- Gera HTML com o layout do comprovante (mesmo estilo do `generateReceipt()` já existente no payment-tab)
- Inclui botão "Baixar PDF" que dispara `window.print()`
- Sem autenticação necessária (link público)

### 3. Gerar link automaticamente

**Ficheiro:** `supabase/functions/payment-create/index.ts`

Após cada baixa (PATCH com status `confirmed`/`paid`):
- Verificar se já existe um `receipt_links` para o `contract_id`/`bitrix24_deal_id`
- Se não existe, criar um com token UUID
- O link é automaticamente atualizado porque é dinâmico (busca dados em tempo real)

**Ficheiro:** `supabase/functions/bitrix24-payment-tab/index.ts`

No fluxo de baixa manual (`confirmBaixa`):
- Após sucesso, verificar/criar `receipt_links`
- Mostrar o link no UI com opções: "Copiar Link" e "Baixar PDF"

### 4. UI no Bitrix24 Payment Tab

- Botão "📋 Link Comprovante" ao lado de cada deal — copia o link público
- Botão "📄 PDF" — abre o link com `?format=pdf` (que adiciona `@media print` e dispara impressão)
- Botão "📤 Enviar" — dropdown com opções: "Enviar Link" ou "Enviar PDF" (via WhatsApp)

### 5. UI no EmmeyPay (Financeiro.tsx)

Na tabela de parcelas, parcelas pagas mostram:
- Ícone de link clicável para o comprovante público
- Botão para copiar link ou enviar ao cliente

## Ficheiros a criar/editar

1. **Migração SQL** — criar tabela `receipt_links` (id, token, contract_id, bitrix24_deal_id, client_name, deal_title, created_at)
2. **`supabase/functions/payment-receipt/index.ts`** (novo) — renderização pública do comprovante
3. **`supabase/functions/payment-create/index.ts`** — auto-criar receipt_link após baixa
4. **`supabase/functions/bitrix24-payment-tab/index.ts`** — botões de link/PDF/enviar + criar receipt_link na baixa manual
5. **`src/pages/Financeiro.tsx`** — coluna com link do comprovante nas parcelas pagas

