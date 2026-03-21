

# Correção: Configurações não persistem após guardar

## Problema Raiz

O Supabase JS SDK **não lança exceções** — retorna `{ data, error }`. O código em `EncargosTab` e `PermissoesTab` usa `try/catch` sem verificar o campo `error`, fazendo com que falhas de escrita sejam ignoradas silenciosamente.

**Exemplo do bug (linha 97):**
```typescript
// Não verifica error!
await supabase.from("payment_gateway_config").update({...}).eq("id", configId);
```

## Correções

### Ficheiro 1: `src/pages/Configuracoes.tsx` — EncargosTab

Na função `handleSave`, verificar `error` em cada operação Supabase:
```typescript
const { error } = await supabase.from("payment_gateway_config").update(...);
if (error) throw error;
```

Aplicar ao `update` (linha 97) e ao `insert` (linha 99).

### Ficheiro 2: `src/components/configuracoes/PermissoesTab.tsx`

Na função `handleSave`, verificar `error` em:
- Delete de permissões existentes
- Insert de novas permissões

Mostrar `toast.error` com a mensagem real do erro.

### Ficheiros a editar

1. **`src/pages/Configuracoes.tsx`** — adicionar verificação de `error` no handleSave do EncargosTab
2. **`src/components/configuracoes/PermissoesTab.tsx`** — adicionar verificação de `error` no handleSave

