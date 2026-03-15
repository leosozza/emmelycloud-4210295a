

## Diagnóstico: Por que a Fase 3 demora tanto

O problema é arquitetural. A cada chamada do loop de paginação (batch de 50 clientes), a Edge Function repete **todo** o trabalho pesado:

1. Carrega TODOS os 1058+ clientes do Supabase
2. Carrega TODOS os leads com joins aninhados (leads → cases → proposals → contracts → financial_records)
3. Carrega TODOS os client_contacts
4. Constrói o financialMap completo
5. **Carrega TODOS os Deals do Bitrix24** (loop paginado na API externa — o mais lento)
6. **Carrega TODOS os Contacts do Bitrix24** (loop paginado na API externa)
7. Retorna apenas **50 clientes**

Com ~1000 clientes, são ~21 chamadas repetindo os passos 1-6. Se o Bitrix tiver 500 deals + 500 contacts, cada chamada faz ~4-6 requests à API Bitrix. Total: **80-120 requests ao Bitrix** quando precisaria de ~4-6.

## Plano de correção

### A. Edge Function (`import-access-data`) — Eliminar re-fetch redundante
- Aumentar o `batch_size` implícito: retornar **todos os clientes processados numa única resposta** (o dataset cabe facilmente em memória — ~1000 objetos JSON).
- Manter paginação do Supabase internamente (já funciona), mas o Bitrix bulk load e matching acontecem **uma vez só**.
- Remover lógica de `batch_start`/`batch_size` — resposta única com todos os clientes.

### B. Frontend (`Bitrix24App.tsx`) — Chamada única
- Substituir o loop `while(true)` por uma única chamada `list_sync_clients` sem parâmetros de batch.
- Manter progress indicator durante o carregamento.
- A paginação/filtro (quitados/abertos/atrasados) fica 100% client-side (já é assim na UI).

### Resultado esperado
- De **21+ chamadas × 30s** → **1 chamada × ~15-20s** (Bitrix API bulk load uma vez).
- Dados já estão no Supabase, o que demora é o Bitrix lookup — que agora acontece uma única vez.

### Ficheiros alterados
- `supabase/functions/import-access-data/index.ts` (modo `list_sync_clients`)
- `src/pages/Bitrix24App.tsx` (função `handleLoadSyncClients`)

