

## Plano: Apagar campos na desinstalação + Limpar antes de criar na instalação

### Problema
- Na **desinstalação** da app, os campos UF_CRM_EMMELY_* permanecem no Bitrix24 — ficam "órfãos"
- Na **reinstalação**, o sistema tenta criar campos que já existem (com labels antigos/inglês) e o Bitrix devolve "ALREADY EXISTS" — nada é atualizado
- Não existe handler para o evento `ONAPPUNINSTALL`

### Solução

#### 1. `bitrix24-install/index.ts` — Apagar campos ANTES de criar (clean install)

Na secção "Create Custom User Fields" (linhas ~693-830), antes do loop de criação:
- Listar campos existentes via `crm.deal.userfield.list` e `crm.lead.userfield.list`
- Filtrar os que começam com `UF_CRM_EMMELY_`
- Apagar cada um via `crm.deal.userfield.delete` / `crm.lead.userfield.delete`
- Só depois criar os novos — garante sempre labels PT e tipos corretos

#### 2. `bitrix24-install/index.ts` — Bind do evento ONAPPUNINSTALL

No bloco de bind de eventos (linhas ~462-486), adicionar:
- `ONAPPUNINSTALL` apontando para `bitrix24-events`

#### 3. `bitrix24-events/index.ts` — Handler de desinstalação

Quando receber evento `ONAPPUNINSTALL`:
- Listar e apagar todos os campos `UF_CRM_EMMELY_*` (Deal + Lead)
- Marcar integração como inativa no banco
- Log de debug

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Adicionar delete-before-create nos userfields + bind ONAPPUNINSTALL |
| `supabase/functions/bitrix24-events/index.ts` | Adicionar handler para ONAPPUNINSTALL que apaga campos |

