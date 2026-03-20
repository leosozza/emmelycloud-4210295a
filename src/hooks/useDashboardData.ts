import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DashboardKPIs {
  leadsNew: number;
  leadsChange: number;
  slaExpiring: number;
  revenueThisMonth: number;
  revenueChange: number;
  conversionRate: number;
  activeCases: number;
  pendingContracts: number;
}

interface LeadByOrigin {
  name: string;
  value: number;
}

interface FunnelStage {
  name: string;
  value: number;
}

interface FunnelPipeline {
  pipelineId: string;
  pipelineName: string;
  stages: FunnelStage[];
}

interface MonthlyRevenueItem {
  month: string;
  receita: number;
}

interface RevenueByAreaItem {
  area: string;
  receita: number;
}

export interface RecentLead {
  id: string;
  name: string;
  origin: string;
  funnel_stage: string;
  ai_score: number | null;
  created_at: string;
}

export interface DashboardData {
  kpis: DashboardKPIs;
  leadsByOrigin: LeadByOrigin[];
  funnel: FunnelPipeline[];
  monthlyRevenue: MonthlyRevenueItem[];
  revenueByArea: RevenueByAreaItem[];
  recentLeads: RecentLead[];
}

const originLabels: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", email: "Email",
  landing_page: "Landing Page", outro: "Outro",
};

const stageOrder = ["lead", "triagem", "proposta", "analise", "contrato", "financeiro", "fechado"];
const stageLabels: Record<string, string> = {
  lead: "Lead", triagem: "Triagem", proposta: "Proposta", analise: "Análise",
  contrato: "Contrato", financeiro: "Financeiro", fechado: "Fechado",
};

const areaLabels: Record<string, string> = {
  previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
  trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
  tributario: "Tributário", outro: "Outro",
};

function transformRpcResult(raw: any): DashboardData {
  const k = raw.kpis;
  const leadsChange = k.leadsPrev ? Math.round((k.leadsNew - k.leadsPrev) / k.leadsPrev * 100) : 0;
  const revenueChange = k.revenueLastMonth ? Math.round((k.revenueThisMonth - k.revenueLastMonth) / k.revenueLastMonth * 100) : 0;
  const conversionRate = k.totalLeads ? Math.round((k.convertedLeads / k.totalLeads) * 100) : 0;

  const leadsByOrigin = (raw.leadsByOrigin || []).map((item: any) => ({
    name: originLabels[item.name] || item.name,
    value: Number(item.value),
  }));

  // Map funnel — RPC fallback uses flat stages, wrap into pipeline format
  const funnelMap: Record<string, number> = {};
  (raw.funnel || []).forEach((item: any) => { funnelMap[item.name] = Number(item.value); });
  const funnel: FunnelPipeline[] = [{
    pipelineId: "0",
    pipelineName: "Pipeline padrão",
    stages: stageOrder.map((key) => ({ name: stageLabels[key] || key, value: funnelMap[key] || 0 })),
  }];

  const monthlyRevenue = (raw.monthlyRevenue || []).map((item: any) => ({
    month: item.month,
    receita: Number(item.receita),
  }));

  const revenueByArea = (raw.revenueByArea || []).map((item: any) => ({
    area: areaLabels[item.area] || item.area,
    receita: Number(item.receita),
  }));

  const recentLeads = (raw.recentLeads || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    origin: item.origin,
    funnel_stage: item.funnel_stage,
    ai_score: item.ai_score != null ? Number(item.ai_score) : null,
    created_at: item.created_at,
  }));

  return {
    kpis: {
      leadsNew: Number(k.leadsNew),
      leadsChange,
      slaExpiring: Number(k.slaExpiring),
      revenueThisMonth: Number(k.revenueThisMonth),
      revenueChange,
      conversionRate,
      activeCases: Number(k.activeCases),
      pendingContracts: Number(k.pendingContracts),
    },
    leadsByOrigin,
    funnel,
    monthlyRevenue,
    revenueByArea,
    recentLeads,
  };
}

export function useDashboardAll() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard-all"],
    queryFn: async () => {
      // Try Bitrix24 edge function first
      try {
        const { data, error } = await supabase.functions.invoke("dashboard-main");
        if (!error && data && !data.error) {
          return data as DashboardData;
        }
      } catch {
        // Fall through to RPC
      }

      // Fallback to local RPC
      const { data, error } = await supabase.rpc("get_dashboard_data" as any);
      if (error) throw error;
      return transformRpcResult(data);
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
}
