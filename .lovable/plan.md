

## Sincronização Bidirecional Emmely ↔ Bitrix24

### Resumo
Implementar sincronização bidirecional de leads (e preparar para deals/contactos) entre o Emmely e o Bitrix24, com prevenção de loops e tracking via `bitrix24_id`.

### Componentes

#### 1. Migração DB — Adicionar campos de tracking à tabela `leads`
```sql
ALTER TABLE public.leads 
  ADD COLUMN bitrix24_id text,
  ADD COLUMN sync_source text DEFAULT 'emmely';
```
- `bitrix24_id`: ID do lead correspondente no Bitrix24
- `sync_source`: `'emmely'` ou `'bitrix24'` — usado para prevenir loops

#### 2. Nova Edge Function `bitrix24-sync`
Responsável pela sincronização Emmely → Bitrix24:
- **Endpoint POST** recebe `{ action: 'lead_create' | 'lead_update', lead_id, data }`
- Busca integração ativa em `bitrix24_integrations`, renova token via `ensureValidToken` (padrão já existente no worker)
- Mapeamento de campos:
  ```text
  name        → TITLE
  phone       → PHONE[0].VALUE
  email       → EMAIL[0].VALUE
  legal_area  → UF_LEGAL_AREA (campo custom)
  funnel_stage → STATUS_ID
  ```
- Chama `crm.lead.add` (se sem `bitrix24_id`) ou `crm.lead.update` (se já tem)
- Guarda o `bitrix24_id` retornado na tabela `leads`
- Marca `sync_source = 'emmely'` para o worker ignorar o echo

#### 3. Expandir `bitrix24-events` — Novos eventos CRM
Adicionar ao `SUPPORTED_EVENTS`:
- `ONCRMLEAD ADD`, `ONCRMLEAD UPDATE`

#### 4. Expandir `bitrix24-worker` — Handlers de CRM inbound
Novo handler `handleLeadEvent`:
- Recebe payload do evento `ONCRMLEAD*`
- Busca dados completos via `crm.lead.get`
- Verifica se já existe lead no Emmely com esse `bitrix24_id`
  - Se existe e `sync_source = 'emmely'` → ignora (anti-loop)
  - Se existe → atualiza dados
  - Se não existe → cria novo lead com `sync_source = 'bitrix24'`
- Mapeia campos inverso (TITLE→name, PHONE→phone, etc.)

#### 5. Integrar chamada sync no frontend (Leads.tsx)
Após `saveMutation.onSuccess`, fazer fire-and-forget `supabase.functions.invoke('bitrix24-sync', ...)` para sincronizar o lead criado/editado com o Bitrix24.

#### 6. Config
Adicionar `[functions.bitrix24-sync] verify_jwt = false` ao `config.toml`.

### Prevenção de Loops
```text
Emmely cria lead → sync_source='emmely' → chama bitrix24-sync → crm.lead.add
Bitrix24 dispara ONCRMLEAD ADD → worker recebe → verifica bitrix24_id existe + sync_source='emmely' → IGNORA
```
Após processar um evento inbound, o worker reseta `sync_source` para `null`, permitindo futuras edições manuais.

### Ficheiros a criar/modificar
| Ficheiro | Ação |
|---|---|
| Migration SQL | Criar — `bitrix24_id` e `sync_source` na tabela `leads` |
| `supabase/functions/bitrix24-sync/index.ts` | Criar — Emmely→Bitrix24 |
| `supabase/functions/bitrix24-events/index.ts` | Editar — adicionar eventos ONCRMLEAD* |
| `supabase/functions/bitrix24-worker/index.ts` | Editar — handler `handleLeadEvent` |
| `supabase/config.toml` | Editar — adicionar `bitrix24-sync` |
| `src/pages/Leads.tsx` | Editar — trigger sync após save |

