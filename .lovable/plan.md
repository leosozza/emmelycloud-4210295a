

## Problema Identificado: Duplicação de Negócios e IDs não reutilizados

### Causa Raiz (3 problemas)

1. **IDs locais ignorados**: Quando o cliente já tem `bitrix24_id` (contacto) salvo no banco, o `sync_single_client` **não usa esse ID**. Ele faz `contactId = null` e inicia lookups do zero. Se o lookup falha (ex: filtro de campo customizado ignorado pelo Bitrix), cria um contacto/negócio **duplicado**.

2. **`bitrix24_deal_id` não é consultado**: Os `financial_records` já têm `bitrix24_deal_id` salvo de syncs anteriores, mas o `fetchClientWithFinancials` **não inclui essas colunas** no SELECT. O sistema nunca sabe que o deal já existe localmente.

3. **Lookup sem filtro de pipeline**: O `crm.deal.list` busca em TODAS as pipelines. Um cliente pode ter um deal antigo numa pipeline diferente, o lookup encontra esse, e depois cria outro na pipeline 15 — ou vice-versa.

### Solução

**Ficheiro:** `supabase/functions/import-access-data/index.ts`

**A. Pré-popular `contactId` e `dealId` a partir dos IDs locais (linhas ~1061-1062)**
```typescript
let contactId: string | null = client.bitrix24_id || null;
let dealId: string | null = null;

// Check if any financial_record already has a deal ID
const existingDealId = info.records.find((r: any) => r.bitrix24_deal_id)?.bitrix24_deal_id || null;
if (existingDealId) dealId = existingDealId;
```
Se já temos IDs locais, usamos direto — sem precisar de lookup API. Isso previne duplicação e é instantâneo.

**B. Incluir `bitrix24_deal_id` e `bitrix24_invoice_id` no SELECT do `fetchClientWithFinancials` (linha ~369)**
Adicionar essas colunas ao SELECT dos `financial_records` para que estejam disponíveis no `info.records`.

**C. Filtrar lookup por pipeline (linhas ~1070-1087)**
Adicionar `CATEGORY_ID: category_id` ao filtro dos `crm.deal.list` para evitar encontrar deals em pipelines erradas.

**D. Retornar `bitrix24_id` no response e atualizar cache**
O response já retorna `contact_id` e `deal_id`. Precisamos garantir que o frontend atualiza o cache persistente (`bitrix24_sync_cache`) com o estado `synced: true` após cada sync bem-sucedido — isso já acontece parcialmente mas o cache backend fica desatualizado.

### Resultado
- Clientes já sincronizados **nunca duplicam** — usam os IDs locais.
- Lookup limitado à pipeline correta — evita matches cruzados.
- A lista da Fase 3 reflete corretamente quem está sincronizado.

