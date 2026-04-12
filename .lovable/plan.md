

# Auditoria de Integração Bitrix24 via MCP — Resultados e Plano de Correção

## Metodologia
Consultei o servidor MCP oficial do Bitrix24 (`https://mcp-dev.bitrix24.com/mcp`) para validar todos os 52+ métodos REST API utilizados nas nossas Edge Functions contra a documentação oficial.

## Resultados da Auditoria

### Métodos Validados (OK) — 48 métodos
Todos os métodos principais estão corretos e documentados:
- `crm.item.add/update/list/fields` — Universal CRM (Smart Invoices)
- `crm.item.productrow.set` — Product rows universais
- `crm.lead.add/get/list/update/fields` — Leads
- `crm.deal.add/get/list/update/fields/delete` — Deals
- `crm.contact.add/get/list/update` — Contactos
- `placement.bind`, `event.bind/unbind`, `imbot.register` — App framework
- `crm.activity.configurable.add`, `crm.activity.badge.add/set` — Timeline
- `crm.timeline.comment.add`, `crm.status.list`, `crm.type.list` — Auxiliares
- `im.notify.system.add`, `im.user.get` — Mensageiro
- `user.current`, `user.get`, `app.info` — Sistema

### Problemas Encontrados — 3 Issues

#### Issue 1: `crm.invoice.add` — DEPRECADO
**Ficheiro**: `supabase/functions/bitrix24-robot-handler/index.ts` (linha 423)
**Problema**: O MCP confirma que `crm.invoice.add` está **deprecado**. A documentação recomenda usar os métodos universais (`crm.item.add` com `entityTypeId: 31`).
**Impacto**: Pode deixar de funcionar em atualizações futuras do Bitrix24.
**Fix**: Substituir por `crm.item.add` com `entityTypeId: 31` (Smart Invoice), alinhando com o que já fazemos na `bitrix24-sync` para Smart Invoices.

#### Issue 2: `crm.deal.productrows.set` — NÃO ENCONTRADO no MCP
**Ficheiro**: `supabase/functions/import-access-data/index.ts` (linha 1272)
**Problema**: O MCP não reconhece este método. A pesquisa sugere usar `crm.item.productrow.set` (universal) ou os métodos por tipo (`crm.lead.productrows.set`, `crm.quote.productrows.set`).
**Nota**: Este método pode funcionar na prática (APIs legadas não-documentadas), mas não está na documentação oficial. Como é usado apenas na importação de dados Access, o risco é baixo.
**Fix**: Migrar para `crm.item.productrow.set` com o `entityTypeId: 2` (Deal).

#### Issue 3: `calendar.event.add` / `calendar.accessibility.get` — NÃO NO MCP
**Ficheiro**: `supabase/functions/bitrix24-booking-tab/index.ts` (linhas 316, 264)
**Problema**: O MCP do Bitrix24 não indexou os métodos de calendário. Isto **não significa** que estejam errados — o MCP é focado em CRM/REST e pode não cobrir o módulo Calendar completo.
**Impacto**: Nenhum. Estes métodos existem e funcionam (documentados fora do scope do MCP).
**Fix**: Nenhum necessário. Métodos corretos conforme a documentação REST do Calendar.

## Plano de Correção

### Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-robot-handler/index.ts` | Migrar `crm.invoice.add` → `crm.item.add` com `entityTypeId: 31` |
| `supabase/functions/import-access-data/index.ts` | Migrar `crm.deal.productrows.set` → `crm.item.productrow.set` com `ownerTypeId: 2` |

### Detalhe das Correções

**1. Robot Handler — Smart Invoice via Universal API**
Substituir a chamada `crm.invoice.add` (legado) por `crm.item.add` com `entityTypeId: 31`, alinhando os campos ao formato universal (`title`, `begindate`, `closedate`, `parentId2`, etc.) — o mesmo padrão já usado na `bitrix24-sync`.

**2. Import Access Data — Product Rows Universal**
Substituir `crm.deal.productrows.set` por `crm.item.productrow.set` passando `ownerTypeId: 2` (Deal) e `ownerId: dealId`, mantendo o mesmo array de `rows`.

### Sem Alteração Necessária
- Métodos de Calendar (`calendar.event.add`, `calendar.accessibility.get`) — corretos, apenas não indexados no MCP
- Todos os 48+ outros métodos CRM/IM/REST — validados e corretos

