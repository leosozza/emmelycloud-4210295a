

## Problema: Clientes importados não aparecem na Carteira

### Causa Raiz

A `CarteiraAccessView` (dentro do Bitrix24App) faz chamadas REST diretas ao banco de dados usando a chave anon:

```typescript
const clientsRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?...`, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
```

A tabela `clients` tem RLS que só permite acesso ao role `authenticated`. Como a chamada usa a chave anon (`SUPABASE_KEY`), o role é `anon` e a query retorna 0 resultados.

O mesmo problema afeta as queries de `leads` e relações aninhadas na mesma view.

### Dados Confirmados
- 1057 clientes existem no banco (todos com "Access" no campo notes)
- 94 leads com `sync_source=access_import` para 47 clientes
- RLS de `clients`: apenas role `authenticated` tem acesso
- A view usa anon key → role `anon` → bloqueado pela RLS

### Solução

Duas opções, recomendo a **Opção A** por ser mais simples e segura:

**Opção A — Usar o SDK do Supabase com sessão do utilizador**

Substituir as chamadas REST diretas (`fetch`) pelo SDK do Supabase (`supabase.from("clients")...`) que já tem a sessão autenticada do utilizador. O SDK usa automaticamente o token JWT da sessão.

Alterações em `CarteiraAccessView` no `Bitrix24App.tsx`:
- `fetchAll()`: Substituir o `fetch` direto por `supabase.from("clients").select(...)` e `supabase.from("leads").select(...)` com nested joins
- Remover o `limit=500` hard-coded (ou aumentar para cobrir os 1057 clientes) — usar paginação ou `.limit(2000)`
- Manter a lógica de cálculo financeiro inalterada

**Opção B — Adicionar policy anon à tabela clients** (menos seguro, não recomendado)

### Ficheiros a modificar

| Ficheiro | Alteração |
|---|---|
| `src/pages/Bitrix24App.tsx` | Refactor `CarteiraAccessView.fetchAll()` para usar SDK Supabase em vez de REST direto |

