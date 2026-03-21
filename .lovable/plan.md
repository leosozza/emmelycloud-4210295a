

# Revisão de Placements — Install vs Rebind (Inconsistências)

## Inventário Completo

| Placement | Install | Rebind | Handler | Problema |
|-----------|---------|--------|---------|----------|
| IM_TEXTAREA | ✅ | ✅ | bitrix24-return-to-bot | Install tem `context: "LINES"`, Rebind não. Install não tem DESCRIPTION, Rebind tem. Diferenças no OPTIONS. |
| IM_SIDEBAR | ✅ | ✅ | bitrix24-im-sidebar | OK — consistente |
| IM_CONTEXT_MENU | ✅ | ✅ | bitrix24-im-context-menu | OK — consistente |
| CRM_LEAD_DETAIL_TAB | ✅ | ✅ | bitrix24-crm-tab | OK — mas Rebind só regista este, e Install regista 4 CRM tabs |
| CRM_CONTACT_DETAIL_TAB | ✅ | ❌ | bitrix24-crm-tab | **Falta no Rebind** |
| CRM_DEAL_DETAIL_TAB (AI) | ✅ | ❌ | bitrix24-crm-tab | **Falta no Rebind** |
| CRM_DYNAMIC_DETAIL_TAB | ✅ | ❌ | bitrix24-crm-tab | **Falta no Rebind** |
| CRM_DEAL_DETAIL_TAB (Pay) | ✅ | ❌ | bitrix24-payment-tab | **Falta no Rebind** |
| CRM_CONTACT_DETAIL_TAB (Pay) | ✅ | ❌ | bitrix24-payment-tab | **Falta no Rebind** |
| Payment System (emmely_pay) | ✅ | ❌ | bitrix24-payment-handler | N/A — não é placement |

## Problemas Encontrados

### 1. Rebind está incompleto
O `bitrix24-rebind-events` só re-regista 5 placements (IM_TEXTAREA, CRM_LEAD_DETAIL_TAB, IM_SIDEBAR, IM_CONTEXT_MENU). Faltam **5 placements** que o Install regista:
- CRM_CONTACT_DETAIL_TAB (Emmely AI)
- CRM_DEAL_DETAIL_TAB (Emmely AI)
- CRM_DYNAMIC_DETAIL_TAB (Emmely AI)
- CRM_DEAL_DETAIL_TAB (Emmely Pay)
- CRM_CONTACT_DETAIL_TAB (Emmely Pay)

### 2. IM_TEXTAREA com configurações diferentes
- **Install**: `context: "LINES"`, sem DESCRIPTION, sem ICON
- **Rebind**: sem `context`, com DESCRIPTION, com ICON externo (flaticon)
- O `context: "LINES"` é importante para restringir o botão a Open Lines (não aparecer em chats internos)

### 3. Install IM_TEXTAREA não tem DESCRIPTION
O Rebind adiciona descrições multilínguas que o Install não tem.

## Correções

### Ficheiro 1: `supabase/functions/bitrix24-rebind-events/index.ts`

Adicionar os placements em falta ao rebind:
- Loop CRM tabs (Lead, Contact, Deal, Dynamic) → `bitrix24-crm-tab`
- CRM_DEAL_DETAIL_TAB + CRM_CONTACT_DETAIL_TAB → `bitrix24-payment-tab`

Uniformizar IM_TEXTAREA com o Install (adicionar `context: "LINES"`).

### Ficheiro 2: `supabase/functions/bitrix24-install/index.ts`

Uniformizar IM_TEXTAREA com o Rebind:
- Adicionar DESCRIPTION multilíngue ao Install

### Ficheiros a editar

1. **`supabase/functions/bitrix24-rebind-events/index.ts`** — adicionar 5 placements CRM em falta + uniformizar IM_TEXTAREA
2. **`supabase/functions/bitrix24-install/index.ts`** — adicionar DESCRIPTION ao IM_TEXTAREA para consistência

