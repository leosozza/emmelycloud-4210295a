import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfMonth, endOfMonth, format, subMonths } from "date-fns";

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30).toISOString();
      const sixtyDaysAgo = subDays(now, 60).toISOString();

      // Leads last 30 days
      const { count: leadsNew } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo);

      // Leads previous 30 days
      const { count: leadsPrev } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sixtyDaysAgo)
        .lt("created_at", thirtyDaysAgo);

      // SLA expiring in next 4 hours
      const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
      const { count: slaExpiring } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .lte("sla_expires_at", fourHoursFromNow)
        .gte("sla_expires_at", now.toISOString())
        .not("funnel_stage", "eq", "fechado");

      // Revenue this month
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();
      const { data: finThisMonth } = await supabase
        .from("financial_records")
        .select("total_value")
        .eq("status", "paga")
        .gte("paid_at", monthStart)
        .lte("paid_at", monthEnd);

      const revenueThisMonth = (finThisMonth || []).reduce((s, r) => s + Number(r.total_value), 0);

      // Revenue last month
      const prevMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
      const prevMonthEnd = endOfMonth(subMonths(now, 1)).toISOString();
      const { data: finLastMonth } = await supabase
        .from("financial_records")
        .select("total_value")
        .eq("status", "paga")
        .gte("paid_at", prevMonthStart)
        .lte("paid_at", prevMonthEnd);

      const revenueLastMonth = (finLastMonth || []).reduce((s, r) => s + Number(r.total_value), 0);

      // Conversion rate: leads that reached "contrato" or "fechado" / total leads
      const { count: totalLeads } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true });

      const { count: convertedLeads } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .in("funnel_stage", ["contrato", "financeiro", "fechado"]);

      const conversionRate = totalLeads ? Math.round(((convertedLeads || 0) / totalLeads) * 100) : 0;

      // Active cases
      const { count: activeCases } = await supabase
        .from("cases")
        .select("*", { count: "exact", head: true })
        .in("status", ["aberto", "em_andamento", "pendente_docs"]);

      // Pending contracts (from unified proposals table)
      const { count: pendingContracts } = await supabase
        .from("proposals")
        .select("*", { count: "exact", head: true })
        .eq("contract_status", "pendente");

      const leadsChange = leadsPrev ? Math.round(((leadsNew || 0) - leadsPrev) / leadsPrev * 100) : 0;
      const revenueChange = revenueLastMonth ? Math.round((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100) : 0;

      return {
        leadsNew: leadsNew || 0,
        leadsChange,
        slaExpiring: slaExpiring || 0,
        revenueThisMonth,
        revenueChange,
        conversionRate,
        activeCases: activeCases || 0,
        pendingContracts: pendingContracts || 0,
      };
    },
    refetchInterval: 60000, // refresh every minute
  });
}

export function useLeadsByOrigin() {
  return useQuery({
    queryKey: ["dashboard-leads-by-origin"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("origin");
      const counts: Record<string, number> = {};
      (data || []).forEach((l) => {
        counts[l.origin] = (counts[l.origin] || 0) + 1;
      });
      const labels: Record<string, string> = {
        whatsapp: "WhatsApp", instagram: "Instagram", email: "Email",
        landing_page: "Landing Page", outro: "Outro",
      };
      return Object.entries(counts).map(([key, value]) => ({
        name: labels[key] || key,
        value,
      }));
    },
  });
}

export function useRevenueByArea() {
  return useQuery({
    queryKey: ["dashboard-revenue-by-area"],
    queryFn: async () => {
      // Get cases with their legal areas
      const { data: cases } = await supabase.from("cases").select("id, legal_area");
      const caseAreaMap = Object.fromEntries((cases || []).map((c) => [c.id, c.legal_area]));

      // Get paid financial records with proposal_id
      const { data: records } = await supabase
        .from("financial_records")
        .select("proposal_id, contract_id, total_value")
        .eq("status", "paga");

      // Get proposals with case_id for mapping
      const proposalIds = [...new Set((records || []).filter((r) => r.proposal_id).map((r) => r.proposal_id!))];
      const contractIds = [...new Set((records || []).filter((r) => !r.proposal_id && r.contract_id).map((r) => r.contract_id!))];
      
      const proposalCaseMap: Record<string, string> = {};
      if (proposalIds.length > 0) {
        const { data: props } = await supabase.from("proposals").select("id, case_id").in("id", proposalIds.slice(0, 100));
        (props || []).forEach((p) => { if (p.case_id) proposalCaseMap[p.id] = p.case_id; });
      }
      // Legacy fallback via contracts
      if (contractIds.length > 0) {
        const { data: contracts } = await supabase.from("contracts").select("id, case_id").in("id", contractIds.slice(0, 100));
        (contracts || []).forEach((c) => { if (c.case_id) proposalCaseMap[c.id] = c.case_id; });
      }

      const areaRevenue: Record<string, number> = {};
      (records || []).forEach((r) => {
        const lookupId = r.proposal_id || r.contract_id;
        const caseId = lookupId ? proposalCaseMap[lookupId] : null;
        const area = caseId ? caseAreaMap[caseId] || "outro" : "outro";
        areaRevenue[area] = (areaRevenue[area] || 0) + Number(r.total_value);
      });

      const labels: Record<string, string> = {
        previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
        trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
        tributario: "Tributário", outro: "Outro",
      };

      return Object.entries(areaRevenue)
        .map(([area, receita]) => ({ area: labels[area] || area, receita }))
        .sort((a, b) => b.receita - a.receita);
    },
  });
}

export function useMonthlyRevenue() {
  return useQuery({
    queryKey: ["dashboard-monthly-revenue"],
    queryFn: async () => {
      const now = new Date();
      const months: { month: string; receita: number }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        const start = startOfMonth(d).toISOString();
        const end = endOfMonth(d).toISOString();
        const { data } = await supabase
          .from("financial_records")
          .select("total_value")
          .eq("status", "paga")
          .gte("paid_at", start)
          .lte("paid_at", end);

        const total = (data || []).reduce((s, r) => s + Number(r.total_value), 0);
        months.push({ month: format(d, "MMM"), receita: total });
      }
      return months;
    },
  });
}

export function useFunnelData() {
  return useQuery({
    queryKey: ["dashboard-funnel"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("funnel_stage");
      const counts: Record<string, number> = {};
      (data || []).forEach((l) => {
        counts[l.funnel_stage] = (counts[l.funnel_stage] || 0) + 1;
      });
      const stages = [
        { key: "lead", label: "Lead" },
        { key: "triagem", label: "Triagem" },
        { key: "proposta", label: "Proposta" },
        { key: "analise", label: "Análise" },
        { key: "contrato", label: "Contrato" },
        { key: "financeiro", label: "Financeiro" },
        { key: "fechado", label: "Fechado" },
      ];
      return stages.map((s) => ({ name: s.label, value: counts[s.key] || 0 }));
    },
  });
}
