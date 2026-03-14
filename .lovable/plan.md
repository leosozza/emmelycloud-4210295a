

## Plano: Redesign do Dashboard Bitrix24

### Problema
O Dashboard actual mostra status de integração, configurações de bot e funções administrativas. Deveria mostrar um resumo operacional da aplicação (Emmely AI + EmmelyPay).

### Solução
Reestruturar o `DashboardView` em duas secções:

**1. Mover configurações para a aba de Settings**
- Os elementos actuais (status de integração, stepper "Início Rápido", agente do canal aberto, re-registar bot, webhooks, devolver ao bot, logs) passam para uma nova view `ConfigView` acessível via a aba Settings existente.

**2. Novo Dashboard com dados reais**
Buscar dados das tabelas existentes via REST API e mostrar:

**KPIs (4 cards topo):**
- Conversas activas (tabela `conversations`, status aberta/em_atendimento)
- Mensagens processadas hoje (tabela `messages`, count do dia)
- Receita do mês (tabela `financial_records`, status paga, mês actual)
- Pagamentos pendentes (tabela `financial_records`, status pendente/atrasada)

**Gráficos (2 colunas):**
- Emmely AI: gráfico de barras com mensagens por dia (últimos 7 dias) da tabela `messages`
- EmmelyPay: gráfico de barras com receita por status (pago/pendente/atrasado) da tabela `financial_records`

**Listas resumo (2 colunas):**
- Últimas conversas (5 mais recentes da tabela `conversations`)
- Últimos pagamentos (5 mais recentes da tabela `financial_records`)

**Mini status bar** no topo: integração conectada/desconectada + bot registado/não (compacto, 1 linha)

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Reescrever `DashboardView` com KPIs e gráficos; criar `ConfigView` com o conteúdo actual do dashboard; adicionar "configuracoes" ao `AppView` type e à navegação |

### Estrutura visual

```text
┌─────────────────────────────────────────────────┐
│ Dashboard  Portal: domain.com  [● Conectado] [● Bot OK] │
├────────┬────────┬────────┬────────┤
│Conversas│Mensagens│Receita │Pendente│
│   12    │  347   │ €8.4k  │ €1.2k  │
├─────────────────┬───────────────────┤
│ Emmely AI       │ Emmely Pay        │
│ [barras 7 dias] │ [barras status]   │
├─────────────────┬───────────────────┤
│ Últimas Conversas│ Últimos Pagamentos│
│ - Maria...      │ - €500 pago...    │
│ - João...       │ - €200 pendente...│
└─────────────────┴───────────────────┘
```

