

## Plano: Otimizar Dashboard com RPC Único

### Problema
O dashboard faz **~20 queries HTTP sequenciais** ao carregar:
- `useDashboardKPIs`: 9 queries sequenciais (leads 30d, leads 60d, SLA, receita mês, receita mês anterior, total leads, convertidos, cases, contratos pendentes)
- `useMonthlyRevenue`: 6 queries sequenciais (loop por mês)
- `useRevenueByArea`: 3-5 queries sequenciais (cases, records, proposals, contracts)
- `useLeadsByOrigin`, `useFunnelData`, `RecentLeads`: 1 query cada

Cada query é um round-trip HTTP separado (~100-300ms cada). Total: **3-6 segundos** de latência.

### Solução
Criar **uma única função SQL (RPC)** `get_dashboard_data` que retorna tudo num único round-trip. No frontend, substituir os 5 hooks por um único `useDashboardAll` que chama o RPC.

### 1. Migração SQL — Função `get_dashboard_data`

```sql
CREATE OR REPLACE FUNCTION public.get_dashboard_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  result jsonb;
  now_ts timestamptz := now();
  thirty_days_ago timestamptz := now_ts - interval '30 days';
  sixty_days_ago timestamptz := now_ts - interval '60 days';
  four_hours_ahead timestamptz := now_ts + interval '4 hours';
  month_start timestamptz; month_end timestamptz;
  prev_month_start timestamptz; prev_month_end timestamptz;
  -- KPIs
  v_leads_new int; v_leads_prev int; v_sla_expiring int;
  v_revenue_this numeric; v_revenue_last numeric;
  v_total_leads int; v_converted int;
  v_active_cases int; v_pending_contracts int;
  -- Charts
  v_leads_by_origin jsonb; v_funnel jsonb;
  v_revenue_by_area jsonb; v_monthly_revenue jsonb;
  v_recent_leads jsonb;
BEGIN
  -- All KPI counts (parallel in SQL)
  SELECT count(*) INTO v_leads_new FROM leads WHERE created_at >= thirty_days_ago;
  SELECT count(*) INTO v_leads_prev FROM leads WHERE created_at >= sixty_days_ago AND created_at < thirty_days_ago;
  SELECT count(*) INTO v_sla_expiring FROM leads WHERE sla_expires_at BETWEEN now_ts AND four_hours_ahead AND funnel_stage != 'fechado';
  -- Revenue this/last month
  month_start := date_trunc('month', now_ts);
  month_end := (month_start + interval '1 month' - interval '1 second');
  prev_month_start := date_trunc('month', now_ts - interval '1 month');
  prev_month_end := (prev_month_start + interval '1 month' - interval '1 second');
  SELECT coalesce(sum(total_value),0) INTO v_revenue_this FROM financial_records WHERE status='paga' AND paid_at BETWEEN month_start AND month_end;
  SELECT coalesce(sum(total_value),0) INTO v_revenue_last FROM financial_records WHERE status='paga' AND paid_at BETWEEN prev_month_start AND prev_month_end;
  -- Conversion
  SELECT count(*) INTO v_total_leads FROM leads;
  SELECT count(*) INTO v_converted FROM leads WHERE funnel_stage IN ('contrato','financeiro','fechado');
  -- Cases & contracts
  SELECT count(*) INTO v_active_cases FROM cases WHERE status IN ('aberto','em_andamento','pendente_docs');
  SELECT count(*) INTO v_pending_contracts FROM proposals WHERE contract_status = 'pendente';
  -- Leads by origin
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]') INTO v_leads_by_origin FROM (SELECT origin as name, count(*) as value FROM leads GROUP BY origin) t;
  -- Funnel
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]') INTO v_funnel FROM (SELECT funnel_stage as name, count(*) as value FROM leads GROUP BY funnel_stage) t;
  -- Monthly revenue (last 6 months)
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.month_start), '[]') INTO v_monthly_revenue FROM (
    SELECT to_char(d, 'Mon') as month, date_trunc('month', d) as month_start,
      coalesce((SELECT sum(total_value) FROM financial_records WHERE status='paga' AND paid_at >= date_trunc('month',d) AND paid_at < date_trunc('month',d)+interval '1 month'), 0) as receita
    FROM generate_series(date_trunc('month',now_ts) - interval '5 months', date_trunc('month',now_ts), interval '1 month') d
  ) t;
  -- Revenue by area (via proposals → cases)
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]') INTO v_revenue_by_area FROM (
    SELECT coalesce(c.legal_area::text, 'outro') as area, sum(fr.total_value) as receita
    FROM financial_records fr
    LEFT JOIN proposals p ON p.id = fr.proposal_id
    LEFT JOIN cases c ON c.id = p.case_id
    WHERE fr.status = 'paga'
    GROUP BY coalesce(c.legal_area::text, 'outro')
    ORDER BY sum(fr.total_value) DESC
  ) t;
  -- Recent leads
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]') INTO v_recent_leads FROM (
    SELECT id, name, origin, funnel_stage, ai_score, created_at FROM leads ORDER BY created_at DESC LIMIT 5
  ) t;

  result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'leadsNew', v_leads_new, 'leadsPrev', v_leads_prev,
      'slaExpiring', v_sla_expiring,
      'revenueThisMonth', v_revenue_this, 'revenueLastMonth', v_revenue_last,
      'totalLeads', v_total_leads, 'convertedLeads', v_converted,
      'activeCases', v_active_cases, 'pendingContracts', v_pending_contracts
    ),
    'leadsByOrigin', v_leads_by_origin,
    'funnel', v_funnel,
    'monthlyRevenue', v_monthly_revenue,
    'revenueByArea', v_revenue_by_area,
    'recentLeads', v_recent_leads
  );
  RETURN result;
END;
$$;
```

### 2. Frontend — Novo hook `useDashboardAll`

Substituir os 5 hooks individuais por um único:

```typescript
// src/hooks/useDashboardData.ts — reescrita
export function useDashboardAll() {
  return useQuery({
    queryKey: ["dashboard-all"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_data");
      if (error) throw error;
      // Parse and transform the RPC result into the shapes expected by components
      return transformRpcResult(data);
    },
    refetchInterval: 60000,
  });
}
```

### 3. Componentes actualizados

- `DashboardKPIs.tsx` — receber dados via props do pai (Index.tsx) em vez de chamar hook próprio
- `DashboardChartsLive.tsx` — idem, receber dados via props
- `RecentLeads.tsx` — idem
- `Index.tsx` — chamar `useDashboardAll()` uma vez e passar dados aos componentes filhos

### Resultado esperado
- **Antes**: ~20 queries HTTP sequenciais → 3-6s
- **Depois**: 1 query RPC → ~200-400ms

### Ficheiros alterados
| Ficheiro | Alteração |
|----------|-----------|
| Migração SQL | Criar `get_dashboard_data()` |
| `src/hooks/useDashboardData.ts` | Reescrever com RPC único |
| `src/pages/Index.tsx` | Usar `useDashboardAll`, passar dados via props |
| `src/components/dashboard/DashboardKPIs.tsx` | Aceitar dados via props |
| `src/components/dashboard/DashboardChartsLive.tsx` | Aceitar dados via props |
| `src/components/dashboard/RecentLeads.tsx` | Aceitar dados via props |

