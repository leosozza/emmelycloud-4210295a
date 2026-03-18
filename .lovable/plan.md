

## Plano: Seletor de Pipeline + Query paginada para fix_stages

### Problema
1. A view "Revisão" está hardcoded para Pipeline 15 (`CATEGORY_ID: "15"`, stages `C15:*`)
2. O utilizador quer escolher qual pipeline revisar
3. A query de `financial_records` no `fix_stages` tem limite de 1000 rows — precisa de paginação

### Solução

**A. Backend (`bitrix24-cleanup-duplicates/index.ts`)**

1. **Aceitar `category_id` como parâmetro** (query string ou body), default `"15"`
2. **Usar `category_id` no filtro** de `fetchAllDeals` em vez de hardcoded `"15"`
3. **Adicionar acção `list_pipelines`** — chama `crm.dealcategory.list` + `crm.dealcategory.stage.list` para retornar pipelines com os seus stages e contagem de deals
4. **Stages dinâmicos no `fix_stages`** — em vez de hardcoded `C15:WON`/`C15:UC_S7RLFB`/`C15:NEW`, buscar os stages da pipeline via `crm.dealcategory.stage.list` e mapear por semântica (WON, primeiro stage, stage de atraso passado via parâmetro)
5. **Paginar `financial_records`** — buscar em batches de 200 deal IDs com `.range()` interno para ultrapassar limite de 1000 rows

**B. Frontend (`Bitrix24App.tsx` — RevisaoView)**

1. **Ao carregar**, chamar `list_pipelines` para obter lista de pipelines disponíveis com contagem
2. **Select/dropdown** para escolher pipeline (mostra nome + nº de deals)
3. **Após escolher**, mostrar stages da pipeline selecionada e permitir mapear qual stage corresponde a "Atrasado" (para fix_stages usar o stage correcto)
4. **Actualizar chamadas** de scan/merge/fix_stages para enviar `category_id` seleccionado
5. **Labels dinâmicos** de stages no resultado (usar nomes reais em vez de hardcoded)

### Ficheiros a editar
- `supabase/functions/bitrix24-cleanup-duplicates/index.ts` — adicionar `list_pipelines`, aceitar `category_id`, paginar financial_records
- `src/pages/Bitrix24App.tsx` — RevisaoView com seletor de pipeline

