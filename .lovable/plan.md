

## Diagnóstico: Por que Relatórios Financeiros e Dashboard mostram zero / valores iguais

### Problema raiz: campos de data errados nos filtros

A tabela `financial_records` tem 6.997 registros com 3 datas distintas:
- **`created_at`** = data de contratação (coluna F "DATA") — vai de 2021-04 a 2026-02-16
- **`due_date`** = data de vencimento da parcela (coluna K) — 6.936 preenchidos
- **`paid_at`** = data de pagamento (coluna P "DATAPAGTO") — 5.905 preenchidos

**O que acontece hoje:**
1. **Relatórios** (`useFinancialReport`): filtra TUDO por `created_at`. Como o máximo de `created_at` é 2026-02-16, o filtro padrão "este mês" (março 2026) retorna **0 registros**. E como `created_at` é a data de contrato, mudar entre "7d", "30d" ou "hoje" não altera nada significativo.

2. **Dashboard Financeiro** (`useFinancialDashboard` / `FinanceiroOverview`): ainda consulta a tabela **`payment_transactions`** que está **vazia** (0 registros). Nunca foi migrado para `financial_records`.

3. **Dashboard KPIs** (`useDashboardData`): usa `paid_at` para receita mensal (correto), mas o `FinanceiroOverview` ignora completamente o `financial_records`.

### Dados reais disponíveis
- Março 2026: 3 pagamentos registrados, 16 no último mês (~€1.998)
- 5.905 pagamentos confirmados no total (~€855k)
- 545 pendentes, 547 atrasados

---

## Plano de correção

### 1. Corrigir `useFinancialReport` (Relatórios)
- **Receita (Paga)**: filtrar por `paid_at` em vez de `created_at`
- **Pendentes**: filtrar por `due_date` (vencimentos no período)
- **Em Atraso**: filtrar por `due_date < hoje AND status = atrasada`
- **Agrupamento mensal**: usar `paid_at` para receita paga
- **Comparação período anterior**: usar `paid_at`
- Manter `created_at` apenas para contexto de "data de contratação" se necessário

### 2. Corrigir `useFinancialDashboard` (Dashboard /financeiro)
- Migrar de `payment_transactions` para `financial_records`
- KPIs: Total Recebido (por `paid_at`), Pendente (por `due_date`), Em Atraso (`due_date < now AND status != paga`), Ticket Médio
- Aging buckets: usar `due_date` para calcular dias de atraso
- Revenue by Area: via `contract_id → cases → legal_area`

### 3. Corrigir `Financeiro.tsx` (página /financeiro)
- Lista de transações: migrar de `payment_transactions` para `financial_records`
- Filtro de período: aplicar por `paid_at` (para pagas) e `due_date` (para pendentes/atrasadas)

### Ficheiros alterados
- `src/hooks/useReportsData.ts` — `useFinancialReport`
- `src/hooks/useFinancialDashboard.ts` — migrar para `financial_records`
- `src/pages/Financeiro.tsx` — migrar tabela de transações
- `src/components/financeiro/FinanceiroOverview.tsx` — ajustar props se necessário

