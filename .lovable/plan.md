## Diagnóstico do deal 45807

- O link `payment-receipt?token=799e3b72…` foi criado e aberto uma vez pelo cliente.
- **Nenhuma chamada a `payment-create-link` ficou registrada** — logo, o Stripe Checkout do MBWay usado pelo cliente não foi originado a partir do nosso backend, ou o log já expirou (retenção curta).
- Existem apenas 2 transações **sintéticas** (`gateway=direto`, `pending`) no `payment_transactions`, sem vínculo com o `financial_records` (id `34a35549…`, invoice 10625, €5, `pendente`).
- Sem `financial_record_id` na transação, mesmo que o webhook Stripe tivesse chegado, ele não teria conseguido dar baixa no financeiro.

## 1. Correção imediata do deal 45807

Preciso do **ID do pagamento no Stripe** (algo como `pi_…` ou `cs_…`, disponível no painel Stripe filtrando por MBWay, valor €5 e cliente Ailson, ontem 02/07).

Com esse ID vou:
- Verificar via API do Stripe se realmente está `succeeded`.
- Criar a transação Stripe correspondente em `payment_transactions` (gateway `stripe_pt`, `status='confirmed'`, `gateway_payment_id` = o `pi_…`, `financial_record_id` = `34a35549…`).
- Marcar o `financial_records` como `paga`, `paid_at` = data do pagamento no Stripe.
- Disparar sync para Bitrix (a `sync_invoice_status_to_bitrix` já cobre isso automaticamente após o UPDATE).
- Remover/consolidar as duas linhas sintéticas duplicadas.

Se não tiver o ID do Stripe à mão mas tiver certeza do recebimento, posso dar baixa manual sem consulta ao Stripe (menos rastreável, mas o financeiro fica correto).

## 2. Correções estruturais para não repetir

### 2a. Vincular sempre `financial_record_id` na transação
- Em `payment-create-link` (público) e `payment-create` (iframe): quando houver `bitrix_deal_id` + `installment_number`/`due_date`, resolver o `financial_records.id` correspondente **antes** de criar o Checkout Stripe, e persistir `financial_record_id` na linha nova de `payment_transactions`.
- Também gravar `bitrix_deal_id`, `installment_number`, `financial_record_id` no `metadata` do Checkout Stripe (fallback para o webhook).

### 2b. Fallback no webhook `payment-webhook-stripe`
- Se `tx.financial_record_id` estiver `null`, resolver pelo `metadata.bitrix_deal_id` + `installment_number` (ou pelo `installment_group_id`) e atualizar o `financial_records` mesmo assim.
- Log claro quando não conseguir casar, para diagnóstico.

### 2c. Verificar o Webhook Stripe da conta PT
- Confirmar que o endpoint `payment-webhook-stripe` está registrado no dashboard Stripe PT com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded` (o `async_payment_succeeded` é o que dispara para MBWay, que é assíncrono).
- Sem ele registrado, nenhum pagamento MBWay atualizará automaticamente.

### 2d. Botão "Gerar cobrança" na aba Emmely Pay
- Ao clicar, converter a linha sintética `direto/pending` para a transação Stripe real (mesmo `financial_record_id`), mostrar link para copiar/abrir, em vez de manter a linha `direto` órfã.

## Detalhes técnicos

- Arquivos a alterar: `supabase/functions/payment-create-link/index.ts`, `supabase/functions/payment-create/index.ts`, `supabase/functions/payment-webhook-stripe/index.ts`, `supabase/functions/bitrix24-payment-tab/index.ts`.
- Eventos MBWay no Stripe: `checkout.session.async_payment_succeeded` (sucesso) e `checkout.session.async_payment_failed` (falha).
- Nenhuma migração de schema é necessária — os campos já existem (`payment_transactions.financial_record_id`, `metadata jsonb`).

## Validação

- Simular um `checkout.session.async_payment_succeeded` no webhook e conferir que `financial_records` do deal 45807 vira `paga` e aparece em Financeiro.
- Gerar um novo link de teste, pagar em modo sandbox com MBWay, e confirmar que o registro atualiza sozinho.

## O que preciso de você agora

1. **ID do pagamento no Stripe** para o deal 45807 (`pi_…` ou `cs_…`) — ou confirmação de que quer baixa manual sem consultar Stripe.
2. Confirmar se posso **checar/registrar o webhook** no dashboard Stripe PT (se você não tiver certeza que está configurado com `async_payment_succeeded`, o MBWay silenciosamente falha sempre).
