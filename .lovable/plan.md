

## Plano: Corrigir mapeamento do campo EF (UF_CRM_1768312831)

### Problema

O campo `UF_CRM_1768312831` no Bitrix24 (campo EF) armazena o **ID do Cliente** da tabela TBL_CLIENTE (coluna A), não o SEPARADORID como está implementado actualmente.

Relação correcta:
- `TBL_CLIENTE.ID` → `UF_CRM_1768312831` (EF no Bitrix24)
- `TBL_HONORARIOS.CLIENTE` → referencia `TBL_CLIENTE.ID`

### Impacto

Actualmente o código:
1. Busca Deals por `UF_CRM_1768312831 = separadorId` — **errado**
2. Cria Deals com `UF_CRM_1768312831 = separadorId` — **errado**
3. Cria **um Deal por SEPARADORID** — pode estar correcto (um Deal por serviço), mas o EF deve ser o ID do cliente

### Correcção em `supabase/functions/import-access-data/index.ts`

**1. Passar `client.ID` para `syncClientToBitrix`** em vez de usar SEPARADORID como valor do EF.

**2. Busca de Deals existentes**: filtrar por `UF_CRM_1768312831 = client.ID` (ID do cliente Access).

**3. Um cliente pode ter múltiplos Deals** (um por SEPARADORID/serviço). A lógica de agrupamento por SEPARADORID para criar Deals separados continua correcta, mas o campo EF em todos eles deve conter o ID do cliente.

**4. Actualizar `dealFields`**:
```
UF_CRM_1768312831: String(client.ID)  // EF = Client ID do Access
```

**5. Busca de Deal existente**: como múltiplos Deals podem ter o mesmo EF (mesmo cliente), a busca deve incluir o título ou outro critério para encontrar o Deal correcto do serviço. Opção: buscar por `UF_CRM_1768312831 = clientId` + `TITLE contains desc`.

### Ficheiro a modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/import-access-data/index.ts` | Alterar `UF_CRM_1768312831` de SEPARADORID para Client ID em toda a lógica de sync Bitrix24 |

