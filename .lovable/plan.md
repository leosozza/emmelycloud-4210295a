

## Correcção: Campo NIF/CPF no Bitrix24

### Problema
O código usa `UF_CRM_EMMELY_NIF` como campo de NIF/CPF nos Deals e Contacts do Bitrix24, mas o campo real no CRM é `UF_CRM_1733687549802`.

Isto significa que:
- Todas as buscas por NIF retornam 0 resultados (campo inexistente é ignorado pelo Bitrix)
- O NIF nunca é gravado correctamente nos Deals e Contacts
- O lookup por NIF na Fase 3 nunca encontra matches

### Solução

Substituir **todas** as ocorrências de `UF_CRM_EMMELY_NIF` por `UF_CRM_1733687549802` no ficheiro `supabase/functions/import-access-data/index.ts`.

São ~83 ocorrências distribuídas por:
- **Batch lookup** (linhas ~679-688): select e indexação
- **sync_single_client**: filter, select, contactFields, dealFields
- **sync_bitrix**: filter, select, contactFields, dealFields

### Ficheiros alterados
- `supabase/functions/import-access-data/index.ts` — substituição global de `UF_CRM_EMMELY_NIF` → `UF_CRM_1733687549802`

