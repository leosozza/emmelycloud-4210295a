

## Plano: Corrigir lógica de estágios fix_stages

### Problema actual
A lógica actual do `fix_stages` tem falhas:
1. O frontend só envia `overdue_stage` — não envia `won_stage` nem `new_stage`
2. A lógica mapeia: todas pagas → WON (semântica S), caso contrário → primeiro stage (NEW). Não há distinção clara entre "Em Dia" e "Atrasado"
3. Quando não há `overdue_stage`, deals atrasados caem no stage NEW — errado

### Lógica correcta pretendida
Para cada deal da pipeline seleccionada, verificar os `financial_records` vinculados via `bitrix24_deal_id`:
- **Quitado** (todas as parcelas pagas) → stage "Quitado" (mapeado pelo utilizador)
- **Atrasado** (tem parcela não paga com `due_date < hoje`) → stage "Atrasado" (mapeado pelo utilizador)
- **Em Dia** (tem parcelas pendentes mas nenhuma atrasada) → stage "Em Dia" (mapeado pelo utilizador)

### Alterações

**A. Frontend (`Bitrix24App.tsx` — RevisaoView)**
1. Adicionar 3 selectores de stage (em vez de só 1 para "Atrasado"):
   - **Stage "Quitado"** — para deals com todas as parcelas pagas
   - **Stage "Atrasado"** — para deals com parcelas vencidas
   - **Stage "Em Dia"** — para deals com parcelas pendentes mas sem atraso
2. Enviar os 3 parâmetros: `won_stage`, `overdue_stage`, `new_stage`
3. Tornar obrigatório seleccionar os 3 stages antes de permitir "Corrigir Estágios"

**B. Backend (`bitrix24-cleanup-duplicates/index.ts` — fix_stages)**
1. Receber `won_stage`, `overdue_stage`, `new_stage` como parâmetros obrigatórios
2. Simplificar a lógica:
   - `allPaid` → usa `won_stage`
   - `hasOverdue` → usa `overdue_stage`
   - caso contrário (em dia) → usa `new_stage`
3. Deals sem `financial_records` → não alterar (skip), contar separadamente

### Ficheiros a editar
- `supabase/functions/bitrix24-cleanup-duplicates/index.ts` — lógica fix_stages
- `src/pages/Bitrix24App.tsx` — 3 selectores de stage + envio dos parâmetros

