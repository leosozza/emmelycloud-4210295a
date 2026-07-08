## Problema (Deal 47047)

Pagamento processado, `financial_records` marcado `paga` — mas no Deal Bitrix24 nada mudou:
1. Etapa do Deal continua em "Pagamento não realizado" (não avançou para `stage_on_paid`).
2. Smart Invoice (fatura) não mudou para estágio pago.
3. Campos UF do Deal (`UF_CRM_EMMELY_TOTAL_PAID`, `UF_CRM_EMMELY_PAYMENT_STATUS`, `OPPORTUNITY`) não foram atualizados.

## Causa raiz

Em `supabase/functions/payment-webhook-stripe/index.ts`:

- As `payment_transactions` criadas pelo robot têm `gateway_payment_id = cs_live_…` (checkout session id) e carregam a metadata completa (`stage_on_paid`, `bitrix_invoice_id`, `installment_group_id`, `paid_flow_id`, `bitrix_deal_id`).
- Quando chega o webhook `payment_intent.succeeded`, o código converte `gatewayPaymentId` para `pi_…` (linha 320) e faz match por esse id — **não encontra** a tx do robot.
- O fallback por `session_id` (linhas 339–360) só corre para `checkout.session.*`, não para `payment_intent.*`.
- Cai no **orphan reconciliation** (linhas 446–476): cria uma nova tx sem os metadados do robot e marca o FR `paga`, mas **não chama** `notifyBitrix24DealPayment` — essa chamada (linhas 479–522) está restrita a `if (tx && newStatus === "confirmed")`, e `tx` é `null` no caminho orphan.

Resultado: FR fica paga, Deal e Smart Invoice ficam intocados no Bitrix.

Confirmado na base: tx `9c80b918-…` (cs_live_a1Z0s3d0…, deal 47047, `is_down_payment=true`, com `stage_on_paid`, `bitrix_invoice_id=10671`, etc.) continua `pending`; o FR `bc6fb932-…` está `paga` com `stripe_payment_id=pi_3TqgfH…` — foi marcado via orphan.

## Plano de correção

**Ficheiro único:** `supabase/functions/payment-webhook-stripe/index.ts`.

### 1. Fallback por `checkout_session_id` em eventos `payment_intent.*`

Depois do primeiro match por `pi_…` falhar (e antes do orphan path), ler `eventObject.metadata.checkout_session_id` e procurar `payment_transactions` por `gateway_payment_id = cs_…` com `gateway LIKE 'stripe%'`. Se encontrar:
- atualizar `gateway_payment_id` para o `pi_…`,
- reutilizar como `existingTx` — preservando toda a metadata original do robot.

Assim as parcelas criadas pelo robot deixam de cair no caminho orphan e o bloco de notificação Bitrix passa a executar.

### 2. Garantir que `payment-create` propaga `checkout_session_id` para o PaymentIntent

Verificar em `supabase/functions/payment-create/index.ts` que, ao criar a Stripe Checkout Session, é passado `payment_intent_data.metadata.checkout_session_id` (com o próprio `cs_…`) e também `bitrix24_deal_id`, `bitrix24_invoice_id`, `financial_record_id`, `installment_number`, `stage_on_paid`. Sem isso, o fallback #1 não tem por onde ligar.

Se a Checkout Session não permitir preencher o `cs_…` no próprio metadata pré-criação, escrever esses campos no `metadata` da session ao criar e no `payment_intent_data.metadata` também — o webhook lê `eventObject.metadata` que inclui os dois.

### 3. Reforço: chamar `notifyBitrix24DealPayment` também no caminho orphan

Como cinto+suspensórios, no bloco orphan (linhas 446–476), depois de marcar o FR como paga, construir um `txMeta` sintético a partir de `eventObject.metadata` e do próprio `financial_record` (buscar `bitrix24_deal_id` e `bitrix24_invoice_id` no FR) e invocar `notifyBitrix24DealPayment` + o bloco de badge (524–571). Assim, mesmo se a metadata da tx original se perder por qualquer razão, o Deal ainda avança.

### 4. Correção manual do histórico do Deal 47047

Via `supabase--insert`:
- `UPDATE payment_transactions SET status='confirmed', financial_record_id='bc6fb932-…' WHERE id='9c80b918-…'`
- Depois chamar manualmente `bitrix24-sync-invoice-status` (`bitrix24_invoice_id=10671`, `new_status='paga'`) e/ou fazer `crm.deal.update` direto para avançar `STAGE_ID` para `WON` (`stage_on_paid` da metadata) e preencher `UF_CRM_EMMELY_TOTAL_PAID=5`, `UF_CRM_EMMELY_PAYMENT_STATUS=Pago`, `OPPORTUNITY=0`.

## Validação

- Novo Deal de teste com robot → após pagar:
  - tx original passa a `confirmed` (sem row órfã).
  - FR marcado `paga`.
  - Deal avança para `stage_on_paid` no Bitrix.
  - Smart Invoice muda para estágio pago.
  - Badge "Pagamento Confirmado" aparece na timeline.
- Deal 47047 (após correção manual): pipeline avança para "Fechar negócio", fatura fica em estágio pago.
