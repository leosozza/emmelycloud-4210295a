

## Diagnóstico: Dashboard KPIs todos a zero

### Causa raiz

O dashboard faz queries REST diretas às tabelas usando a **anon key** (linha 412):

```typescript
const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
```

Mas as tabelas têm RLS que exige roles autenticados:

| KPI | Tabela | RLS exigida | Resultado com anon key |
|-----|--------|-------------|----------------------|
| Cobranças Recebidas | `financial_records` | `is_admin()`, `is_financeiro()`, etc. | **0 registos** |
| Cobranças a Receber | `financial_records` | idem | **0 registos** |
| Conversas Activas | `conversations` | `authenticated` | **0 registos** |
| Mensagens Hoje | `messages` | `authenticated` | **0 registos** |
| Clientes na Carteira | `bitrix24-fetch-portfolio` (edge fn) | `service_role` interno | **Funciona ✓** |

O único KPI que funciona é "Clientes na Carteira" porque usa uma Edge Function que internamente usa `service_role`. Todos os outros falham silenciosamente (a REST API retorna `[]` quando RLS bloqueia).

### Solução

Criar uma **Edge Function `bitrix24-dashboard-stats`** que centraliza todas as queries do dashboard usando `service_role`, eliminando o problema de RLS. O frontend faz uma única chamada em vez de 8+ chamadas REST individuais.

### Alterações

**1. Nova Edge Function `bitrix24-dashboard-stats`**
- Recebe `member_id`, `start_date`, `end_date` como parâmetros
- Usa `service_role` para consultar:
  - `financial_records` — soma de `installment_value` por status (paga/pendente/atrasada) com filtros de data
  - `conversations` — count de status `aberta`/`em_atendimento`
  - `messages` — count de hoje
  - `conversations` — últimas 5 (para lista recente)
  - `financial_records` — últimos 5 pagamentos (para lista recente)
  - `messages` — count por dia nos últimos 7 dias (para gráfico)
  - `proposals` — aceitas no período (para ranking)
  - `profiles` — nomes para o ranking
- Retorna tudo num único JSON

**2. Frontend `Bitrix24App.tsx`**
- Substituir as 8+ chamadas `fetch` REST individuais por uma única chamada à nova Edge Function
- Manter a chamada separada ao `bitrix24-fetch-portfolio` (já funciona e é cacheada)
- Simplificar o `useEffect` do dashboard

### Resultado esperado
- Todos os 6 KPIs passam a mostrar valores reais
- Gráficos de mensagens e pagamentos populados
- Ranking de propostas visível
- Performance melhorada (1 chamada vs 8+)

### Ficheiros
- `supabase/functions/bitrix24-dashboard-stats/index.ts` (novo)
- `src/pages/Bitrix24App.tsx` (refactor do `fetchAll`)

