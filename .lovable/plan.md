

# Separar Correctamente Provedores Stripe e Asaas

## Problema

Existem 3 pontos onde a selecção de gateway é incorrecta:

1. **`bitrix24-payment-handler`** (linha 125) — decide gateway apenas pela moeda (`BRL=asaas, resto=stripe`), ignorando completamente o campo `UF_CRM_EMMELY_GATEWAY` do deal
2. **`payment-create`** — a função `getGateway()` (linha 19) faz o mesmo fallback por moeda, ignorando a selecção explícita quando `force_gateway` não é enviado
3. **`payment-create`** — quando `force_gateway` é um label resolvido como `"Stripe PT"` em vez do código `"stripe_pt"`, cai no `else` genérico (linha 516) e usa a chave errada

## Alterações

### Ficheiro 1: `supabase/functions/payment-create/index.ts`

**a)** Adicionar função de validação de chave Stripe (`validateStripeKey`) que rejeita chaves `pk_`:
```typescript
if (stripeKey.startsWith("pk_")) {
  return error("A chave configurada é uma Publishable Key (pk_). Configure a Secret Key (sk_).");
}
```

**b)** Normalizar `force_gateway` para aceitar variantes de texto (case-insensitive):
- "Stripe PT", "stripe pt", "STRIPE PT" → `stripe_pt`
- "Stripe BR", "stripe br" → `stripe_br`  
- "Asaas", "ASAAS" → `asaas`
- "Direto", "DIRETO" → `direto`

**c)** Melhorar `getGateway()` para não ser usada quando `force_gateway` está definido (já funciona, mas documentar)

### Ficheiro 2: `supabase/functions/bitrix24-payment-handler/index.ts`

Este handler é chamado pelo sistema de pagamento do Bitrix24 (CHECKOUT). Actualmente ignora qual gateway foi seleccionado no deal.

**Alteração**: Antes de decidir gateway por moeda, verificar se o body contém um campo `GATEWAY` ou `gateway` enviado pelo Bitrix24. Se não, manter o fallback por moeda mas adicionar suporte para resolver `force_gateway` como no `payment-create`.

Também adicionar validação `pk_` na chave Stripe antes de usar.

### Ficheiro 3: `supabase/functions/manage-credentials/index.ts`

No upsert de credenciais, quando `credential_key` contém "STRIPE" e `credential_value` começa com `pk_`, rejeitar com erro claro:
```
"Esta é uma Publishable Key (pk_). Utilize a Secret Key (sk_) do Stripe."
```

## Ficheiros a editar

1. **`supabase/functions/payment-create/index.ts`** — normalizar force_gateway + validar chave pk_
2. **`supabase/functions/bitrix24-payment-handler/index.ts`** — respeitar gateway explícito + validar pk_
3. **`supabase/functions/manage-credentials/index.ts`** — rejeitar chaves pk_ no upsert

