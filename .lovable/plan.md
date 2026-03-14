

## Plano: EmmeyPay — Gestor Financeiro Completo

### Estado Actual

O módulo financeiro actual (`/financeiro`) é apenas uma lista de transações com KPIs básicos (total recebido, pendente, taxa de confirmação). Os relatórios (`/relatorios > Financeiro`) mostram receita mensal e por gateway. A performance (`/relatorios > Performance`) mostra leads/casos por comercial/advogado, mas **sem dados financeiros vinculados**. Não existe nenhuma infraestrutura de comissões.

### O que será construído

```text
/financeiro (reestruturado com tabs)
├── Visão Geral      ← Dashboard financeiro com KPIs avançados
├── Recebimentos     ← Tabela actual de transações (já existe)
├── Inadimplência    ← Contas a receber vencidas, aging report
├── Comissões        ← Cálculo e gestão de comissões por vendedor
└── Ranking          ← Quem fechou mais propostas/receita (Bitrix24 + local)
```

### Implementação por componente

**1. Nova tabela `commission_rules` + `commission_entries`**

- `commission_rules`: define regras de comissão (percentagem por papel, por área jurídica, escalonamento por faixa de valor)
- `commission_entries`: registo de cada comissão calculada (vinculada a `payment_transactions` + `profiles`)
- Trigger: quando uma transação muda para `confirmed/paid`, calcula automaticamente a comissão do comercial/advogado atribuído ao lead/caso

**2. Reestruturar `/financeiro` com Tabs**

- **Visão Geral**: KPIs expandidos (receita total, pendente, vencido, ticket médio, receita por área jurídica, receita por advogado)
- **Recebimentos**: tabela actual (já funciona)
- **Inadimplência**: filtrar `payment_transactions` com `status = pending` e `metadata.due_date < now()`, aging buckets (1-30d, 31-60d, 61-90d, 90d+)
- **Comissões**: tabela de comissões calculadas, com filtro por período e vendedor, resumo por pessoa, botão de exportar
- **Ranking**: ranking de propostas aceitas e receita gerada por utilizador (comercial e advogado), com dados do Bitrix24 quando disponíveis

**3. Hook `useFinancialDashboard`**

Novo hook que agrega:
- Receita por área jurídica (join `payment_transactions` → `contracts` → `cases.legal_area`)
- Receita por advogado/comercial (join via `leads.assigned_*_id`)
- Aging report (agrupar pendentes por dias de atraso)
- Ranking de propostas aceitas por utilizador

**4. Relatório de Comissões exportável**

- CSV e PDF com: nome do vendedor, proposta, valor da transação, percentagem, valor da comissão, data
- Totais por vendedor e período

**5. Ranking Bitrix24**

- Para propostas originadas do Bitrix24, o `bitrix24_id` do lead já existe
- O ranking cruza `proposals.status = 'aceita'` com `leads.assigned_commercial_id` e `profiles.full_name`

### Tabelas a criar (migration)

```sql
-- Regras de comissão configuráveis
CREATE TABLE commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL DEFAULT 'comercial',
  legal_area legal_area NULL, -- NULL = aplica a todas
  percentage NUMERIC NOT NULL DEFAULT 10,
  min_value NUMERIC DEFAULT 0,
  max_value NUMERIC DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Comissões calculadas
CREATE TABLE commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL, -- references profiles.id
  transaction_id UUID, -- references payment_transactions.id
  proposal_id UUID, -- references proposals.id
  rule_id UUID, -- references commission_rules.id
  base_amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, paid
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Ficheiros a criar/modificar

| Ficheiro | Acção |
|----------|-------|
| Migration SQL | Criar `commission_rules` + `commission_entries` com RLS |
| `src/pages/Financeiro.tsx` | Reestruturar com 5 tabs |
| `src/components/financeiro/FinanceiroOverview.tsx` | Novo — dashboard com KPIs avançados |
| `src/components/financeiro/InadimplenciaTab.tsx` | Novo — aging report |
| `src/components/financeiro/ComissoesTab.tsx` | Novo — gestão de comissões |
| `src/components/financeiro/RankingTab.tsx` | Novo — ranking de vendedores |
| `src/components/financeiro/ComissaoRulesDialog.tsx` | Novo — configurar regras de comissão |
| `src/hooks/useFinancialDashboard.ts` | Novo — dados agregados para o dashboard |
| `src/hooks/useCommissions.ts` | Novo — CRUD comissões + cálculo |
| `src/components/relatorios/FinancialReport.tsx` | Expandir com receita por área/advogado |
| `src/hooks/useReportsData.ts` | Expandir `useFinancialReport` e `usePerformanceReport` com dados financeiros |

### Ordem de implementação

1. Migration: criar tabelas `commission_rules` e `commission_entries` com RLS
2. Hooks: `useFinancialDashboard` e `useCommissions`
3. Componentes: Overview, Inadimplência, Comissões, Ranking
4. Reestruturar `Financeiro.tsx` com tabs
5. Expandir relatórios existentes com dados financeiros cruzados

