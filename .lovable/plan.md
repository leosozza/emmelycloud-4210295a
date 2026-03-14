

## Plano: Preview dos Placements Emmely AI

### Contexto

O "Placement Preview" actual (`view === "placement"`) só mostra o **Payment Tab** (`bitrix24-payment-tab`). Faltam previews para os 3 placements de IA:
- **CRM_LEAD_DETAIL_TAB** → `bitrix24-crm-tab` (conversa e histórico do lead)
- **IM_SIDEBAR** → `bitrix24-im-sidebar` (assistente IA no messenger)
- **IM_CONTEXT_MENU** → `bitrix24-im-context-menu` (analisar mensagem com IA)

### Implementação

**Modificar `PlacementPreviewView`** em `src/pages/Bitrix24App.tsx`:

1. Adicionar selector de placement type com 4 opções:
   - `Payment Tab` (actual, endpoint `bitrix24-payment-tab`)
   - `Emmely AI — CRM Tab` (endpoint `bitrix24-crm-tab`)
   - `IM Sidebar` (endpoint `bitrix24-im-sidebar`)
   - `Context Menu` (endpoint `bitrix24-im-context-menu`)

2. Ajustar os parâmetros de cada placement:
   - **Payment Tab**: `member_id` + `PLACEMENT_OPTIONS: { ID, ENTITY_TYPE_ID: "2" }` (Deal ID)
   - **CRM Tab**: `member_id` + `PLACEMENT_OPTIONS: { ID }` (Lead ID)
   - **IM Sidebar**: POST com `member_id` + `PLACEMENT: IM_SIDEBAR` + `PLACEMENT_OPTIONS: { DIALOG_ID }` (Dialog ID)
   - **Context Menu**: POST com `member_id` + `PLACEMENT: IM_CONTEXT_MENU` + `PLACEMENT_OPTIONS: { DIALOG_ID, MESSAGE_ID }` (Dialog ID + Message ID)

3. Campos de input dinâmicos conforme o placement seleccionado:
   - Payment Tab: Deal ID
   - CRM Tab: Lead ID
   - IM Sidebar: Dialog ID (ex: `chat12345`)
   - Context Menu: Dialog ID + Message ID

4. Mock BX24 ajustado por tipo — `getPlacement()` devolve options correctas para cada placement.

5. Label do iframe actualizada conforme o tipo seleccionado.

### Ficheiro a modificar

| Ficheiro | Acção |
|----------|-------|
| `src/pages/Bitrix24App.tsx` | Reescrever `PlacementPreviewView` com selector multi-placement |

