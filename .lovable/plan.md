

## Persistir Lista de Clientes da Fase 3 Após Carregamento

### Problema
Cada vez que o utilizador clica "Carregar Clientes", a lista é limpa (`setSyncClients([])` na linha 5911) e recarregada do zero. Os dados são sempre os mesmos, tornando isto desnecessário e frustrante.

### Solução

**Ficheiro: `src/pages/Bitrix24App.tsx`**

1. **Não limpar a lista ao recarregar** — Remover `setSyncClients([])` e `setSyncClientsLoaded(false)` do início de `handleLoadSyncClients`. Apenas limpar se `forceRefresh=true`.

2. **Esconder o botão "Carregar" após carregamento** — Uma vez que `syncClientsLoaded=true`, substituir o botão principal por apenas o botão de refresh (🔄) discreto. A lista já carregada permanece visível e interactiva.

3. **Guardar em sessionStorage como fallback** — Após carregar com sucesso, serializar `syncClients` em `sessionStorage` com chave `sync_clients_cache`. No mount da Fase 3, verificar se existe cache em sessionStorage e restaurar automaticamente sem fazer fetch, marcando `syncClientsLoaded=true`.

4. **UI ajustada**:
   - Clientes carregados: mostrar header "X clientes carregados" com botão refresh pequeno ao lado
   - Sem botão grande "Carregar" ocupando espaço — apenas na primeira vez (quando `!syncClientsLoaded` e sem cache em sessionStorage)

### Alterações concretas

- `handleLoadSyncClients`: só fazer `setSyncClients([])` se `forceRefresh`; após sucesso, guardar em `sessionStorage`
- Novo `useEffect` no mount: ler `sessionStorage('sync_clients_cache')`, se existir → `setSyncClients(parsed)` + `setSyncClientsLoaded(true)`
- JSX: condicionar botão "Carregar" a `!syncClientsLoaded`, mostrar apenas refresh quando já carregado

