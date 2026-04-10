import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function ensureValidToken(sb: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return integration.access_token;
  }

  console.log("[dashboard-main] Refreshing token...");
  const response = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`Token refresh: ${data.error}`);

  await sb.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);

  return data.access_token;
}

async function bitrixPost(endpoint: string, method: string, params: Record<string, unknown> = {}, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${endpoint}${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        console.warn(`[dashboard-main] Non-JSON response (attempt ${attempt + 1}): ${text.slice(0, 200)}`);
        if (attempt === retries - 1) return { error: "non_json_response", error_description: text.slice(0, 500) };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[dashboard-main] Fetch error (attempt ${attempt + 1}/${retries}): ${msg}`);
      if (attempt === retries - 1) {
        return { error: "fetch_failed", error_description: msg };
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return { error: "max_retries_exceeded" };
}

async function fetchAllDeals(endpoint: string, auth: string) {
  const deals: any[] = [];
  let start = 0;
  const SELECT = ["ID", "TITLE", "STAGE_ID", "SOURCE_ID", "CATEGORY_ID", "DATE_CREATE", "ASSIGNED_BY_ID", "OPPORTUNITY"];
  while (true) {
    const res = await bitrixPost(endpoint, "crm.deal.list", { auth, select: SELECT, start });
    if (res.result) deals.push(...res.result);
    if (!res.next) break;
    start = res.next;
    if (deals.length > 10000) break; // safety limit
  }
  return deals;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get Bitrix24 integration
    const { data: integration } = await sb
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!integration?.access_token || !integration?.client_endpoint) {
      return new Response(JSON.stringify({ error: "No Bitrix24 integration" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ep = integration.client_endpoint;
    const auth = await ensureValidToken(sb, integration);
    const memberId = integration.member_id;

    // Check cache (5 min TTL)
    const { data: cached } = await sb
      .from("bitrix24_sync_cache")
      .select("*")
      .eq("member_id", memberId)
      .eq("cache_type", "dashboard_main")
      .single();

    const cachedData = cached?.data as any;
    const hasDealData = cachedData?.funnel?.length > 0 || cachedData?.recentLeads?.length > 0;
    if (cached && hasDealData && Date.now() - new Date(cached.fetched_at).getTime() < 5 * 60 * 1000) {
      console.log("[dashboard-main] Returning cached data");
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch deals + stage names + sources + pipelines in parallel
    const [deals, stagesRes, sourcesRes, categoriesRes] = await Promise.all([
      fetchAllDeals(ep, auth),
      bitrixPost(ep, "crm.status.list", { auth }),
      bitrixPost(ep, "crm.status.list", { auth, filter: { ENTITY_ID: "SOURCE" } }),
      bitrixPost(ep, "crm.category.list", { auth, entityTypeId: 2 }),
    ]);

    console.log(`[dashboard-main] Fetched ${deals.length} deals`);

    // Build pipeline name map
    const pipelineMap = new Map<string, string>();
    pipelineMap.set("0", "Pipeline padrão");
    if (categoriesRes.result?.items) {
      categoriesRes.result.items.forEach((c: any) => pipelineMap.set(String(c.id), c.name));
    } else if (categoriesRes.result) {
      (Array.isArray(categoriesRes.result) ? categoriesRes.result : []).forEach((c: any) =>
        pipelineMap.set(String(c.id ?? c.ID), c.name ?? c.NAME)
      );
    }

    // Build stage name map
    const stageMap = new Map<string, string>();
    if (stagesRes.result) {
      stagesRes.result.forEach((s: any) => stageMap.set(s.STATUS_ID, s.NAME));
    }

    // Build source name map
    const sourceMap = new Map<string, string>();
    if (sourcesRes.result) {
      sourcesRes.result.forEach((s: any) => sourceMap.set(String(s.STATUS_ID), s.NAME));
    }

    // Aggregate
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
    // funnel grouped by pipeline: { [categoryId]: { [stageName]: count } }
    const funnelByPipeline: Record<string, Record<string, number>> = {};
    const originCount: Record<string, number> = {};
    let dealsNew = 0, dealsPrev = 0, wonCount = 0;

    for (const d of deals) {
      const catId = String(d.CATEGORY_ID ?? "0");
      if (!funnelByPipeline[catId]) funnelByPipeline[catId] = {};

      const stageName = stageMap.get(d.STAGE_ID) || d.STAGE_ID || "Desconhecido";
      funnelByPipeline[catId][stageName] = (funnelByPipeline[catId][stageName] || 0) + 1;

      // Origin
      const sourceName = sourceMap.get(String(d.SOURCE_ID || "")) || "Sem origem";
      originCount[sourceName] = (originCount[sourceName] || 0) + 1;

      // Time-based KPIs
      const created = new Date(d.DATE_CREATE);
      if (created >= thirtyDaysAgo) dealsNew++;
      if (created >= sixtyDaysAgo && created < thirtyDaysAgo) dealsPrev++;

      // Won deals
      if (d.STAGE_ID?.includes("WON")) wonCount++;
    }

    // Build funnel array grouped by pipeline
    const funnel = Object.entries(funnelByPipeline).map(([catId, stages]) => ({
      pipelineId: catId,
      pipelineName: pipelineMap.get(catId) || `Pipeline ${catId}`,
      stages: Object.entries(stages)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    }));

    const leadsByOrigin = Object.entries(originCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Financial KPIs from DB
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const [revThisRes, revLastRes, pendingRes, casesRes] = await Promise.all([
      sb.from("financial_records").select("total_value").eq("status", "paga").gte("paid_at", monthStart),
      sb.from("financial_records").select("total_value").eq("status", "paga").gte("paid_at", prevMonthStart).lt("paid_at", monthStart),
      sb.from("proposals").select("id", { count: "exact", head: true }).eq("contract_status", "pendente"),
      sb.from("cases").select("id", { count: "exact", head: true }).in("status", ["aberto", "em_andamento", "pendente_docs"]),
    ]);

    const revenueThisMonth = (revThisRes.data || []).reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
    const revenueLastMonth = (revLastRes.data || []).reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);

    // Monthly revenue (last 6 months)
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const monthlyRevenue: { month: string; receita: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const { data: monthData } = await sb.from("financial_records")
        .select("total_value")
        .eq("status", "paga")
        .gte("paid_at", d.toISOString())
        .lt("paid_at", nextD.toISOString());
      monthlyRevenue.push({
        month: monthNames[d.getMonth()],
        receita: (monthData || []).reduce((s: number, r: any) => s + Number(r.total_value || 0), 0),
      });
    }

    // Revenue by area from financial_records + cases
    const { data: revAreaData } = await sb.from("financial_records")
      .select("total_value, proposal_id")
      .eq("status", "paga");

    // Get proposal -> case -> legal_area mapping
    const proposalIds = [...new Set((revAreaData || []).map((r: any) => r.proposal_id).filter(Boolean))];
    const areaMap = new Map<string, string>();
    if (proposalIds.length > 0) {
      // Fetch in chunks of 100
      for (let i = 0; i < proposalIds.length; i += 100) {
        const chunk = proposalIds.slice(i, i + 100);
        const { data: proposals } = await sb.from("proposals")
          .select("id, case_id")
          .in("id", chunk);
        const caseIds = (proposals || []).map((p: any) => p.case_id).filter(Boolean);
        if (caseIds.length > 0) {
          const { data: cases } = await sb.from("cases")
            .select("id, legal_area")
            .in("id", caseIds);
          const caseAreaMap = new Map((cases || []).map((c: any) => [c.id, c.legal_area]));
          (proposals || []).forEach((p: any) => {
            if (p.case_id && caseAreaMap.has(p.case_id)) {
              areaMap.set(p.id, caseAreaMap.get(p.case_id)!);
            }
          });
        }
      }
    }

    const areaLabels: Record<string, string> = {
      previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
      trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
      tributario: "Tributário", outro: "Outro",
    };
    const areaRevenue: Record<string, number> = {};
    (revAreaData || []).forEach((r: any) => {
      const area = areaMap.get(r.proposal_id) || "outro";
      const label = areaLabels[area] || area;
      areaRevenue[label] = (areaRevenue[label] || 0) + Number(r.total_value || 0);
    });
    const revenueByArea = Object.entries(areaRevenue)
      .map(([area, receita]) => ({ area, receita }))
      .sort((a, b) => b.receita - a.receita);

    // Recent deals (last 5)
    const recentLeads = deals
      .sort((a: any, b: any) => new Date(b.DATE_CREATE).getTime() - new Date(a.DATE_CREATE).getTime())
      .slice(0, 5)
      .map((d: any) => ({
        id: String(d.ID),
        name: d.TITLE || `Deal #${d.ID}`,
        origin: sourceMap.get(String(d.SOURCE_ID || "")) || "Sem origem",
        funnel_stage: stageMap.get(d.STAGE_ID) || d.STAGE_ID || "Desconhecido",
        ai_score: null,
        created_at: d.DATE_CREATE,
      }));

    const leadsChange = dealsPrev ? Math.round((dealsNew - dealsPrev) / dealsPrev * 100) : 0;
    const revenueChange = revenueLastMonth ? Math.round((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100) : 0;
    const conversionRate = deals.length ? Math.round((wonCount / deals.length) * 100) : 0;

    const result = {
      kpis: {
        leadsNew: dealsNew,
        leadsChange,
        slaExpiring: 0,
        revenueThisMonth,
        revenueChange,
        conversionRate,
        activeCases: casesRes.count || 0,
        pendingContracts: pendingRes.count || 0,
      },
      leadsByOrigin,
      funnel,
      monthlyRevenue,
      revenueByArea,
      recentLeads,
    };

    // Cache result
    if (cached) {
      await sb.from("bitrix24_sync_cache")
        .update({ data: result, fetched_at: new Date().toISOString() })
        .eq("id", cached.id);
    } else {
      await sb.from("bitrix24_sync_cache")
        .insert({ member_id: memberId, cache_type: "dashboard_main", data: result });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[dashboard-main] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
