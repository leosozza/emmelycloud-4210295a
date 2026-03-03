

## Melhorar Relatórios Financeiros — Filtros e Relatório por Vendedor

### Problema

A `RelatoriosView` actual tem filtros por período (pills), gateway e cliente, mas falta:
1. **Filtro por Empresa** (`company_id` já existe em `payment_transactions`)
2. **Filtro por data personalizada** (date range picker, não apenas pills pré-definidas)
3. **Relatório por Vendedor/Responsável** — quem vendeu quanto e quanto já foi pago
4. **Separação clara de valor pago vs total** nos gráficos e KPIs

### O que a query actual faz

Busca `payment_transactions?select=*,clients(name)` — não traz `companies` nem dados de responsável. Precisa expandir a query.

### Alterações

#### 1. Expandir a query para trazer empresa e responsável

A `payment_transactions` tem `company_id` (FK para `companies`). Para o responsável, a metadata pode conter `responsible_id` ou podemos usar o `contract_id → proposals → created_by → profiles`. Abordagem pragmática: adicionar filtro por empresa (já temos dados) e usar `metadata.responsible_name` ou o campo de criação.

Alterar a query de fetch para:
```
payment_transactions?select=*,clients(name),companies(name)
```

#### 2. Adicionar filtro por data customizada (date range)

Substituir as pills fixas por um combo: manter as pills como atalhos rápidos, mas adicionar um date range picker (two dates) que override o período quando preenchido.

#### 3. Adicionar filtro por empresa

Um `Select` com as empresas disponíveis (extraídas dos dados carregados via `companies.name`).

#### 4. Novo gráfico/tabela: Recebimentos por Vendedor

Agrupar transações por `metadata.responsible_name` (ou campo equivalente) e mostrar:
- Vendedor | Total Cobrado | Total Pago | % Recebido

Se o campo responsável não existir na metadata, usar um campo genérico ou mostrar "Sem responsável".

#### 5. KPIs — adicionar "Total Cobrado" separado de "Total Pago"

Actualmente só mostra "Total Receita" (confirmed). Adicionar KPI de "Total Cobrado" (todas as transações) vs "Total Pago".

### Ficheiros Afectados

| Ficheiro | Alteração |
|---|---|
| `src/pages/Bitrix24App.tsx` | Refactorizar `RelatoriosView`: expandir query, adicionar filtros (empresa, date range), novo gráfico por vendedor, melhorar KPIs |

### Detalhes Técnicos

- **Date Range**: Usar o componente `Calendar` (Shadcn) com `mode="range"` dentro de um `Popover`
- **Filtro Empresa**: `Select` populado com empresas únicas dos dados
- **Gráfico Vendedor**: `BarChart` horizontal agrupando por `metadata.responsible_name`
- **Tabela resumo por vendedor**: Nome | Nº Transações | Total | Pago | Em Aberto | % Pago

