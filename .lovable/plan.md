

## Diagnóstico

O fluxo quebrou em dois pontos críticos:

### Problema 1: Gerar Link não cria Smart Invoices
A função `generatePaymentLink` (payment-tab, linha 1087-1133) cria a transação no backend mas **não cria a Smart Invoice no Bitrix24**. Comparando com `submitInstallments` (linha 1044-1068) que faz `BX24.callMethod('crm.item.add', { entityTypeId: 31, ... })`, o `generatePaymentLink` simplesmente salta esse passo. Resultado: a transação fica sem `bitrix_invoice_id` na metadata.

### Problema 2: Webhook do Stripe não atualiza a Smart Invoice nem o Deal
Quando o pagamento é confirmado pelo Stripe:
- O webhook chama `notifyBitrix24DealPayment` que atualiza o `OPPORTUNITY` e adiciona comentário na timeline
- Mas **só marca a Smart Invoice como paga se `bitrix_invoice_id` existir na metadata** (linha 102) — que não existe porque o Problema 1 impede a criação
- O webhook **nunca move o Deal para uma etapa de "pagamento recebido"** — apenas reduz o valor do OPPORTUNITY

## Plano de Correção

### 1. Adicionar criação de Smart Invoice ao `generatePaymentLink`
**Ficheiro:** `supabase/functions/bitrix24-payment-tab/index.ts`

Após receber a resposta do `payment-create` com sucesso (linha 1119), adicionar a mesma lógica de `crm.item.add` que `submitInstallments` usa:
- Criar Smart Invoice com `entityTypeId: 31`, vinculada ao Deal via `parentId2`
- Atualizar a metadata da transação com o `bitrix_invoice_id` via PATCH ao `payment-create`

### 2. Mover o Deal para etapa "Pagamento Recebido" quando todas as parcelas estiverem pagas
**Ficheiro:** `supabase/functions/payment-webhook-stripe/index.ts`

Na função `notifyBitrix24DealPayment`, após atualizar o OPPORTUNITY:
- Verificar se o saldo em aberto é 0 (ou se todas as transações do grupo estão pagas)
- Se sim, mover o Deal para a etapa configurada (ex: `UF_CRM_EMMELY_PAID_STAGE` ou uma etapa WON do pipeline)
- Usar `crm.deal.update` com `STAGE_ID`

### 3. Usar etapa correcta para Smart Invoices pagas
O código actual (linha 115) faz fallback para `DT31_6:WON` que pode não existir. A memória do projeto indica que a etapa correcta é `DT31_3:P`. Corrigir o fallback.

## Ficheiros a editar

- `supabase/functions/bitrix24-payment-tab/index.ts` — adicionar criação de Smart Invoice ao `generatePaymentLink`
- `supabase/functions/payment-webhook-stripe/index.ts` — mover Deal para etapa paga e corrigir stage ID da Smart Invoice

