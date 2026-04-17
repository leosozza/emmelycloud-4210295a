
## Diagnóstico

O erro `Método "undefined" não está activado` tem duas causas combinadas em `payment-create-link`:

1. **Frontend não envia `payment_method`** — `PagamentoPublico.tsx` (linha 92) chama `payment-create-link` apenas com `{ token, financial_record_id }`. O backend recebe `payment_method = undefined`.
2. **Mensagem de erro mal formatada** — quando o Stripe responde com erro do tipo "payment method type provided", o backend faz:
   ```ts
   `Método "${payment_method}" não está activado.`
   ```
   Como `payment_method` é `undefined`, o utilizador vê literalmente `"undefined"`.
3. **Causa real do erro Stripe** — a conta Stripe (PT) tem `card` desativado (visto no teste anterior, onde só `multibanco` funcionou). Como o frontend não escolhe método, o backend usa `getStripePaymentMethods("EUR", undefined)` que devolve `["card","multibanco","mb_way","sepa_debit"]`. O Stripe rejeita logo no primeiro (`card`) que não está ativo.

## Plano

### 1. Filtrar métodos rejeitados em vez de mostrar "undefined" (`payment-create-link`)
Quando o Stripe devolve erro do tipo "payment method type", **extrair o método real** da mensagem do Stripe (ex.: `The payment method type "card" is not activated...`) com regex e:
- Se houver outros métodos na lista, reenviar o request **sem** o método rejeitado (até 1 retry).
- Se não restar nenhum, devolver mensagem clara: `Nenhum método de pagamento ativo na conta Stripe para EUR. Active card / multibanco / mb_way no painel.`

### 2. Skip silencioso de `card` quando a conta não o suporta
Adicionar uma lista de métodos "conhecidos como inativos" cacheada em memória da função (por currency). Na primeira falha do Stripe extraída do retry acima, marcar esse método como inativo durante o lifetime do worker. Próximas chamadas já saem sem ele.

### 3. Frontend: permitir escolha explícita de método (opcional mas útil)
Em `PagamentoPublico.tsx`, mostrar 2-3 botões de método consoante a moeda (EUR → Multibanco / MB Way / SEPA; BRL → Cartão / Pix / Boleto) e enviar `payment_method` no body. Assim o utilizador escolhe e o backend só tenta esse método.

### 4. Mensagem de erro robusta
Mesmo no caminho atual, substituir a interpolação por:
```ts
const offending = msg.match(/payment method type "?([a-z_]+)"?/i)?.[1] ?? payment_method ?? "(desconhecido)";
```
Resultado: `Método "card" não está activado. Active-o no painel Stripe.`

## Resultado esperado

- Sem mais "undefined" em mensagens de erro.
- Pagamento abre automaticamente no primeiro método ativo da conta (ex.: `multibanco`) sem intervenção do utilizador.
- Se o utilizador quiser, pode escolher explicitamente o método nos botões.
- Mensagens de erro identificam o método real que falhou.

## Ficheiros afetados

- `supabase/functions/payment-create-link/index.ts` — retry com filtro de método + mensagem corrigida.
- `src/pages/PagamentoPublico.tsx` — seletor de método de pagamento (opcional).
