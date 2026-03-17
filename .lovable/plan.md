

## Problema: Progresso da Fase 3 não actualiza em tempo real

### Diagnóstico

Analisei o código e identifiquei dois problemas concretos:

1. **Contadores "sincronizados/pendentes" não actualizam durante o batch** — Os badges `✅ X sincronizados` e `⏳ Y pendentes` (linha 6448) são calculados a partir de `syncClients.filter(c => c.synced)`, mas o array `syncClients` **nunca é actualizado** durante o `handleSyncBatch`. Apenas `batchProgress` é actualizado, mas os badges lêem de `syncClients`.

2. **Painel de progresso desaparece ao terminar** — O painel com barra de progresso e contadores (linha 6606) está condicionado a `syncingBatch === true`. Quando o batch termina, `setSyncingBatch(false)` é chamado e o painel desaparece instantaneamente, sem mostrar um resumo final.

### Solução

#### 1. Actualizar `syncClients` em tempo real durante o batch
Após cada cliente processado com sucesso em `handleSyncBatch`, fazer `setSyncClients(prev => prev.map(...))` para marcar o cliente como `synced: true`. Isto faz com que `syncedCount` e `pendingCount` actualizem automaticamente nos badges.

#### 2. Manter o painel de progresso visível após conclusão
Alterar a condição do painel de `syncingBatch && batchProgress.total > 0` para `batchProgress.total > 0` (mostrar sempre que houver dados de progresso). Adicionar indicação visual de "Concluído" quando `!syncingBatch` com cores verdes. Adicionar botão "Fechar" para o utilizador limpar o painel manualmente.

#### 3. Resetar progresso apenas ao iniciar novo batch
Mover o `setBatchProgress({...zeros})` para o início de `handleSyncBatch` (já está lá), e não resetar ao terminar.

### Ficheiro a alterar
- `src/pages/Bitrix24App.tsx` — ~15 linhas alteradas no `handleSyncBatch` + ~10 linhas no JSX do painel de progresso

