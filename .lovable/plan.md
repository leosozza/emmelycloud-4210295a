

## Plano: Corrigir Fase 3 — Sincronização de Quitados com Pipeline 15

### Problema atual
1. **Deal Stage**: O código usa `STAGE_ID: "WON"` hardcoded para quitados, mas o Bitrix espera o stage correto da Pipeline 15 (ex: `C15:WON` ou equivalente).
2. **Faturas sem data de pagamento**: As invoices (Smart Invoices Type 31) recebem `begindate` e `closedate` ambos como `due_date` (data de vencimento). A `paid_at` (DATAPAGTO / coluna P) nunca é enviada, então a fatura aparece sem registo de quando foi paga.
3. **BEGINDATE do Deal**: Já funciona — usa `contract_date` (coluna F "DATA").

### Correções no `supabase/functions/import-access-data/index.ts`

**A. Deal — Stage correto para Pipeline 15**
- Quando `category_id` é informado (Pipeline 15), buscar os stages reais dessa pipeline via `crm.dealcategory.stage.list` com `id: category_id`.
- Mapear: stage com `SEMANTICS: "S"` (success) para quitados, `SEMANTICS: "P"` (process/first) para novos.
- Fallback: se não conseguir buscar stages, usar `"WON"` como hoje.

**B. Faturas — Incluir data de pagamento**
- `begindate` = `due_date` (data de vencimento, coluna K) — já funciona.
- Quando `isPaid` e `fr.paid_at` existe:
  - `closedate` = `paid_at` (data do pagamento, coluna P).
  - Manter `stageId = "DT31_6:P"` (paga).
- Quando não pago:
  - `closedate` = `due_date` (mantém como está).

### Ficheiro alterado
- `supabase/functions/import-access-data/index.ts` (modo `sync_single_client`)

### Lógica resumida
```text
Deal novo (quitado):
  CATEGORY_ID = 15
  STAGE_ID = stage "success" da pipeline 15
  BEGINDATE = contract_date (coluna F)
  OPPORTUNITY = total_value

Fatura (parcela paga):
  begindate = due_date (coluna K)
  closedate = paid_at (coluna P)
  stageId = "DT31_6:P"

Fatura (parcela pendente/atrasada):
  begindate = due_date
  closedate = due_date
  stageId = "DT31_6:NEW" ou "DT31_6:UC"
```

