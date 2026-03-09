

## Plano: Baixa Carteira integrada com Lead, Deal e SPA do Bitrix24

### Problema
A `BaixaCarteiraView` atual apenas busca Deals. O utilizador precisa de escolher entre Lead, Deal ou SPA, e depois selecionar pipeline/categoria e etapa de forma cascadeada.

### Solução

#### 1. Nova Edge Function: `bitrix24-fetch-entities`

Substitui/complementa `bitrix24-fetch-deals` com suporte a 3 entidades:

| Endpoint | Ação |
|---|---|
| `?action=pipelines&entity=lead` | Retorna status list via `crm.status.list` (filtro `ENTITY_ID=STATUS`) |
| `?action=pipelines&entity=deal` | Retorna categorias via `crm.dealcategory.list` |
| `?action=pipelines&entity=spa` | Retorna SPA types via `crm.type.list` |
| `?action=stages&entity=deal&category_id=X` | Retorna etapas do pipeline via `crm.dealcategory.stage.list` |
| `?action=stages&entity=spa&spa_entity_type_id=X` | Retorna etapas do SPA via `crm.status.list` com `entityId` |
| `?action=items&entity=lead&stage_id=X` | Lista leads via `crm.lead.list` com filtro `STATUS_ID` |
| `?action=items&entity=deal&category_id=X&stage_id=X` | Lista deals via `crm.deal.list` |
| `?action=items&entity=spa&spa_entity_type_id=X&stage_id=X` | Lista itens SPA via `crm.item.list` |

Todos os items retornam formato unificado: `{ id, title, opportunity, currency, stage_id, stage_name, contact_name, contact_phone, contact_email, date_create }`.

#### 2. Refactor da `BaixaCarteiraView` no `Bitrix24App.tsx`

Filtros cascadeados:

```text
[Entity Type: Lead | Deal | SPA]
       ↓
[Pipeline/Categoria] (Deal: categorias, SPA: entity types, Lead: omitido)
       ↓
[Etapa/Stage] (carregado dinamicamente)
       ↓
[Buscar] → lista de items
```

- **Estado**: `entityType` (lead/deal/spa), `pipelineId`, `stageId`
- Quando `entityType` muda → limpar pipeline e stage, buscar pipelines
- Quando `pipelineId` muda → limpar stage, buscar stages
- O botão "Buscar" chama `action=items` com os filtros selecionados
- A lista e formulário de baixa permanecem iguais (formato unificado)

#### 3. Adaptar `bitrix24-update-deal-payment`

- Aceitar parâmetro `entity_type` para saber se é lead, deal ou SPA
- Para leads: usar `crm.lead.update` em vez de `crm.deal.update`
- Para SPA: usar `crm.item.update` com `entityTypeId`
- Badge: ajustar `ownerTypeId` (1=Lead, 2=Deal, 128+=SPA)

### Ficheiros

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-fetch-entities/index.ts` | **Nova** — edge function unificada com actions: pipelines, stages, items |
| `src/pages/Bitrix24App.tsx` | Refactor `BaixaCarteiraView`: filtros cascadeados Lead/Deal/SPA → Pipeline → Stage |
| `supabase/functions/bitrix24-update-deal-payment/index.ts` | Aceitar `entity_type` e adaptar API calls por entidade |

