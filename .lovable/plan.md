

## Barra de Progresso e Contadores em Tempo Real para Sincronização em Lote

### Problema
Ao sincronizar em lote, não há feedback visual — sem barra de progresso, sem contadores de Contacts/Deals/Faturas criados.

### Solução

Adicionar estado de progresso ao `handleSyncBatch` e um painel de status em tempo real na UI.

#### 1. Novo estado de progresso

```typescript
const [batchProgress, setBatchProgress] = useState({
  current: 0,
  total: 0,
  contacts: 0,
  deals: 0,
  invoices: 0,
  errors: 0,
  currentName: "",
});
```

#### 2. Atualizar `handleSyncBatch`

Após cada `handleSyncSingleClient`, incrementar os contadores com base no resultado (`data.contact_id`, `data.deal_id`, `data.invoices_created`). O `handleSyncSingleClient` precisa retornar o resultado para que o batch possa contar.

- Modificar `handleSyncSingleClient` para **retornar** `data` (contact_id, deal_id, invoices_count)
- No loop do batch, acumular contadores e atualizar `batchProgress` a cada iteração

#### 3. UI de progresso

Quando `syncingBatch === true`, mostrar acima da tabela:
- **Progress bar** (`<Progress />`) com `value = (current/total) * 100`
- **Texto**: "Sincronizando 45/676 — ABILIO MEDEIROS JUNIOR..."
- **Contadores em tempo real**: ícones com números:
  - 👤 Contacts: 42
  - 📋 Deals: 40  
  - 📄 Faturas: 120
  - ❌ Erros: 2
- O botão "Parar Sincronização" permanece visível

### Ficheiro alterado
- `src/pages/Bitrix24App.tsx` — novo estado `batchProgress`, modificar `handleSyncSingleClient` para retornar dados, atualizar `handleSyncBatch` com contadores, adicionar UI de progresso com `<Progress />`

