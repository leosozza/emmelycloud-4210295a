

# Fix: Fallback Stripe usa pk_ key global

## Problema
A cadeia de fallback no `payment-create` (linhas 561-574) tenta 4 providers em sequência. Quando nenhum `force_gateway` regional é especificado, o último fallback é `stripe` → `STRIPE_SECRET_KEY`, que contém uma `pk_live_` key. As chaves `stripe_pt` e `stripe_br` estão correctas com `sk_live_`.

## Solução (2 alterações)

### 1. `supabase/functions/payment-create/index.ts`
Na cadeia de fallback (linhas 561-574), após cada `getCredential`, verificar se a key retornada começa com `pk_` e tratá-la como `null` (forçar continuar a cadeia ou falhar com mensagem clara):

```typescript
// After each getCredential call, reject pk_ keys
if (stripeKey?.startsWith("pk_")) stripeKey = null;
```

Isto garante que mesmo que a credencial global tenha `pk_`, o sistema nunca a usa e dá erro claro.

### 2. `supabase/functions/payment-create/index.ts` — default region
Quando `currency === "EUR"` e não há `force_gateway`, auto-detectar `stripeRegion = "pt"` como default para clientes europeus, evitando o fallback global:

Na lógica de auto-detection (linhas 533-540), adicionar:
```typescript
if (gateway === "stripe" && !stripeRegion) {
  if (currency === "EUR") stripeRegion = "pt";
  else if (currency === "BRL") stripeRegion = "br";
}
```

### Ficheiros
1. `supabase/functions/payment-create/index.ts` — rejeitar pk_ keys no fallback + auto-region por moeda

