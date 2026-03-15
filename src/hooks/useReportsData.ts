import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, format, differenceInHours } from "date-fns";

export interface ReportFilters {
  startDate: Date;
  endDate: Date;
  legalArea: string | null;
  responsibleId: string | null;
}

export function useLeadsReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports-leads", filters.startDate, filters.endDate, filters.legalArea, filters.responsibleId],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, name, funnel_stage, origin, legal_area, created_at, assigned_commercial_id, assigned_attorney_id")
        .gte("created_at", filters.startDate.toISOString())
        .lte("created_at", filters.endDate.toISOString());

      if (filters.legalArea && filters.legalArea !== "all") {
        query = query.eq("legal_area", filters.legalArea as any);
      }
      if (filters.responsibleId && filters.responsibleId !== "all") {
        query = query.or(`assigned_commercial_id.eq.${filters.responsibleId},assigned_attorney_id.eq.${filters.responsibleId}`);
      }

      const { data: leads, error } = await query;
      if (error) throw error;

      const stages = ["lead", "triagem", "proposta", "analise", "contrato", "financeiro", "fechado"];
      const funnelData = stages.map((stage) => ({
        stage,
        label: stage.charAt(0).toUpperCase() + stage.slice(1),
        count: leads?.filter((l) => l.funnel_stage === stage).length || 0,
      }));

      // Conversion rates
      const conversionRates = stages.slice(0, -1).map((stage, i) => {
        const current = funnelData[i].count;
        const next = funnelData[i + 1].count;
        return {
          from: stage,
          to: stages[i + 1],
          rate: current > 0 ? Math.round((next / current) * 100) : 0,
        };
      });

      // Origins
      const originCounts: Record<string, number> = {};
      leads?.forEach((l) => {
        const origin = l.origin || "outro";
        originCounts[origin] = (originCounts[origin] || 0) + 1;
      });
      const originData = Object.entries(originCounts).map(([name, value]) => ({ name, value }));

      // Legal area breakdown
      const areaCounts: Record<string, number> = {};
      leads?.forEach((l) => {
        const area = l.legal_area || "outro";
        areaCounts[area] = (areaCounts[area] || 0) + 1;
      });
      const areaData = Object.entries(areaCounts).map(([name, value]) => ({ name, value }));

      return {
        total: leads?.length || 0,
        funnelData,
        conversionRates,
        originData,
        areaData,
        leads: leads || [],
      };
    },
  });
}

export function useFinancialReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports-financial", filters.startDate, filters.endDate, filters.legalArea],
    queryFn: async () => {
      // Use financial_records (imported from Access) as the primary data source
      const { data: records, error } = await supabase
        .from("financial_records")
        .select("id, installment_value, total_value, status, payment_method, due_date, paid_at, created_at, contract_id")
        .gte("created_at", filters.startDate.toISOString())
        .lte("created_at", filters.endDate.toISOString());

      if (error) throw error;

      // Previous period for comparison
      const periodDays = Math.ceil((filters.endDate.getTime() - filters.startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStart = new Date(filters.startDate);
      prevStart.setDate(prevStart.getDate() - periodDays);
      const prevEnd = new Date(filters.startDate);

      const { data: prevRecords } = await supabase
        .from("financial_records")
        .select("id, installment_value, status")
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString());

      const paid = records?.filter((r) => r.status === "paga") || [];
      const pending = records?.filter((r) => r.status === "pendente" || r.status === "atrasada") || [];
      const overdue = records?.filter((r) => r.status === "atrasada") || [];
      const prevPaid = prevRecords?.filter((r) => r.status === "paga") || [];

      const totalReceived = paid.reduce((s, r) => s + Number(r.installment_value || 0), 0);
      const totalPending = pending.reduce((s, r) => s + Number(r.installment_value || 0), 0);
      const totalOverdue = overdue.reduce((s, r) => s + Number(r.installment_value || 0), 0);
      const prevTotal = prevPaid.reduce((s, r) => s + Number(r.installment_value || 0), 0);
      const growth = prevTotal > 0 ? Math.round(((totalReceived - prevTotal) / prevTotal) * 100) : 0;

      // Monthly breakdown (by created_at which holds the contract date from Access DATA column)
      const monthlyMap: Record<string, number> = {};
      paid.forEach((r) => {
        const month = format(new Date(r.created_at), "yyyy-MM");
        monthlyMap[month] = (monthlyMap[month] || 0) + Number(r.installment_value || 0);
      });
      const monthlyData = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({ month, value }));

      // By status breakdown (replaces gateway)
      const statusMap: Record<string, number> = {};
      records?.forEach((r) => {
        const label = r.status === "paga" ? "Paga" : r.status === "atrasada" ? "Em Atraso" : "Pendente";
        statusMap[label] = (statusMap[label] || 0) + Number(r.installment_value || 0);
      });
      const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

      return {
        totalReceived,
        totalPending,
        totalOverdue,
        totalTransactions: records?.length || 0,
        paidCount: paid.length,
        pendingCount: pending.length,
        overdueCount: overdue.length,
        growth,
        monthlyData,
        statusData,
        records: records || [],
      };
    },
  });
}

