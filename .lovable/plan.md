

## Métodos de Pagamento por Região no Stripe

### Problema Atual
A função `createStripePayment` em `payment-create/index.ts` usa sempre a mesma lista fixa de métodos de pagamento (`card, sepa_debit, multibanco, mb_way, ideal, bancontact, sofort, klarna, link`), independentemente da região. O mesmo acontece em `bitrix24-payment-handler/index.ts`.

Quando o robot escolhe **Stripe PT**, deve aceitar métodos portugueses. Quando escolhe **Stripe BR**, métodos brasileiros.

### Plano

**1. Alterar `createStripePayment` em `payment-create/index.ts`**
- Adicionar parâmetro `region?: "pt" | "br" | null`
- Selecionar métodos de pagamento com base na região:

```text
stripe_pt → card, multibanco, mb_way, sepa_debit, link
stripe_br → card, boleto, pix, link
fallback  → card, sepa_debit, multibanco, mb_way, link (actual behavior)
```

- Passar `stripeRegion` na chamada: `createStripePayment(stripeKey, amount, currency, email, description, returnUrl, stripeRegion)`

**2. Alterar `bitrix24-payment-handler/index.ts`**
- Aplicar a mesma lógica regional na secção Stripe (linhas ~170-220)
- Métodos PT: `card, multibanco, mb_way, sepa_debit, link`
- Métodos BR: `card, boleto, pix, link`

### Ficheiros a Modificar
| Ficheiro | Alteração |
|---|---|
| `supabase/functions/payment-create/index.ts` | Adicionar parâmetro `region` a `createStripePayment`, lógica de métodos por região |
| `supabase/functions/bitrix24-payment-handler/index.ts` | Métodos de pagamento regionalizados na secção Stripe |

