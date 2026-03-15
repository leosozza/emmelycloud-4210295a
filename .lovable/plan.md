

## Problema

Os KPIs "Cobranças Recebidas", "Cobranças a Receber" e "Receita Total" mostram €0.00 porque consultam `payment_transactions` via REST com anon key (bloqueado por RLS). Os dados financeiros reais estao nos `financial_records` importados do Access, e o endpoint `bitrix24-fetch-portfolio` ja retorna os totais agregados: `totals: { value, paid, pending, overdue }`.

## Solucao

No `fetchAll` (linhas 428-435), somar os totais do portfolio aos valores de `payment_transactions`:

```typescript
const ptReceived = (revenueRes || []).reduce((s, t) => s + Number(t.amount), 0);
const ptPending = (pendingRes || []).reduce((s, t) => s + Number(t.amount), 0);
const portfolioPaid = portfolioRes?.totals?.paid ?? 0;
const portfolioPending = (portfolioRes?.totals?.pending ?? 0) + (portfolioRes?.totals?.overdue ?? 0);

setStats({
  ...
  revenueReceived: ptReceived + portfolioPaid,
  revenuePending: ptPending + portfolioPending,
  ...
});
```

Na linha 645, corrigir "Receita Total" para mostrar `stats.revenueReceived + stats.revenuePending` em vez de duplicar `stats.revenueReceived`.

Tambem atualizar o grafico "Receita por Status" (paymentChart) para incluir os totais do portfolio, mostrando barras com valores reais de Pago/Pendente/Atrasado.

### Ficheiro alterado
- `src/pages/Bitrix24App.tsx` — linhas 428-435 (setStats) e linha 645 (KPI Receita Total) e zona do paymentChart (~linha 437-445)

