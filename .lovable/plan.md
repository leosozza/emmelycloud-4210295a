

# Fix: Stripe Publishable Key passa no teste mas falha no pagamento

## Problema

A chave Stripe armazenada na tabela `integration_credentials` é uma **Publishable Key (pk_)**. O teste de conexão nas Integrações reporta "válida" porque a API `/v1/balance` do Stripe responde a `pk_` keys sem erro explícito. Mas quando o `payment-create` tenta criar uma sessão de checkout, rejeita correctamente a `pk_` key.

## Causa raiz

1. `manage-credentials` → `test_stripe`: não valida o prefixo da chave antes de testar
2. A chave `pk_` foi salva antes de existir a guarda de bloqueio (ou via outro caminho)

## Correções

### 1. `supabase/functions/manage-credentials/index.ts`
- Na action `test_stripe`, **antes** de chamar a API, validar que a chave começa com `sk_`. Se começar com `pk_`, retornar erro claro imediatamente.
- Aplicar a mesma validação no upsert default (já existe, mas reforçar)

### 2. `supabase/functions/manage-credentials/index.ts` — GET (listagem)
- Na listagem de credenciais, adicionar um campo `warning` quando uma chave Stripe tem valor que começa com `pk_`, para que o frontend mostre alerta visual

### 3. `src/pages/Integracoes.tsx`
- No resultado do teste Stripe, se `data.warning`, mostrar `toast.warning` em vez de `toast.success`
- Na listagem de credenciais, mostrar badge de alerta se a credencial tem `warning`

### Ficheiros
1. `supabase/functions/manage-credentials/index.ts` — validação pk_ no test + warning no GET
2. `src/pages/Integracoes.tsx` — UI para warnings

