

## Plano: Autoabrir lista da Fase 3 sem recarregar

### Problema
Atualmente a lista de clientes da Fase 3 usa `sessionStorage` (apaga ao fechar o browser) e exige clique manual no botão "Carregar Clientes" toda vez. Isso causa esperas longas e repetitivas.

### Solução
Persistir a lista completa de clientes no **backend** (tabela `bitrix24_sync_cache`) e carregá-la instantaneamente ao abrir a Fase 3, sem precisar clicar em nada.

### Alterações

**1. Backend: salvar a lista de clientes locais no cache (`import-access-data/index.ts`)**
- No final do `list_sync_clients`, após montar `clientsWithFinancials` enriquecidos, salvar o resultado na tabela `bitrix24_sync_cache` com `cache_type = "sync_clients_list"` (sem TTL — persiste até forçar refresh).

**2. Backend: novo mode `"get_cached_sync_clients"` (`import-access-data/index.ts`)**
- Mode leve que apenas lê `bitrix24_sync_cache` com `cache_type = "sync_clients_list"` e devolve os dados instantaneamente, sem chamar o Bitrix24.
- Se não existir cache, retorna `{ success: true, clients: [], cached: false }` para o frontend saber que precisa do carregamento completo.

**3. Frontend: autoabrir ao montar (`Bitrix24App.tsx`)**
- No `useEffect` de mount, antes de tentar `sessionStorage`, chamar o novo mode `get_cached_sync_clients`.
- Se retornar dados, popular `syncClients` e marcar `syncClientsLoaded = true` imediatamente — **sem botão, sem espera**.
- Manter o `sessionStorage` como fallback de segundo nível (para navegação intra-sessão).
- Esconder o botão "Carregar Clientes" quando já tem dados. Manter apenas o ícone 🔄 para forçar refresh.

**4. Frontend: salvar no cache após carregamento completo (`Bitrix24App.tsx`)**
- Após `handleLoadSyncClients` terminar com sucesso, além do `sessionStorage`, chamar o backend para salvar no `bitrix24_sync_cache`.
- Isso garante que na próxima visita os dados estão prontos.

**5. Atualizar status de sync em tempo real**
- Após cada sync individual ou batch bem-sucedido, atualizar o cache local (`syncClients` state) e o `sessionStorage`.
- Na próxima vez que abrir, os clientes já sincronizados aparecerão com o badge correto.

### Resultado
- Primeira vez: carrega normalmente (botão visível se não houver cache).
- Visitas seguintes: **abre instantaneamente** com os dados do cache do backend.
- O botão 🔄 permite forçar atualização quando necessário.
- Nunca mais "lista vazia" por timeout do Bitrix24 quando os dados já foram carregados antes.

### Ficheiros a editar
- `supabase/functions/import-access-data/index.ts`
- `src/pages/Bitrix24App.tsx`

