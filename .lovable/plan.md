
## Diagnóstico

**Problema 1 — "Stripe não configurado"**
A credencial existe em `integration_credentials` como `provider='stripe'`, `credential_key='STRIPE_SECRET_KEY'` (maiúsculas), mas `payment-create-link` (linha 297-299) procura `stripe_secret_pt`, `stripe_secret_br`, `stripe_secret` (minúsculas). Nenhuma corresponde → erro.

**Problema 2 — Só aparece 1 parcela em vez de 3**
Após o último teste, ficou 1 registo materializado em `financial_records` (parcela 1/3, deal 23855). Em `payment-receipt` (linha 141), assim que existe **qualquer** registo real, devolve **só** os reais e **deixa de gerar as sintéticas restantes (2/3 e 3/3)**. Resultado: o cliente vê apenas a parcela 1.

## Plano

### 1. Fix lookup de credenciais Stripe (`payment-create-link`)
Tornar a busca case-insensitive e adicionar `STRIPE_SECRET_KEY` à lista de chaves tentadas:
```ts
const candidates = ["stripe_secret_pt","stripe_secret_br","stripe_secret","STRIPE_SECRET_KEY"];
for (const k of candidates) {
  stripeKey = await getCredential(supabase, "stripe", k);
  if (stripeKey) break;
}
```
Se `getCredential` é case-sensitive, fazer um `ilike` direto à tabela como último fallback.

Aplicar o mesmo fix nas funções `payment-create`, `payment-webhook-stripe` e `bitrix24-payment-webhook` para consistência.

### 2. Fix merge de parcelas reais + sintéticas (`payment-receipt`)
Em vez de "se há reais, ignora sintéticas", **completar** o conjunto:
- Carregar `records` reais (1/3).
- Carregar dados do Bitrix24 (`totalCount=3`).
- Construir as 3 parcelas sintéticas, mas substituir cada slot pelo registo real quando `installment_number` corresponder.
- Resultado: 3 parcelas no UI — 1 real (com botão Pagar funcional) + 2 sintéticas (que serão materializadas ao clicar).

Pseudocódigo:
```ts
const realByNumber = new Map(records.map(r => [r.installment_number, r]));
const merged = Array.from({length: totalCount}, (_, i) => {
  const n = i + 1;
  return realByNumber.get(n) ?? buildSynthetic(n, ...);
});
```

### 3. Sem alterações no frontend
O `PagamentoPublico.tsx` já trata ids `synthetic-*` e ids reais de forma idêntica (passa o id ao `payment-create-link`).

## Resultado esperado

- O relatório do token `ac511cda-…` mostra **3 parcelas** (1 real pendente + 2 sintéticas).
- Ao clicar em "Pagar" em qualquer uma, o Stripe abre o checkout (credencial `STRIPE_SECRET_KEY` agora encontrada).
- A medida que cada parcela for paga ou materializada, vai sendo substituída no slot correto sem perder as outras.
