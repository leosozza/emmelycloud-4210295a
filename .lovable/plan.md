

## Plano: Ferramenta de Revisão e Limpeza de Duplicados na Pipeline 15

### Problema
A screenshot mostra deals marcados como "negócio repetido" na Pipeline 15 do Bitrix24. A sincronização criou duplicados antes das correções de reutilização de IDs. Agora é preciso:
1. Identificar deals duplicados (mesmo contacto/NIF/Access ID)
2. Mesclar — manter o deal principal, eliminar os duplicados
3. Garantir que cada deal está no stage correto (Em dia / Atrasado / Quitados)

### Solução: Nova Edge Function `bitrix24-cleanup-duplicates`

**Acções suportadas:**

**A. `scan` — Identificar duplicados**
- Buscar TODOS os deals da Pipeline 15 (CATEGORY_ID=15) via paginação
- Agrupar por `UF_CRM_1768312831` (Access ID) e por `UF_CRM_1733687549802` (NIF)
- Retornar lista de grupos com >1 deal, incluindo: ID, título, stage, valor, contacto, data de criação
- O utilizador vê claramente quais são duplicados

**B. `merge` — Mesclar duplicados**
- Para cada grupo: manter o deal mais antigo (ou o que tem mais actividades)
- Transferir actividades/timeline do duplicado para o principal (via `crm.activity.list` + `crm.activity.update`)
- Actualizar `financial_records.bitrix24_deal_id` local para apontar ao deal sobrevivente
- Eliminar os deals duplicados via `crm.deal.delete`

**C. `fix_stages` — Corrigir estágios**
- Para cada deal na Pipeline 15, consultar os `financial_records` locais pelo `bitrix24_deal_id`
- Recalcular o stage correcto: todas pagas → C15:WON, alguma atrasada → C15:UC_S7RLFB, senão → C15:NEW
- Actualizar via `crm.deal.update` apenas os que estão no stage errado
- Retornar relatório: X corrigidos, Y já correctos

### Frontend: Nova view "Revisão" no Bitrix24App

Na página `/bitrix24/importacao`, adicionar uma nova aba/view **"Revisão Bitrix"** com:
- Botão "Escanear Duplicados" → chama `scan`, mostra tabela agrupada
- Para cada grupo duplicado: radio para escolher o deal principal + botão "Mesclar"
- Botão "Corrigir Estágios" → chama `fix_stages`, mostra relatório
- KPIs: Total deals, Duplicados encontrados, Estágios corrigidos

### Ficheiros a criar/editar
- **Criar**: `supabase/functions/bitrix24-cleanup-duplicates/index.ts`
- **Editar**: `src/pages/Bitrix24App.tsx` — adicionar view "Revisão"

### Segurança
- A edge function usa `service_role` + valida `member_id`
- Merge é irreversível — confirmar com o utilizador antes de executar
- Logs detalhados salvos em `bitrix24_debug_logs`

