

## Objetivo

Criar um **Link de Relatório de Pagamentos** que o cliente recebe e abre para ver todas as parcelas (pagas e em aberto) — com **botão "Pagar agora"** em cada parcela pendente que gera a cobrança Stripe on-demand. Disponibilizar também um **robot BizProc** que gera/recupera esse link e o salva no campo `UF_CRM_EMMELY_RECEIPT_URL` do deal, para depois ser enviado por WhatsApp.

## Estado actual (já existe)

- Tabela `receipt_links` com `token`, `contract_id`, `bitrix24_deal_id`, `client_name`, `deal_title`
- Edge function `payment-receipt` que renderiza HTML público com lista de parcelas, juros, status — **mas sem botão de pagar**
- Edge function `payment-create` que cria sessões Stripe (Multibanco/Pix/MB Way/cartão)
- Campo `UF_CRM_EMMELY_RECEIPT_URL` já mapeado no Bitrix (`bitrix24-install`)

## O que falta

### 1. Botão "Pagar" em cada parcela pendente (`payment-receipt`)

Em cada `<tr>` de parcela com status `pendente` ou `atrasada`, adicionar um botão verde **"💳 Pagar"** que:
- Chama `POST {SUPABASE}/functions/v1/payment-create-link` com `{ token, financial_record_id }`
- Recebe `{ payment_url }` e faz `window.location.href = payment_url`
- Mostra spinner enquanto aguarda

### 2. Nova edge function pública `payment-create-link` (sem JWT)

Endpoint público que:
- Recebe `{ token, financial_record_id, payment_method? }`
- Valida que o `financial_record_id` pertence ao `contract_id`/`bitrix24_deal_id` do `receipt_links` (segurança)
- Lê a parcela (`installment_value`, `due_date`, `description`, `currency`)
- Calcula juros/multa se atrasada (mesma lógica do `payment-receipt`)
- Chama internamente a lógica de `payment-create` (Stripe checkout) com:
  - `amount` = valor + juros
  - `description` = "Parcela X/Y — {deal_title}"
  - `payment_method` = método escolhido (default: deixa Stripe decidir entre métodos regionais)
- Devolve `{ payment_url, gateway_payment_id }`
- Grava `payment_url` no `financial_records.stripe_payment_id` para rastreio

Adicionar `[functions.payment-create-link] verify_jwt = false` ao `supabase/config.toml`.

### 3. Novo robot BizProc `emmely_send_payment_report`

Adicionar em `bitrix24-install/index.ts` (lista `repairRobots` e lista `robots`) e `bitrix24-robot-handler/index.ts` (switch `code`):

**Propriedades:**
- `deal_id` (obrigatório, default `{{ID}}`)
- `client_name`, `deal_title` (opcionais, para o cabeçalho do relatório)
- `send_method` — `none` | `link` (WhatsApp) | `whatsapp_with_button`
- `phone` (opcional, fallback para telefone do contacto da deal)
- `custom_message` (texto antes do link)

**Comportamento (`handleSendPaymentReport`):**
1. Faz `upsert` em `receipt_links` por `bitrix24_deal_id` — reusa token se já existir
2. Calcula `report_url = {FRONTEND}/functions/v1/payment-receipt?token={token}` (na verdade `{SUPABASE_URL}/functions/v1/payment-receipt?token={token}`)
3. Escreve o URL no campo `UF_CRM_EMMELY_RECEIPT_URL` da deal via `crm.deal.update`
4. Se `send_method === "link"`: envia mensagem WhatsApp com `custom_message + url`
5. Devolve `{ report_url, send_status, error }`

**Returns:** `report_url`, `send_status`, `error`

### 4. Pequena melhoria visual no `payment-receipt`

- Reorganizar a coluna "Status" para incluir o botão "Pagar" inline quando pendente/atrasada
- Adicionar pequeno aviso no topo: *"💳 Clique em 'Pagar' em qualquer parcela para gerar o link de cobrança imediatamente"*

## Ficheiros a alterar/criar

| Ficheiro | Ação |
|----------|------|
| `supabase/functions/payment-create-link/index.ts` | **Criar** — endpoint público para gerar Stripe checkout a partir de `financial_record_id` |
| `supabase/functions/payment-receipt/index.ts` | Adicionar botão "Pagar" + JS fetch para `payment-create-link` |
| `supabase/functions/bitrix24-robot-handler/index.ts` | Adicionar `handleSendPaymentReport` + case `emmely_send_payment_report` |
| `supabase/functions/bitrix24-install/index.ts` | Registar novo robot em ambas as listas (`repairRobots` e `robots`) |
| `supabase/config.toml` | Adicionar `[functions.payment-create-link] verify_jwt = false` |

## Resultado esperado

1. **Operador** arrasta o robot **"Emmely: Enviar Relatório de Pagamentos"** num pipeline ou aciona-o manualmente
2. Robot gera/reusa o link `https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/payment-receipt?token=...`
3. Link é gravado no campo `UF_CRM_EMMELY_RECEIPT_URL` da deal — pronto para ser referenciado em mensagens WhatsApp Oficial
4. Cliente abre o link → vê todas as parcelas (pagas/pendentes/atrasadas com juros)
5. Cliente clica **"Pagar"** numa parcela pendente → é redirecionado para Stripe Checkout com Multibanco/Pix/Cartão
6. Após pagar, webhook Stripe (`payment-webhook-stripe`) já reconcilia automaticamente

