CREATE OR REPLACE FUNCTION public.get_dashboard_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  now_ts timestamptz := now();
  thirty_days_ago timestamptz := now_ts - interval '30 days';
  sixty_days_ago timestamptz := now_ts - interval '60 days';
  four_hours_ahead timestamptz := now_ts + interval '4 hours';
  month_start timestamptz;
  prev_month_start timestamptz;
  v_leads_new bigint;
  v_leads_prev bigint;
  v_sla_expiring bigint;
  v_revenue_this numeric;
  v_revenue_last numeric;
  v_total_leads bigint;
  v_converted bigint;
  v_active_cases bigint;
  v_pending_contracts bigint;
  v_leads_by_origin jsonb;
  v_funnel jsonb;
  v_revenue_by_area jsonb;
  v_monthly_revenue jsonb;
  v_recent_leads jsonb;
BEGIN
  month_start := date_trunc('month', now_ts);
  prev_month_start := date_trunc('month', now_ts - interval '1 month');

  SELECT count(*) INTO v_leads_new FROM leads WHERE created_at >= thirty_days_ago;
  SELECT count(*) INTO v_leads_prev FROM leads WHERE created_at >= sixty_days_ago AND created_at < thirty_days_ago;
  SELECT count(*) INTO v_sla_expiring FROM leads WHERE sla_expires_at BETWEEN now_ts AND four_hours_ahead AND funnel_stage != 'fechado';

  SELECT coalesce(sum(total_value),0) INTO v_revenue_this FROM financial_records WHERE status='paga' AND paid_at >= month_start AND paid_at < month_start + interval '1 month';
  SELECT coalesce(sum(total_value),0) INTO v_revenue_last FROM financial_records WHERE status='paga' AND paid_at >= prev_month_start AND paid_at < prev_month_start + interval '1 month';

  SELECT count(*) INTO v_total_leads FROM leads;
  SELECT count(*) INTO v_converted FROM leads WHERE funnel_stage IN ('contrato','financeiro','fechado');

  SELECT count(*) INTO v_active_cases FROM cases WHERE status IN ('aberto','em_andamento','pendente_docs');
  SELECT count(*) INTO v_pending_contracts FROM proposals WHERE contract_status = 'pendente';

  SELECT coalesce(jsonb_agg(jsonb_build_object('name', t.origin_name, 'value', t.cnt)), '[]'::jsonb)
  INTO v_leads_by_origin
  FROM (SELECT origin::text AS origin_name, count(*) AS cnt FROM leads GROUP BY origin) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('name', t.stage_name, 'value', t.cnt)), '[]'::jsonb)
  INTO v_funnel
  FROM (SELECT funnel_stage::text AS stage_name, count(*) AS cnt FROM leads GROUP BY funnel_stage) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('month', t.m, 'receita', t.receita) ORDER BY t.d), '[]'::jsonb)
  INTO v_monthly_revenue
  FROM (
    SELECT d, to_char(d, 'Mon') AS m,
      coalesce((SELECT sum(total_value) FROM financial_records WHERE status='paga' AND paid_at >= d AND paid_at < d + interval '1 month'), 0) AS receita
    FROM generate_series(month_start - interval '5 months', month_start, interval '1 month') d
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('area', t.area, 'receita', t.receita) ORDER BY t.receita DESC), '[]'::jsonb)
  INTO v_revenue_by_area
  FROM (
    SELECT coalesce(c.legal_area::text, 'outro') AS area, sum(fr.total_value) AS receita
    FROM financial_records fr
    LEFT JOIN proposals p ON p.id = fr.proposal_id
    LEFT JOIN cases c ON c.id = p.case_id
    WHERE fr.status = 'paga'
    GROUP BY coalesce(c.legal_area::text, 'outro')
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'origin', t.origin,
    'funnel_stage', t.funnel_stage, 'ai_score', t.ai_score, 'created_at', t.created_at
  )), '[]'::jsonb)
  INTO v_recent_leads
  FROM (SELECT id, name, origin, funnel_stage, ai_score, created_at FROM leads ORDER BY created_at DESC LIMIT 5) t;

  RETURN jsonb_build_object(
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
END;
$$;