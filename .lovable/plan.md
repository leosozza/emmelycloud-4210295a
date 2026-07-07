## Objetivo

Unificar a geração de parcelas em **`payment-receipt`**, **`bitrix24-payment-tab`** (placement) e **`bitrix24-robot-handler`** para lerem exatamente os mesmos campos do deal e produzirem exatamente a mesma lista (Entrada + Parcelas), corrigindo o caso do deal 45807 no link público `payment-receipt?token=799e3b72…`.

## Causa raiz

`payment-receipt/fetchBitrixDealAmount()` lê apenas `UF_CRM_EMMELY_TOTAL_INSTALLMENTS / INSTALLMENT_VALUE / NEXT_DUE_DATE / PAID_INSTALLMENTS` e ignora os campos de Entrada (`UF_CRM_EMMELY_DOWN_PAYMENT`, `DOWN_INSTALLMENTS`, `DOWN_METHOD`, `DOWN_FIRST_DUE`, `DOWN_INTERVAL`). O placement e o robot já leem esses campos via `_shared/deal-payment-fields.ts::readEmmelyPaymentPlan`, mas cada um tem a sua própria função de expansão.

## Alterações

### 1. `supabase/functions/_shared/deal-payment-fields.ts` (novo helper)

Adicionar `expandPlanToInstallments(plan, opts?)` que devolve `InstallmentRow[]` no formato consumido tanto pelo placement como pelo receipt:

```
{ number, total, value, currency, due_date, status, is_down_payment, description }
```

Regras (idênticas às do placement hoje):
- Se `plan.downPayment > 0` e `downInstallments >= 1`: adiciona `downInstallments` linhas `is_down_payment: true` (número 1..downInstallments dentro do grupo) com vencimentos a partir de `downFirstDue` em passos de `downInterval` dias.
- Adiciona `remainingInstallments` linhas de saldo com vencimentos a partir de `firstDue` em passos de `interval` dias.
- Marca `status: "paga"` para as primeiras `paidInstallments` linhas de saldo (ou também para a entrada, se `paidInstallments` cobrir).
- Valores: `downPayment / downInstallments` para entrada; `(total - downPayment) / remainingInstallments` para saldo, arredondado a 2 casas.

### 2. `supabase/functions/payment-receipt/index.ts`

- Remover `fetchBitrixDealAmount` local.
- Substituir por `readEmmelyPaymentPlan` + `expandPlanToInstallments` (via `_shared`).
- Manter a precedência atual: se existirem `financial_records` reais para o `contract_id`/`deal_id`, elas continuam a sobrescrever as sintéticas por `installment_number`; só as slots sem registro real usam o sintético expandido do plano.
- `total_value = plan.totalAmount` (ou soma das reais, se existirem e cobrirem todos os slots).
- Continuar servindo JSON e o redirect HTML iguais.

### 3. `supabase/functions/bitrix24-payment-tab/index.ts`

- Substituir `paymentPlanFromDeal` + `buildSyntheticInstallmentsFromPlan` locais por chamadas a `readEmmelyPaymentPlan` + `expandPlanToInstallments`.
- Adaptador fino para converter `InstallmentRow[]` do shared no tipo `InstallmentData` do placement (mesmos campos + `id: "deal-<n>"` para linhas sintéticas). Nenhuma mudança de UI.

### 4. `supabase/functions/bitrix24-robot-handler/index.ts`

- Já usa `readEmmelyPaymentPlan`. Sem mudança funcional. Confirmar que a geração de cobranças continua a bater com o mesmo shape após o refactor do payment-tab (é o mesmo `plan` object).

## Fora de escopo

- Alterar UI do placement ou da página `/pagamento/:token` (a mudança é só na fonte de dados).
- Alterar tabelas ou campos custom do Bitrix24.
- Alterar comportamento das transações reais (`payment_transactions` / `financial_records`) — apenas o merge continua igual.

## Como validar

1. Após deploy, abrir `https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/payment-receipt?token=799e3b72-833b-49b2-8c34-115f6852b7c1&format=json` e conferir que devolve `installments` com 2 linhas: `{ is_down_payment: true, value: 10, ... }` + `{ is_down_payment: false, number: 1, total: 1, value: 10, ... }`, batendo com o placement.
2. Abrir a aba Emmely Pay do deal 45807 e conferir que a lista continua igual.
3. Rodar o robô de gerar cobrança no deal 45807 e conferir que o número/valor das parcelas geradas é o mesmo.
