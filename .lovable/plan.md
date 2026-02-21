

# Plano: Dashboard Financeiro Dinamico no iframe Bitrix24

## Objetivo

Criar uma nova vista "Relatorios" no painel do Bitrix24 (sidebar), com um dashboard financeiro interativo inspirado no Power BI, mostrando KPIs, graficos e tabelas com dados de `payment_transactions`. Mantendo o tema UX padrao Bitrix24 (claro/escuro).

## Layout do Dashboard

```text
+----------------------------------------------------------+
| [Periodo: 7d | 30d | 90d | Ano | Todos]                 |
+----------------------------------------------------------+
| Total Receita | Em Aberto | Em Atraso | Pagos | Taxa Pgto|
| EUR 12.500    | EUR 3.200 | EUR 800   | 45    | 78%      |
+----------------------------------------------------------+
| Receitas por Mes (grafico barras)   | Por Status (donut) |
|  jan  fev  mar  abr  mai  jun       |  Pago 78%          |
|  |||  |||  |||  |||  |||  |||       |  Pendente 15%      |
|                                      |  Atrasado 7%       |
+----------------------------------------------------------+
| Por Metodo de Pagamento (barras)    | Por Cliente (barras)|
|  Stripe |||||||  Asaas |||||        |  Cliente A ||||     |
|  Direto ||||                        |  Cliente B |||      |
+----------------------------------------------------------+
| Tabela Detalhada de Transacoes                           |
| Data | Cliente | Valor | Metodo | Gateway | Status | Vcto|
+----------------------------------------------------------+
```

## Alteracoes

### 1. Nova vista "Relatorios" no `Bitrix24App.tsx`

- Adicionar `"relatorios"` ao type `AppView`
- Adicionar item na sidebar: `{ id: "relatorios", label: "Relatorios", icon: BarChart3 }`
- Criar componente `RelatoriosView` dentro do ficheiro

### 2. Componente `RelatoriosView`

Busca todas as transacoes de `payment_transactions` via REST API e calcula metricas no frontend:

**KPIs (cards no topo):**
- Total Receita (soma de todas as transacoes confirmadas)
- Em Aberto (soma de pendentes nao atrasados)
- Em Atraso (pendentes com due_date < hoje, baseado em metadata.due_date)
- Total Pagos (contagem de confirmados)
- Taxa de Pagamento (% confirmados / total)

**Graficos (usando Recharts, ja instalado):**
- Receitas por Mes: BarChart com meses no eixo X, valor no Y, barras empilhadas (pago vs pendente)
- Por Status: PieChart/Donut com distribuicao pago/pendente/atrasado
- Por Metodo: BarChart horizontal com Stripe, Asaas, Direto
- Por Cliente: BarChart horizontal top 5 clientes por valor

**Filtro de Periodo:**
- Pills no topo: 7d, 30d, 90d, Ano, Todos
- Filtra os dados no frontend com base em `created_at`

**Tabela Detalhada:**
- Todas as transacoes do periodo, com colunas: Data, Cliente, Valor, Metodo, Gateway, Status, Vencimento
- Badges coloridos para status (Pago=verde, Pendente=amarelo, Atrasado=vermelho)

### 3. Tema Bitrix24

O componente usa as classes Tailwind existentes e respeita `isDark` do `useBitrix24Theme()`, tal como as outras vistas. Os graficos Recharts serao estilizados com cores coerentes:
- Pago: #589731 (verde Bitrix)
- Pendente: #c49c00 (amarelo)
- Atrasado: #df532d (vermelho)
- Barras primarias: #2fc6f6 (azul Bitrix)

## Detalhes Tecnicos

### Ficheiro alterado

**`src/pages/Bitrix24App.tsx`**
- Importar componentes Recharts: `BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend`
- Importar `BarChart3` do lucide-react
- Expandir type `AppView` com `"relatorios"`
- Adicionar nav item na sidebar
- Adicionar `{view === "relatorios" && <RelatoriosView />}` no main content
- Criar funcao `RelatoriosView` (~250 linhas)

### Consulta de dados

```typescript
// Buscar todas as transacoes (limite 1000)
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/payment_transactions?select=*,clients(name)&order=created_at.desc&limit=1000`,
  { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
);
```

### Calculo de metricas

```text
- confirmed: status === "confirmed"
- overdue: status === "pending" && metadata.due_date < today
- pending: status === "pending" && (no due_date || due_date >= today)
- totalRevenue: sum(confirmed.amount)
- openAmount: sum(pending.amount)
- overdueAmount: sum(overdue.amount)
- paymentRate: confirmed.length / all.length * 100
```

### Agrupamento por mes

```text
- Agrupa transacoes por mes (format: "Jan", "Fev", ...)
- Para cada mes: soma pago + soma pendente
- Ultimos 12 meses ou periodo selecionado
```

### Agrupamento por cliente

```text
- Agrupa por clients.name (do join)
- Ordena por valor total descendente
- Top 5 clientes
```

## Resumo de Impacto

- Nova vista "Relatorios" acessivel na sidebar do iframe Bitrix24
- Dashboard interativo com KPIs, 4 graficos e tabela detalhada
- Filtro de periodo dinamico
- Tema claro/escuro sincronizado com Bitrix24
- Sem alteracoes no backend (apenas leitura de dados existentes)
- Usa Recharts (ja instalado como dependencia)

