

## Plano: Auto-detectar integração Bitrix24 quando sem member_id

### Problema
Ao abrir `/bitrix24` fora do iframe do Bitrix24 (ex: no Lovable), não existe `member_id` nem SDK `BX24`. O `fetchData` nunca é chamado, e o dashboard mostra "Offline" sem dados.

### Solução
Modificar a lógica de inicialização em `Bitrix24App.tsx` para, quando não houver `member_id`, buscar automaticamente a integração mais recente via `bitrix24-connector-settings` (ou directamente via Supabase REST).

**Duas alterações:**

1. **`bitrix24-connector-settings/index.ts`**: Quando não recebe `member_id`, em vez de retornar `{ integration: null }`, buscar a integração mais recente (`.order("updated_at", { ascending: false }).limit(1).single()`) e retorná-la. Isto é seguro porque o user confirmou que só tem 1 Bitrix24.

2. **`src/pages/Bitrix24App.tsx`**: Na lógica de init (linhas 80-120), quando não há `member_id` do BX24 nem dos query params, chamar `fetchData("")` (ou sem member_id) para que o endpoint auto-resolva a integração. Actualmente, os ramos `else` saltam directamente para `setView("dashboard")` sem dados.

### Alteração detalhada

**Edge Function `bitrix24-connector-settings`** (linhas ~97-107):
- Quando `memberId` é null e `isJsonRequest` é true, buscar a integração mais recente em vez de retornar null.

**`Bitrix24App.tsx`** (linhas ~100-117):
- Nos ramos `else` onde `mid` é falsy, chamar `fetchData("__latest__")` em vez de `setView("dashboard")`.
- Na função `fetchData`, se `mid` for `"__latest__"`, chamar o endpoint sem `member_id` (deixar o backend resolver).

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/bitrix24-connector-settings/index.ts` | Auto-resolver integração quando member_id ausente e format=json |
| `src/pages/Bitrix24App.tsx` | Chamar fetchData mesmo sem member_id |

