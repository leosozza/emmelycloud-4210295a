

# Corrigir Build Errors + Testar Robots

## Build Errors (pré-existentes, não relacionados aos robots)

### 1. `CustomFlowNode.tsx` — `error` property não existe em `FlowNodeData`
Adicionar `error?: string` à interface `FlowNodeData` em `FlowNodeTypes.ts`.

### 2. `AddNodeOnEdge.tsx` — `data.onInsertNode` não é callable
O tipo de `data` no edge não inclui `onInsertNode`. Cast `data` para `any` ou adicionar tipagem correcta.

### 3. `Flows.tsx:196` — `"end_flow"` não existe em `FlowNodeType`
Remover a comparação com `"end_flow"` (o tipo correcto é `"end"`).

### 4. `Flows.tsx:608` — `Background.variant` não existe
Substituir `Background.variant || "dots"` por simplesmente `"dots"`.

## Teste dos Robots

Após corrigir os build errors:
1. Chamar a edge function `bitrix24-install` com action `repair` via `curl_edge_functions` para executar o "Reparar Campos e Robots"
2. Verificar nos logs se os novos campos (`signed_flow_id`, `paid_flow_id`, `overdue_flow_id`, `overdue_days`) foram registados nos robots
3. Verificar se os flows activos foram carregados como opções do dropdown

### Ficheiros a alterar
1. `src/components/flows/FlowNodeTypes.ts` — adicionar `error?: string` a `FlowNodeData`
2. `src/components/flows/AddNodeOnEdge.tsx` — fix tipo do data
3. `src/pages/Flows.tsx` — remover `"end_flow"`, fix `Background.variant`

