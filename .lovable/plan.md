

## Plano: Nó "Criar Badge" no Flow Editor + Robot "Criar Badge" no Bitrix24

### Problema
Atualmente as badges são hard-coded (7 badges fixas registadas no install). Não existe forma de criar badges personalizadas nem no editor de fluxos, nem nos robots.

### Solução

#### 1. Novo nó de fluxo: `bitrix_create_badge`

**FlowNodeTypes.ts** — Adicionar:
- Tipo `"bitrix_create_badge"` ao `FlowNodeType`
- Categoria "bitrix24" no `NODE_CATEGORIES`
- Metadados: `{ label: "Criar Badge", icon: Award, color: "#f59e0b", description: "Criar badge personalizada no CRM" }`
- Interface `FlowBitrixBadge` com campos: `badgeCode`, `headerTitle`, `messagePreview`, `entityType` (lead/deal/contact), `entityId`
- Default data no `getDefaultData`

**NodeConfigPanel.tsx** — Adicionar secção de configuração para `bitrix_create_badge`:
- Campo `badgeCode` (texto livre ou select com as badges registadas + opção custom)
- Campo `headerTitle` (título do badge)
- Campo `messagePreview` (texto de preview)
- Campo `entityType` (Lead, Deal, Contact)
- Campo `entityId` (suporta variáveis `{{deal_id}}`)

#### 2. Motor de fluxos: executar nó badge

**flow-engine/index.ts** — Adicionar case `"bitrix_create_badge"`:
- Interpolar variáveis nos campos
- Chamar `bitrix24-worker` com `_badgeRequest: true` e os dados do nó
- Guardar resultado em variável

#### 3. Novo robot: `emmely_create_badge`

**bitrix24-install/index.ts** — Registar novo robot com propriedades:
- `badge_code` (string) — código da badge
- `header_title` (string) — título
- `message_preview` (string) — texto de preview
- `entity_type` (string) — lead/deal/contact
- `entity_id` (string) — ID da entidade

**bitrix24-robot-handler/index.ts** — Adicionar handler:
- Receber propriedades do robot
- Chamar `bitrix24-worker` com `_badgeRequest: true`
- Retornar `{ badge_status, error }`

---

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `src/components/flows/FlowNodeTypes.ts` | +tipo `bitrix_create_badge`, meta, interface, default data |
| `src/components/flows/NodeConfigPanel.tsx` | +secção de config para badge |
| `supabase/functions/flow-engine/index.ts` | +case `bitrix_create_badge` |
| `supabase/functions/bitrix24-robot-handler/index.ts` | +handler `emmely_create_badge` |
| `supabase/functions/bitrix24-install/index.ts` | +registar robot `emmely_create_badge` |

