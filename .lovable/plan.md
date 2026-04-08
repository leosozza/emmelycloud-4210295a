

# Correção: Credenciais de Pagamento Não Carregam na UI

## Problema Raiz

A edge function `manage-credentials` usa `supabase.auth.getClaims(token)` que **não existe** no Supabase JS SDK v2. Isto causa erro silencioso — a função retorna 401 "Unauthorized" quando chamada pelo frontend com token de utilizador autenticado. O frontend apanha o erro no `catch {}` vazio e mantém o estado vazio, mostrando "Não configurado" para todas as credenciais.

**Os dados estão salvos na base de dados** — confirmei que todas as chaves Stripe PT, Stripe BR, Asaas e webhooks existem na tabela `integration_credentials`. O problema é apenas na leitura/exibição.

## Solução

### Ficheiro 1: `supabase/functions/manage-credentials/index.ts`

Substituir `supabase.auth.getClaims(token)` por `supabase.auth.getUser()`:

```typescript
// ANTES (não existe no SDK):
const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
const userId = claims?.claims?.sub;

// DEPOIS (método correto):
const { data: { user }, error: userErr } = await supabase.auth.getUser();
if (userErr || !user) return 401;
const userId = user.id;
```

### Ficheiro 2: `src/pages/Integracoes.tsx`

Melhorar o error handling no `loadCredentials` para não engolir erros silenciosamente:

```typescript
// ANTES:
} catch {}

// DEPOIS:
} catch (e) {
  console.error("[Credenciais] Falha ao carregar:", e);
}
```

## Ficheiros a editar

1. **`supabase/functions/manage-credentials/index.ts`** — corrigir autenticação de `getClaims` para `getUser`
2. **`src/pages/Integracoes.tsx`** — adicionar log de erro no catch do `loadCredentials`

