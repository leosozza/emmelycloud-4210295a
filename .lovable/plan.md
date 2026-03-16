

## Plano: Vincular produtos do Bitrix24 aos Deals/Faturas + Sincronizar catálogo de serviços

### Problema actual
1. O deal creation na Fase 3 já vincula produtos via `crm.deal.productrows.set` e `crm.item.productrow.set` (implementado na última alteração), mas usa o mapeamento estático `CASE_TITLE_TO_PRODUCT_ID` — não consulta a tabela `services`.
2. Ao criar/editar um serviço na página Serviços, **não há sincronização** com o catálogo de produtos do Bitrix24 (`crm.product.*`).

### Solução

#### 1. Nova Edge Function: `bitrix24-sync-product`
Cria uma edge function que sincroniza um serviço local com o catálogo de produtos do Bitrix24:
- **Criar**: `crm.product.add` → guarda o `bitrix24_id` retornado na tabela `services`
- **Atualizar**: `crm.product.update` (se `bitrix24_id` existe)
- **Eliminar**: `crm.product.delete` (se `bitrix24_id` existe)

```
POST /functions/v1/bitrix24-sync-product
Body: { action: "upsert" | "delete", service_id, name, value, currency }
```

#### 2. Atualizar `Servicos.tsx`
Após guardar/eliminar um serviço com sucesso, chamar a nova edge function para sincronizar com o Bitrix24:
- No `saveMutation.onSuccess`: invocar sync com `action: "upsert"`
- No `deleteMutation`: antes de eliminar localmente, invocar sync com `action: "delete"` se tiver `bitrix24_id`

#### 3. Atualizar `import-access-data` para consultar tabela `services`
No `sync_single_client` e `sync_bitrix`, antes de resolver o `PRODUCT_ID`, consultar a tabela `services` para obter o `bitrix24_id` directo (em vez de depender apenas do mapa estático). O mapa estático serve como fallback.

### Ficheiros alterados
- **Novo**: `supabase/functions/bitrix24-sync-product/index.ts`
- **Editado**: `src/pages/Servicos.tsx` (adicionar sync ao save/delete)
- **Editado**: `supabase/functions/import-access-data/index.ts` (consultar `services` table para `bitrix24_id`)
- **Novo**: entrada em `supabase/config.toml` para `bitrix24-sync-product`

