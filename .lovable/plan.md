

# Atualizar o Importador PowerBot para Mapear aos Novos Tipos de No

## Problema Atual

O importador (`src/lib/powerbotImporter.ts`) foi criado antes dos novos tipos de IA e Bitrix24. Resultado: dados ricos do PowerBot sao perdidos na conversao.

| No PowerBot | Mapeamento Atual | Mapeamento Correto |
|---|---|---|
| `openAINode` (type=mission + missionVariables) | `ai_response` | `ai_intention` (com campos mapeados) |
| `openAINode` (type=prompt) | `ai_response` | `ai_response` (preservar prompt e whisper) |
| `updateCrmNode` | `set_variable` | `bitrix_update_lead` / `bitrix_update_deal` / `bitrix_update_spa` |
| `createCrmNode` | `webhook` | `bitrix_create_deal` / `bitrix_create_lead` / `bitrix_create_spa` |
| `messageNode` (sendAsWhisper) | `message` (perde whisper) | `message` (preservar whisper no config) |
| `conditionalNode` | `condition` (perde detalhes) | `condition` (preservar conditions completas) |

## Alteracoes no Ficheiro `src/lib/powerbotImporter.ts`

### 1. Novo typeMap inteligente (funcao em vez de mapa estatico)

Substituir o `typeMap` estatico por uma funcao `resolveNodeType(pbType, data)` que analisa o conteudo:

```text
openAINode + data.type === "mission" + data.missionVariables.length > 0
  -> "ai_intention"

openAINode + data.type === "prompt"
  -> "ai_response"

updateCrmNode + data.bitrixCrmFields com entity "lead"
  -> "bitrix_update_lead"

updateCrmNode + data.bitrixCrmFields com entity "deal"
  -> "bitrix_update_deal"

updateCrmNode + data.bitrixCrmFields com entity "contact"
  -> "bitrix_update_lead" (contact mapeia para lead)

createCrmNode + data.entity === "deal"
  -> "bitrix_create_deal"

createCrmNode + data.entity === "lead"
  -> "bitrix_create_lead"

createCrmNode + data.entity === "spa"
  -> "bitrix_create_spa"
```

### 2. Novo extractConfig inteligente

Converter dados do PowerBot para o formato `FlowNodeData`:

**openAINode mission -> ai_intention:**
- `missionVariables` -> `aiIntention.intentions[]` com:
  - `fieldName` = variable.name
  - `description` = variable.description
  - `validation` = inferir de nome (Email->email, Telefone->phone, etc.)
  - `required` = true
- `prompt` -> `aiIntention.successMessage` / `prompt`
- `maxTurns` = `interactionsLimit` ou 10

**openAINode prompt -> ai_response:**
- `prompt` preservado
- `sendAsWhisper` preservado no config

**updateCrmNode -> bitrix_update_*:**
- `bitrixCrmFields[]` -> `bitrixCrm.fields[]` com key=crmField.id, value=value
- `entity` detectada dos campos

**createCrmNode -> bitrix_create_*:**
- `fields[]` -> `bitrixCrm.fields[]` com key=id, value=value
- `pipeline` -> `bitrixCrm.pipeline`
- `status` -> `bitrixCrm.stageId`

**messageNode:**
- `messageData` -> `message`
- `sendAsWhisper` preservado

**conditionalNode:**
- `conditions[]` preservadas com tipo, valores e variaveis

### 3. Usar CustomFlowNode em vez de "default"

Alterar `type: "default"` para `type: "custom"` nos nos convertidos, para que usem o componente `CustomFlowNode` com os previews visuais dos novos tipos (Bitrix, IA Intencao, etc.).

### 4. Atualizar cores e labels

Adicionar ao `nodeColors` e `nodeLabels` as novas entradas para `ai_intention`, `bitrix_update_lead`, `bitrix_create_deal`, etc., usando as cores do `NODE_TYPE_META`.

### 5. Preview melhorado

Atualizar `previewPowerBotFlow` para mostrar os tipos corretos no resumo (ex: "IA - Intencao: 1, Bitrix Criar Deal: 1" em vez de "Webhook: 1, Variavel: 1").

---

## Resultado Esperado

Ao importar o JSON `Emmely_Fernandes_Advocacia-2.json`:

- No 24 (openAINode mission) -> **IA - Intencao** com 16 campos (Nome, Email, Telefone, Area_Juridica, etc.)
- No 32 (updateCrmNode) -> **Atualizar Lead** com campos UF_CRM mapeados
- No 44 (createCrmNode deal) -> **Criar Deal** com pipeline 33, campos TITLE e UF_CRM
- No 45, 47 (openAINode prompt) -> **Resposta IA** com prompt preservado e whisper ativo
- Nos de mensagem preservam `sendAsWhisper`
- Todos os nos usam `CustomFlowNode` para preview visual correto

