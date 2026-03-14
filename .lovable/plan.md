

## Plano: Dashboard Bitrix24 com KPIs financeiros, ranking e filtro de datas

### Objectivo
Enriquecer o `DashboardView` em `/bitrix24` com:
1. Total de clientes na carteira
2. Total de cobranças recebidas e a receber
3. Ranking de negócios fechados por responsável
4. Filtro de período (datas)

### Alterações

**Ficheiro: `src/pages/Bitrix24App.tsx` — `DashboardView`**

1. **Adicionar estado de período** — dois date pickers (início/fim) com presets rápidos (7d, 30d, mês, trimestre, ano), usando o mesmo padrão `PeriodFilter` ou botões inline. Todas as queries passam a usar o range seleccionado.

2. **Novos KPIs** (substituir/expandir os 4 actuais para 6):
   - Clientes na Carteira — `SELECT count(*) FROM clients`
   - Cobranças Recebidas — `payment_transactions` com `status=in.(confirmed,paid)` no período
   - Cobranças a Receber — `payment_transactions` com `status=eq.pending` no período
   - Receita do Mês — soma dos valores pagos no período
   - Conversas Activas — manter
   - Mensagens Hoje — manter

3. **Ranking de negócios fechados por responsável** — nova secção com:
   - Query: `proposals` com `status=aceita` no período, agrupadas por `created_by`
   - JOIN com `profiles` para obter o nome do responsável
   - Tabela ordenada por valor total descendente, com posição (#1, #2...), nome, quantidade de propostas e valor total
   - Top 3 com destaque visual (medalhas)

4. **Filtro de datas no header** — barra com botões de período rápido + date pickers para início e fim, posicionada entre o header e os KPIs. As queries de KPIs, gráficos, ranking e listas recentes passam a respeitar o período.

### Estrutura visual

```text
┌──────────────────────────────────────────────────┐
│ Dashboard — Portal: domain.bitrix24.com          │
├──────────────────────────────────────────────────┤
│ [7d] [30d] [Mês] [Trim] [Ano]  📅 dd/mm — dd/mm│
├──────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐│
│ │Clien│ │Receb│ │A Rec│ │Recei│ │Conv │ │Msg  ││
│ │tes  │ │idas │ │eber │ │ta   │ │Ativ │ │Hoje ││
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘│
├──────────────────────────────────────────────────┤
│ Gráficos (mensagens + pagamentos)                │
├──────────────────────────────────────────────────┤
│ Ranking de Negócios Fechados                     │
│ #1 🥇 João Silva    5 propostas    €12.500       │
│ #2 🥈 Ana Costa     3 propostas    €8.200        │
│ #3 🥉 Pedro Lopes   2 propostas    €5.000        │
├──────────────────────────────────────────────────┤
│ Últimas Conversas  |  Últimos Pagamentos         │
└──────────────────────────────────────────────────┘
```

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Modificar `DashboardView`: adicionar filtro de datas, novos KPIs (clientes, cobranças recebidas/a receber), ranking de propostas aceitas por responsável |

