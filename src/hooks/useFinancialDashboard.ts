import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format } from "date-fns";

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
      const startDateOnly = startDate.split("T")[0];
      const endDateOnly = endDate.split("T")[0];

      // Paid records: filter by paid_at
      const { data: paidRecords } = await supabase
        .from("financial_records")
        .select("id, installment_value, status, paid_at, due_date, contract_id, payment_method, created_at, proposal_id")
        .eq("status", "paga")
        .gte("paid_at", startDate)
        .lte("paid_at", endDate);

      // Pending records: filter by due_date
      const { data: pendingRecords } = await supabase
        .from("financial_records")
        .select("id, installment_value, status, paid_at, due_date, contract_id, payment_method, created_at, proposal_id")
        .eq("status", "pendente")
        .gte("due_date", startDateOnly)
        .lte("due_date", endDateOnly);

      // Overdue records: due_date up to endDate
      const { data: overdueRecords } = await supabase
        .from("financial_records")
        .select("id, installment_value, status, paid_at, due_date, contract_id, payment_method, created_at, proposal_id")
        .eq("status", "atrasada")
        .lte("due_date", endDateOnly);

      const confirmed = paidRecords || [];
      const pending = pendingRecords || [];
      const overdue = overdueRecords || [];
      const allTxs = [...confirmed, ...pending, ...overdue];

      const totalReceived = confirmed.reduce((s, t) => s + Number(t.installment_value || 0), 0);
      const totalPending = pending.reduce((s, t) => s + Number(t.installment_value || 0), 0);
      const ticketMedio = confirmed.length > 0 ? totalReceived / confirmed.length : 0;

      // Aging buckets for overdue
      const now = new Date();
      const agingBuckets: AgingBucket[] = [
        { label: "1-30 dias", count: 0, amount: 0 },
        { label: "31-60 dias", count: 0, amount: 0 },
        { label: "61-90 dias", count: 0, amount: 0 },
        { label: "90+ dias", count: 0, amount: 0 },
      ];

      overdue.forEach((t) => {
        const dueDate = t.due_date ? new Date(t.due_date) : new Date(t.created_at);
        const days = differenceInDays(now, dueDate);
        const amt = Number(t.installment_value || 0);
        if (days <= 30) { agingBuckets[0].count++; agingBuckets[0].amount += amt; }
        else if (days <= 60) { agingBuckets[1].count++; agingBuckets[1].amount += amt; }
        else if (days <= 90) { agingBuckets[2].count++; agingBuckets[2].amount += amt; }
        else { agingBuckets[3].count++; agingBuckets[3].amount += amt; }
      });

      const totalOverdue = agingBuckets.reduce((s, b) => s + b.amount, 0);

      // Revenue by legal area via proposals (unified) → cases
      const proposalIds = [...new Set(confirmed.filter((t) => t.proposal_id || t.contract_id).map((t) => (t as any).proposal_id || t.contract_id!))];
      const revenueByArea: RevenueByArea[] = [];

      if (proposalIds.length > 0) {
        // Try proposals first
        const { data: proposals } = await supabase
          .from("proposals")
          .select("id, case_id")
          .in("id", proposalIds.slice(0, 100));

        // Fallback: also check contracts for legacy records
        const { data: legacyContracts } = await supabase
          .from("contracts")
          .select("id, case_id")
          .in("id", proposalIds.slice(0, 100));

        const idToCaseMap = new Map<string, string>();
        (proposals || []).forEach((p) => { if (p.case_id) idToCaseMap.set(p.id, p.case_id); });
        (legacyContracts || []).forEach((c) => { if (c.case_id && !idToCaseMap.has(c.id)) idToCaseMap.set(c.id, c.case_id); });

        const caseIds = [...new Set(Array.from(idToCaseMap.values()))];
        if (caseIds.length > 0) {
          const { data: cases } = await supabase
            .from("cases")
            .select("id, legal_area")
            .in("id", caseIds.slice(0, 100));

          const caseMap = new Map((cases || []).map((c) => [c.id, c.legal_area]));

          const areaAmounts: Record<string, number> = {};
          confirmed.forEach((t) => {
            const lookupId = (t as any).proposal_id || t.contract_id;
            if (!lookupId) return;
            const caseId = idToCaseMap.get(lookupId);
            const area = caseId ? caseMap.get(caseId) || "outro" : "outro";
            areaAmounts[area] = (areaAmounts[area] || 0) + Number(t.installment_value || 0);
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
        totalTransactions: allTxs.length,
        confirmedCount: confirmed.length,
        pendingCount: pending.length,
        agingBuckets,
        revenueByArea,
        ranking,
        transactions: allTxs,
        currency: "EUR",
      };
    },
  });
}
