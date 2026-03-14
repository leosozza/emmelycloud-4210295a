import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

export interface AgingBucket {
  label: string;
  count: number;
  amount: number;
}

export interface RevenueByArea {
  area: string;
  amount: number;
}

export interface RevenueByPerson {
  profileId: string;
  name: string;
  role: string;
  amount: number;
  count: number;
}

export interface RankingEntry {
  profileId: string;
  name: string;
  proposalsAccepted: number;
  totalRevenue: number;
}

export function useFinancialDashboard(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["financial-dashboard", startDate, endDate],
    queryFn: async () => {
      // Fetch transactions in period
      const { data: transactions } = await supabase
        .from("payment_transactions")
        .select("id, amount, currency, status, gateway, created_at, updated_at, metadata, financial_record_id, contract_id, client_id")
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      const txs = transactions || [];
      const confirmed = txs.filter((t) => t.status === "confirmed" || t.status === "paid");
      const pending = txs.filter((t) => t.status === "pending");

      const totalReceived = confirmed.reduce((s, t) => s + Number(t.amount), 0);
      const totalPending = pending.reduce((s, t) => s + Number(t.amount), 0);
      const ticketMedio = confirmed.length > 0 ? totalReceived / confirmed.length : 0;

      // Aging buckets for overdue pending
      const now = new Date();
      const agingBuckets: AgingBucket[] = [
        { label: "1-30 dias", count: 0, amount: 0 },
        { label: "31-60 dias", count: 0, amount: 0 },
        { label: "61-90 dias", count: 0, amount: 0 },
        { label: "90+ dias", count: 0, amount: 0 },
      ];

      pending.forEach((t) => {
        const meta = (t.metadata || {}) as Record<string, any>;
        const dueDate = meta.due_date ? new Date(meta.due_date) : new Date(t.created_at);
        if (dueDate > now) return; // not overdue
        const days = differenceInDays(now, dueDate);
        const amt = Number(t.amount);
        if (days <= 30) { agingBuckets[0].count++; agingBuckets[0].amount += amt; }
        else if (days <= 60) { agingBuckets[1].count++; agingBuckets[1].amount += amt; }
        else if (days <= 90) { agingBuckets[2].count++; agingBuckets[2].amount += amt; }
        else { agingBuckets[3].count++; agingBuckets[3].amount += amt; }
      });

      const totalOverdue = agingBuckets.reduce((s, b) => s + b.amount, 0);

      // Revenue by legal area via contracts → cases
      const contractIds = [...new Set(confirmed.filter((t) => t.contract_id).map((t) => t.contract_id!))];
      const revenueByArea: RevenueByArea[] = [];

      if (contractIds.length > 0) {
        const { data: contracts } = await supabase
          .from("contracts")
          .select("id, case_id")
          .in("id", contractIds.slice(0, 100));

        const caseIds = [...new Set((contracts || []).filter((c) => c.case_id).map((c) => c.case_id!))];
        if (caseIds.length > 0) {
          const { data: cases } = await supabase
            .from("cases")
            .select("id, legal_area")
            .in("id", caseIds.slice(0, 100));

          const caseMap = new Map((cases || []).map((c) => [c.id, c.legal_area]));
          const contractCaseMap = new Map((contracts || []).map((c) => [c.id, c.case_id]));

          const areaAmounts: Record<string, number> = {};
          confirmed.forEach((t) => {
            if (!t.contract_id) return;
            const caseId = contractCaseMap.get(t.contract_id);
            const area = caseId ? caseMap.get(caseId) || "outro" : "outro";
            areaAmounts[area] = (areaAmounts[area] || 0) + Number(t.amount);
          });
          Object.entries(areaAmounts).forEach(([area, amount]) => {
            revenueByArea.push({ area, amount });
          });
        }
      }

      // Ranking: proposals accepted by user
      const { data: proposals } = await supabase
        .from("proposals")
        .select("id, value, case_id, status, accepted_at")
        .eq("status", "aceita" as any)
        .gte("accepted_at", startDate)
        .lte("accepted_at", endDate);

      const { data: profiles } = await supabase.from("profiles").select("id, full_name, user_id");

      // Get case → lead → assigned_commercial mapping
      const proposalCaseIds = [...new Set((proposals || []).filter((p) => p.case_id).map((p) => p.case_id!))];
      const ranking: RankingEntry[] = [];

      if (proposalCaseIds.length > 0) {
        const { data: pCases } = await supabase
          .from("cases")
          .select("id, lead_id, assigned_attorney_id")
          .in("id", proposalCaseIds.slice(0, 100));

        const leadIds = [...new Set((pCases || []).filter((c) => c.lead_id).map((c) => c.lead_id!))];
        const { data: leads } = await supabase
          .from("leads")
          .select("id, assigned_commercial_id")
          .in("id", leadIds.slice(0, 100));

        const leadMap = new Map((leads || []).map((l) => [l.id, l.assigned_commercial_id]));
        const caseLeadMap = new Map((pCases || []).map((c) => [c.id, { leadId: c.lead_id, attorneyId: c.assigned_attorney_id }]));
        const profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name || "Sem nome"]));

        const rankMap: Record<string, { proposalsAccepted: number; totalRevenue: number; name: string }> = {};

        (proposals || []).forEach((p) => {
          const caseInfo = p.case_id ? caseLeadMap.get(p.case_id) : null;
          const commercialId = caseInfo?.leadId ? leadMap.get(caseInfo.leadId) : null;
          const personId = commercialId || caseInfo?.attorneyId;
          if (!personId) return;
          if (!rankMap[personId]) {
            rankMap[personId] = { proposalsAccepted: 0, totalRevenue: 0, name: profileMap.get(personId) || "Sem nome" };
          }
          rankMap[personId].proposalsAccepted++;
          rankMap[personId].totalRevenue += Number(p.value);
        });

        Object.entries(rankMap)
          .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
          .forEach(([profileId, data]) => {
            ranking.push({ profileId, ...data });
          });
      }

      return {
        totalReceived,
        totalPending,
        totalOverdue,
        ticketMedio,
        totalTransactions: txs.length,
        confirmedCount: confirmed.length,
        pendingCount: pending.length,
        agingBuckets,
        revenueByArea,
        ranking,
        transactions: txs,
        currency: confirmed[0]?.currency || pending[0]?.currency || "EUR",
      };
    },
  });
}
