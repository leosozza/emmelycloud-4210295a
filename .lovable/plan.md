

# Corrigir Build Errors + Importer PowerBot (Edges & Handles)

## Resumo

Há **20 erros de build** nas edge functions + **~15 erros** no FlowTestSimulator. Além disso, o importer PowerBot precisa de correcções para que os edges conectem visualmente.

## Alterações

### 1. `src/lib/powerbotImporter.ts` — Corrigir importer

**a) Multi-branch condition → switch**: `conditionalNode` com >2 condições → `nodeType: "switch"` com `switchCases` usando os IDs originais como `handleId`.

**b) Limpar sourceHandle**: Para nós não-branching, forçar `sourceHandle: null` para usar o handle default do CustomFlowNode.

**c) Limpar targetHandle**: `"null"` (string) → `null`.

### 2. `src/components/flows/FlowTestSimulator.tsx` — Corrigir tipos

Substituir tipos inexistentes no switch:
- `"trigger"` → processar como nó inicial (já existente como fallback)
- `"whatsapp"` → agrupar com `"message"`
- `"message_poll"` → remover (não existe no FlowNodeType)
- `"message_media"` → usar `"media"`
- `"wait_response"` → usar `"wait_reply"`
- `"end_flow"` → usar `"end"`
- `"bitrix_update_field"` / `"bitrix_move_stage"` etc → agrupar em default bitrix
- `b.text` → `b.label` (FlowButtonItem não tem `text`)
- `data.pollOptions` / `data.listSections` / `data.bitrixGetData` → remover ou adaptar
- Cast `data.nodeType` como `string` no switch para evitar erros de comparação

### 3. `src/pages/Flows.tsx` — Sanitizar flows carregados

Ao carregar flow da BD, aplicar sanitização:
- `nodeType: "transfer"` → `"transfer_to_human"`
- `sourceHandle` de nós não-branching → `null`

### 4. Edge Functions — Type guards (20 erros)

| Ficheiro | Erro | Fix |
|---|---|---|
| `manage-credentials` (L121, L158) | `e` is unknown | `(e instanceof Error ? e.message : "unknown")` |
| `message-send` (L92, L105) | Redeclare `resolvedInteractiveData` | Rename inner var to `finalInteractiveData` |
| `message-send` (L400) | `.catch()` on Postgrest | `.then(() => {})` |
| `ollama-url-webhook` (L163) | `.catch()` on Postgrest | `.then(() => {})` |
| `parse-document` (L113, L353) | `error`/`e` unknown | Type guards |
| `parse-document` (L258) | `"raw"` not CompressionFormat | Cast `"raw" as any` |
| `payment-create` (L471, L680) | `err` unknown | Type guards |
| `payment-reminder` (L381, L394) | `err` unknown | Type guards |
| `payment-status` (L100) | `err` unknown | Type guard |
| `payment-webhook-stripe` (L364) | `err` unknown | Type guard |
| `proposal-pdf` (L297) | `e` unknown | Type guard |
| `queue-worker` (L48) | `.select("id", {count,head})` 2 args | `.select("id", { count: "exact" }).limit(0)` — or just remove 2nd arg |
| `signature-certificate` (L64) | `e` unknown | Type guard |
| `bitrix24-fetch-entities` (L320) | `unknown[]` not `string[]` | Already has `String()` map — cast `as string[]` |

## Ficheiros a editar

1. `src/lib/powerbotImporter.ts`
2. `src/components/flows/FlowTestSimulator.tsx`
3. `src/pages/Flows.tsx`
4. 12 edge functions (type guard fixes)