export function useAtendimentoReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports-atendimento", filters.startDate, filters.endDate],
    queryFn: async () => {
      const { data: conversations, error } = await supabase
        .from("conversations")
        .select("id, channel, status, assigned_to, created_at, last_message_at, last_customer_message_at, attendance_mode")
        .gte("created_at", filters.startDate.toISOString())
        .lte("created_at", filters.endDate.toISOString());

      if (error) throw error;

      // By channel
      const channelMap: Record<string, number> = {};
      conversations?.forEach((c) => {
        channelMap[c.channel] = (channelMap[c.channel] || 0) + 1;
      });
      const channelData = Object.entries(channelMap).map(([name, value]) => ({ name, value }));

      // By status
      const statusMap: Record<string, number> = {};
      conversations?.forEach((c) => {
        statusMap[c.status] = (statusMap[c.status] || 0) + 1;
      });
      const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

      // By agent
      const agentMap: Record<string, number> = {};
      conversations?.forEach((c) => {
        const agent = c.assigned_to || "Não atribuído";
        agentMap[agent] = (agentMap[agent] || 0) + 1;
      });
      const agentData = Object.entries(agentMap).map(([name, value]) => ({ name, value }));

      // Bot vs human
      const botCount = conversations?.filter((c) => c.attendance_mode === "bot").length || 0;
      const humanCount = conversations?.filter((c) => c.attendance_mode === "human").length || 0;

      // Avg response time (simplified)
      let totalResponseTime = 0;
      let responseCount = 0;
      conversations?.forEach((c) => {
        if (c.last_customer_message_at && c.last_message_at) {
          const diff = differenceInHours(new Date(c.last_message_at), new Date(c.last_customer_message_at));
          if (diff >= 0 && diff < 168) {
            totalResponseTime += diff;
            responseCount++;
          }
        }
      });
      const avgResponseHours = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0;

      return {
        total: conversations?.length || 0,
        channelData,
        statusData,
        agentData,
        botCount,
        humanCount,
        avgResponseHours,
        conversations: conversations || [],
      };
    },
  });
}

export function usePerformanceReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports-performance", filters.startDate, filters.endDate, filters.legalArea],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, user_id");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");

      let leadsQuery = supabase
        .from("leads")
        .select("id, assigned_commercial_id, assigned_attorney_id, funnel_stage, created_at")
        .gte("created_at", filters.startDate.toISOString())
        .lte("created_at", filters.endDate.toISOString());

      if (filters.legalArea && filters.legalArea !== "all") {
        leadsQuery = leadsQuery.eq("legal_area", filters.legalArea as any);
      }

      const { data: leads } = await leadsQuery;

      let casesQuery = supabase
        .from("cases")
        .select("id, assigned_attorney_id, status, legal_area, created_at")
        .gte("created_at", filters.startDate.toISOString())
        .lte("created_at", filters.endDate.toISOString());

      if (filters.legalArea && filters.legalArea !== "all") {
        casesQuery = casesQuery.eq("legal_area", filters.legalArea as any);
      }

      const { data: cases } = await casesQuery;

      // Commercial performance
      const comercialProfiles = profiles?.filter((p) =>
        roles?.some((r) => r.user_id === p.user_id && (r.role === "comercial" || r.role === "admin"))
      ) || [];

      const comercialData = comercialProfiles.map((p) => {
        const assigned = leads?.filter((l) => l.assigned_commercial_id === p.id) || [];
        const converted = assigned.filter((l) => l.funnel_stage === "fechado" || l.funnel_stage === "contrato" || l.funnel_stage === "financeiro");
        return {
          name: p.full_name || "Sem nome",
          leads: assigned.length,
          converted: converted.length,
          rate: assigned.length > 0 ? Math.round((converted.length / assigned.length) * 100) : 0,
        };
      });

      // Attorney performance
      const advogadoProfiles = profiles?.filter((p) =>
        roles?.some((r) => r.user_id === p.user_id && (r.role === "advogado" || r.role === "admin"))
      ) || [];

      const advogadoData = advogadoProfiles.map((p) => {
        const assigned = cases?.filter((c) => c.assigned_attorney_id === p.id) || [];
        const concluded = assigned.filter((c) => c.status === "concluido");
        return {
          name: p.full_name || "Sem nome",
          cases: assigned.length,
          concluded: concluded.length,
          rate: assigned.length > 0 ? Math.round((concluded.length / assigned.length) * 100) : 0,
        };
      });

      return {
        comercialData,
        advogadoData,
        totalLeads: leads?.length || 0,
        totalCases: cases?.length || 0,
      };
    },
  });
}

export function useReportProfiles() {
  return useQuery({
    queryKey: ["report-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data || [];
    },
  });
}
