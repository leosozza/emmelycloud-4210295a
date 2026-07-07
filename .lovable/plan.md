## Objetivo
Corrigir o fluxo Emmely Pay para que, quando o link é gerado pelo robot ou pelo placement:
- a aba do Bitrix deixe de mostrar “Não gerada” para parcelas que já têm link;
- cada parcela gerada mostre o ícone/link e botão de copiar;
- a página pública `/pagamento/{token}` mostre as datas corretas;
- o campo do token Stripe seja preenchido no Deal para o template/automação.

## Diagnóstico confirmado
- Existem transações Stripe para o Deal `47047` em `payment_transactions`, mas elas foram criadas pelo robot sem `financial_record_id`.
- O placement monta as parcelas planejadas a partir dos campos Bitrix e, quando o plano difere das transações, substitui as transações geradas por linhas sintéticas. Por isso aparece “Não gerada”, mesmo havendo `payment_url`.
- O caminho do robot usa `payment-create`, não `payment-create-link`; hoje `payment-create` não grava o `stripe_token` extraído do link Stripe no campo `UF_CRM_EMMELY_STRIPE_TOKEN`.
- As datas da página pública dependem do plano/metadata disponível; as transações do robot não persistem `due_date` na metadata, então o relatório pode cair em datas calculadas/default.

## Plano de implementação

### 1. Persistir dados completos ao criar pagamento
Arquivo: `supabase/functions/payment-create/index.ts`
- Ao criar uma sessão Stripe, extrair o token do URL `/c/pay/...`.
- Gravar em `payment_transactions.metadata`:
  - `stripe_token`
  - `due_date`
  - `payment_url`
  - `is_down_payment`
  - `installment_number`
  - `total_installments`
- Atualizar o Deal no Bitrix com:
  - `UF_CRM_EMMELY_PAYMENT_URL`
  - `UF_CRM_EMMELY_TOKEN_PAY`
  - `UF_CRM_EMMELY_RELATORIO_PAY`
  - `UF_CRM_EMMELY_RECEIPT_URL`
  - `UF_CRM_EMMELY_STRIPE_TOKEN`
- Fazer o mesmo no caminho idempotente/reuso, extraindo o token do link já existente.

### 2. Corrigir o robot para escrever token e manter consistência
Arquivo: `supabase/functions/bitrix24-robot-handler/index.ts`
- Quando o robot gera ou reutiliza link, extrair o token Stripe de `firstPaymentUrl`/`reusedPaymentUrl`.
- Escrever `UF_CRM_EMMELY_STRIPE_TOKEN` no Deal junto com `UF_CRM_EMMELY_PAYMENT_URL`.
- Incluir o token também nos metadados das faturas inteligentes quando aplicável.
- Preservar o comportamento de timeline atual.

### 3. Fazer o placement juntar plano + transações reais
Arquivo: `supabase/functions/bitrix24-payment-tab/index.ts`
- Não substituir transações reais por parcelas sintéticas quando já existe `payment_url`.
- Selecionar o grupo de transações pendentes mais relevante do Deal e mesclar com o plano pelo par:
  - `is_down_payment`
  - `installment_number`
- Para cada parcela planejada, carregar da transação correspondente:
  - `transaction_id`
  - `payment_url`
  - `invoice_id`
  - `payment_method`
  - `status`
  - metadata
- Resultado esperado: parcela com link deixa de mostrar “Não gerada” e passa a mostrar “Link de pagamento” + copiar; parcela sem link continua com “Gerar cobrança”.

### 4. Corrigir datas na página pública
Arquivos:
- `supabase/functions/payment-receipt/index.ts`
- possivelmente `supabase/functions/_shared/deal-payment-fields.ts`

Ajustes:
- Ler transações `payment_transactions` do Deal e mesclar com o plano, igual ao placement.
- Usar `metadata.due_date` da transação quando existir; caso contrário usar a data planejada do Bitrix.
- Preservar o rótulo “Entrada” para entrada, em vez de mostrar tudo como “Parcela 1 de 1”.

### 5. Pequena correção visual no recibo público
Arquivo: `src/pages/PagamentoPublico.tsx`
- Adicionar suporte a `is_down_payment` no tipo da parcela.
- Mostrar “Entrada” quando a parcela for entrada; manter “Parcela X de Y” para saldo.

## Validação
- Abrir o Deal `47047` na aba Emmely Pay: parcelas geradas devem mostrar link + copiar, não “Não gerada”.
- Abrir `https://emmelycloud.pages.dev/pagamento/6ad71074-cf67-49d7-9376-fbefc28add39`: datas devem bater com o plano do Bitrix, incluindo entrada em `08/07/2026` quando configurada.
- Gerar link pelo robot novamente: o campo `UF_CRM_EMMELY_STRIPE_TOKEN` deve ser preenchido no Deal.
- Confirmar que o fluxo antigo de `payment-create-link` continua funcionando.