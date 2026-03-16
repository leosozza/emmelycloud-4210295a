

## Persistir Estado de Sincronização da Fase 3 e Auto-Retomar

### Problema
A Fase 3 guarda o estado `synced` apenas em memória (React state). Ao recarregar a página, perde-se toda a informação de quais clientes já foram sincronizados, forçando o utilizador a recomeçar sem saber onde parou.

### Solução
Usar os IDs Bitrix24 já persistidos nas tabelas `financial_records` e `clients` como indicador de sincronização concluída, e adicionar uma sessão de importação para a Fase 3 com auto-retoma.

### Critério "Sincronizado"
Um cliente está sincronizado quando:
- `clients.bitrix24_id` está preenchido (contacto criado) **E**
- Todos os `financial_records` desse cliente têm `bitrix24_deal_id` **E** `bitrix24_invoice_id` preenchidos

### Alterações

#### 1. Backend: `supabase/functions/import-access-data/index.ts` — mode `list_sync_clients`
- No Step 4 (onde constrói `clientsWithFinancials`), adicionar verificação para cada cliente:
  - Buscar se `clients.bitrix24_id` está preenchido
  - Para cada `financial_record`, verificar se `bitrix24_deal_id` e `bitrix24_invoice_id` estão ambos preenchidos
  - Incluir campo `synced: boolean` na resposta (true se deal+faturas todos com ID)
- Isto usa dados já carregados (allLeads com financial_records) — sem queries extras

#### 2. Frontend: `src/pages/Bitrix24App.tsx`

**a) Tipo `SyncClient`** — usar `synced` vindo do backend em vez de apenas local

**b) `handleLoadSyncClients`** — ao receber os clientes do backend, preservar o campo `synced` retornado pela API. Clientes já sincronizados aparecem na lista com o ícone verde e não são seleccionáveis.

**c) Sessão de importação para Fase 3** — criar `import_session` com phase="sync_bitrix3":
- Ao iniciar batch: criar sessão com `total_items` = total seleccionados
- A cada cliente sincronizado: `saveSessionProgress` com IDs dos clientes processados no campo `logs`
- Ao concluir: `markSessionDone`

**d) Auto-retoma no mount** — no `resumeSessions`:
- Detectar sessão `phase="sync_bitrix3"` com status `in_progress`
- Restaurar o progresso: carregar clientes via `list_sync_clients`, filtrar os já sincronizados (via campo `synced` do backend), e auto-continuar o batch com os restantes
- Mostrar barra de progresso com o estado anterior

**e) Contadores visuais** — mostrar junto ao header da Fase 3:
- "X/Y sincronizados" baseado nos dados do backend
- Badge com contagem dos pendentes vs concluídos por aba

**f) Botão "Marcar como sincronizado"** — não necessário se o critério automático (deal+faturas) funcionar, mas incluir como fallback na UI: botão para marcar manualmente um cliente, fazendo update do `bitrix24_id` no cliente e `bitrix24_deal_id`/`bitrix24_invoice_id` nos financial_records com valores placeholder ("MANUAL").

### Fluxo Resumido

```text
Página carrega → resumeSessions()
  ↓
Detecta session phase="sync_bitrix3" in_progress?
  ├─ SIM → loadSyncClients() → filtra synced=false → auto-continua batch
  └─ NÃO → utilizador carrega manualmente
  
handleLoadSyncClients() → backend retorna synced=true/false por cliente
  ↓
UI mostra clientes: synced=true com ✅, synced=false seleccionáveis
  ↓
Batch sync → para cada cliente → sync_single_client → sucesso → saveSessionProgress
  ↓
Refresh → detecta sessão → auto-retoma do ponto onde parou
```

### Ficheiros a Alterar
1. `supabase/functions/import-access-data/index.ts` — adicionar campo `synced` na resposta de `list_sync_clients`
2. `src/pages/Bitrix24App.tsx` — sessão Fase 3, auto-retoma, UI de progresso persistente

