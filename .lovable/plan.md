

## Diagnóstico

O problema está na lógica de `createStripePayment` e no `bitrix24-payment-handler`. Quando o utilizador escolhe "pix" ou "multibanco":

1. A função `getStripePaymentMethods` recebe o método pedido mas **inclui sempre TODOS os métodos regionais** (ex: `["card", "multibanco", "mb_way", "sepa_debit"]` para EUR)
2. O método pedido é apenas "priorizado" (movido para o início da lista), mas os outros continuam lá
3. Se algum desses métodos não estiver ativado no Stripe Dashboard, o Stripe rejeita a sessão inteira
4. O fallback (linha 97-100) **cai silenciosamente para card-only**, ignorando completamente a escolha do utilizador

O resultado: o cliente recebe sempre um link de pagamento por cartão, independentemente da escolha.

## Correção

### 1. `payment-create/index.ts` — Respeitar o método escolhido

Alterar `getStripePaymentMethods` para:
- Se um método específico foi pedido (ex: `pix`, `multibanco`), devolver **apenas** `[requestedMethod, "card"]` (card como fallback)
- Se nenhum método foi pedido ou é `card`, manter o comportamento actual (todos os regionais)

Alterar o fallback para não cair em card-only silenciosamente — se o método pedido falhar, lançar erro claro dizendo que o método não está ativado no Stripe.

### 2. `bitrix24-payment-handler/index.ts` — Mesma lógica

Aplicar a mesma correção: quando `payment_method` é específico (pix, multibanco, mb_way, boleto, sepa_debit), enviar apenas esse método + card, em vez de todos os regionais.

Se o Stripe rejeitar, retornar erro explícito em vez de fallback silencioso.

## Ficheiros a alterar

| Ficheiro | Alteração |
|----------|-----------|
| `supabase/functions/payment-create/index.ts` | `getStripePaymentMethods`: método pedido → `[pedido, "card"]`; fallback com erro em vez de card-only |
| `supabase/functions/bitrix24-payment-handler/index.ts` | Mesma lógica de filtragem e erro explícito |

## Resultado esperado

- Utilizador escolhe "pix" → link Stripe abre com opção PIX (+ card)
- Utilizador escolhe "multibanco" → link Stripe abre com Multibanco (+ card)
- Se o método não estiver ativado no Stripe Dashboard → erro claro ("Ative Multibanco no painel Stripe")
- Sem fallback silencioso para card-only

