# Fix — Flows CRM node: valor do campo puxando do Bitrix

## Problema

No painel de configuração do nó CRM (`crm.deal.update`, `crm.lead.update`, `crm.deal.add` etc.) dentro do iframe:

1. Ao escolher um campo como **Deal stage (STAGE_ID)**, o input de valor é um `<Input>` de texto livre com placeholder `{{valor}} ou texto fixo`. O usuário precisa saber decorado o código do estágio (ex.: `C1:NEW`) — não há dropdown com as etapas reais do Bitrix.
2. O mesmo acontece com **CATEGORY_ID** (funil), **STATUS_ID** de Lead, campos `enumeration` (listas), `boolean`, `crm_status`, `crm_category`.
3. Ao salvar/executar, o Bitrix rejeita o valor (ex.: `{{valor}}` literal, ou id inválido) → aparece como "erro ao criar o campo".

O endpoint `bitrix24-fields` já retorna `type` e `items` (quando existem inline), e o endpoint `bitrix24-fetch-entities` já sabe listar `pipelines` e `stages` de lead/deal/SPA — só falta ligar isso à UI.

## Escopo (frontend + 1 tweak backend)

### 1. Novo componente `BitrixFieldValueInput`
`src/components/flows/BitrixFieldValueInput.tsx`

Recebe: `entity`, `spaEntityTypeId`, `fieldKey`, `fieldMeta` (do hook `useBitrixFields`), `value`, `onChange`, `categoryId` opcional (para resolver stages do funil correto).

Comportamento por tipo detectado no `fieldMeta`:

| Campo / tipo                                       | Renderiza                                          |
| -------------------------------------------------- | -------------------------------------------------- |
| `STAGE_ID` (deal) ou `crm_status` com `DEAL_STAGE` | Dropdown de estágios (fetch `action=stages`)       |
| `STATUS_ID` (lead)                                 | Dropdown de estágios de Lead                       |
| `CATEGORY_ID` (deal)                               | Dropdown de funis (`action=pipelines`)             |
| `stageId` (SPA)                                    | Dropdown de estágios SPA                           |
| `type === "enumeration"` com `items`               | Dropdown a partir de `items` já retornados         |
| `type === "boolean"` ou `char` (Y/N)               | Switch Sim/Não                                     |
| `type === "date"` / `datetime`                     | Input `type="date"`/`datetime-local`               |
| resto                                              | Input de texto (comportamento atual)               |

Todos os dropdowns oferecem também opção **"Usar variável dinâmica"** que troca para input texto — para manter `{{deal_id}}`, `{{stage_id}}` etc.

### 2. Novo hook `useBitrixStages`
`src/hooks/useBitrixStages.ts`

- Chama `bitrix24-fetch-entities?action=stages&entity=<lead|deal|spa>&category_id=<id>&spa_entity_type_id=<id>`.
- Cache in-memory por chave `entity|categoryId|spaId` (5 min), mesmo padrão do `useBitrixFields`.
- Também exporta `useBitrixPipelines` (usa `action=pipelines`) para dropdown de CATEGORY_ID.

### 3. Substituir `<Input>` de valor no `NodeConfigPanel.tsx`

- Linhas 1387–1389 (Estágio de destino no `isMove`): trocar por `BitrixFieldValueInput` com `fieldKey="STAGE_ID"` e passar `categoryId={crm.targetPipelineId}`.
- Linhas 1381–1383 (Funil de destino no `isMove`): trocar por dropdown de pipelines.
- Linhas 1437–1439 (valor genérico em Campos): trocar por `<BitrixFieldValueInput fieldKey={f.key} ... />` — pega `fieldMeta` do `useBitrixFields` já carregado.

### 4. Ajustes no `bitrix24-fields` (backend)
`supabase/functions/bitrix24-fields/index.ts`

- Enriquecer o retorno do parseFields quando `type` for `crm_status` / `crm_category` / `crm_dealcategory`: incluir um flag `enrichSource: "stages" | "pipelines"` para que o frontend saiba qual endpoint chamar.
- Nenhuma quebra de contrato — só campos adicionais.

### 5. Erro "ao criar o campo" ao salvar/executar

Duas causas prováveis, ambas cobertas pelas mudanças acima:

- **Valor literal `{{valor}}`** (placeholder deixado sem preencher): adicionar validação client-side no `NodeConfigPanel` — se `f.value` contém `{{valor}}` ou vazio, mostrar aviso vermelho abaixo do campo e bloquear "Salvar" no toolbar do flow.
- **STAGE_ID inválido**: com o dropdown, o valor sempre será um id válido (`C1:NEW`, `NEW`, `DT31_1:UC_...`).

Se depois de aplicar isso ainda houver erro, capturaremos a mensagem exata no `flow-engine` (já existe `flow_execution_logs`) — nenhum ajuste extra necessário agora.

## Fora de escopo

- Nenhum trigger de banco, nenhuma nova tabela, nenhuma migração.
- Não mexer no `flow-engine` (runtime) — o problema é UX/entrada de dados.
- Não mexer no `BitrixFieldSelector` (seleção do campo — já funciona).

## Arquivos tocados

- **novo** `src/components/flows/BitrixFieldValueInput.tsx`
- **novo** `src/hooks/useBitrixStages.ts` (inclui `useBitrixPipelines`)
- editado `src/components/flows/NodeConfigPanel.tsx` (linhas ~1380–1445)
- editado `supabase/functions/bitrix24-fields/index.ts` (enriquecer metadata)

## Detalhes técnicos

```text
NodeConfigPanel
  └─ BitrixFieldSelector (key)     ← já existe
  └─ BitrixFieldValueInput (value) ← NOVO
        ├─ if key===STAGE_ID / crm_status → useBitrixStages(entity, categoryId)
        ├─ if key===CATEGORY_ID           → useBitrixPipelines(entity)
        ├─ if fieldMeta.items?.length     → <Select> a partir dos items
        ├─ if boolean                     → <Switch>
        ├─ if date                        → <Input type=date>
        └─ default                        → <Input> (comportamento atual)
```

Toggle "usar variável" em todos os casos para permitir `{{stage_id}}` vindo de nós anteriores.
