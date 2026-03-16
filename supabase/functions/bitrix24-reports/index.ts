import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const memberId = await resolveMemberId(req);
    if (!memberId) {
      return json({ error: "member_id is required" }, 400);
    }

    const { data: integration, error: integrationError } = await supabase
      .from("bitrix24_integrations")
      .select("id")
      .eq("member_id", memberId)
      .single();

    if (integrationError || !integration) {
      return json({ error: "Integration not found" }, 404);
    }

    const financialRecords = await fetchAllFinancialRecords(supabase);
    const financialRecordIds = unique(financialRecords.map((record: any) => record.id));
    const contractIdsMissingProposal = unique(
      financialRecords
        .filter((record: any) => !record.proposal_id && record.contract_id)
        .map((record: any) => record.contract_id),
    );

    const contracts = await selectInChunks(
      supabase,
      "contracts",
      "id, proposal_id",
      "id",
      contractIdsMissingProposal,
    );
    const contractProposalMap = new Map(contracts.map((contract: any) => [contract.id, contract.proposal_id]));

    const proposalIds = unique(
      financialRecords.map((record: any) => record.proposal_id || contractProposalMap.get(record.contract_id)),
    );
    const proposals = await selectInChunks(
      supabase,
      "proposals",
      "id, client_name, title, created_by, case_id",
      "id",
      proposalIds,
    );
    const proposalMap = new Map(proposals.map((proposal: any) => [proposal.id, proposal]));

    const paymentTransactions = await selectInChunks(
      supabase,
      "payment_transactions",
      "id, financial_record_id, gateway, payment_method, company_id, client_id, created_at, metadata",
      "financial_record_id",
      financialRecordIds,
      { column: "created_at", ascending: false },
    );

    const latestPaymentByFinancialRecord = new Map<string, any>();
    for (const transaction of paymentTransactions) {
      if (transaction.financial_record_id && !latestPaymentByFinancialRecord.has(transaction.financial_record_id)) {
        latestPaymentByFinancialRecord.set(transaction.financial_record_id, transaction);
      }
    }

    const companyIds = unique(paymentTransactions.map((transaction: any) => transaction.company_id));
    const companies = await selectInChunks(supabase, "companies", "id, name", "id", companyIds);
    const companyMap = new Map(companies.map((company: any) => [company.id, company.name]));

    // Fetch client names from clients table via payment_transactions.client_id
    const ptClientIds = unique(paymentTransactions.map((t: any) => t.client_id));
    // Also resolve clients via proposals -> cases -> leads -> client_id (without using leads name)
    const caseIds = unique(proposals.map((p: any) => p.case_id));
    const casesData = await selectInChunks(supabase, "cases", "id, lead_id", "id", caseIds);
    const leadIds = unique(casesData.map((c: any) => c.lead_id));
    const leadsData = await selectInChunks(supabase, "leads", "id, client_id", "id", leadIds);
    const leadClientIds = unique(leadsData.map((l: any) => l.client_id));
    const allClientIds = unique([...ptClientIds, ...leadClientIds]);
    const allClients = await selectInChunks(supabase, "clients", "id, name", "id", allClientIds);
    const clientMap = new Map(allClients.map((c: any) => [c.id, c.name]));

    // Build proposal -> client resolution chain (cases -> leads -> client_id only)
    const caseLeadMap = new Map(casesData.map((c: any) => [c.id, c.lead_id]));
    const leadClientIdMap = new Map(leadsData.map((l: any) => [l.id, l.client_id]));

    function resolveClientName(proposal: any, payment: any) {
      // 1. From payment_transactions.client_id -> clients.name
      if (payment?.client_id && clientMap.has(payment.client_id)) {
        return clientMap.get(payment.client_id);
      }
      // 2. From proposal -> case -> lead -> client_id -> clients.name
      if (proposal?.case_id) {
        const leadId = caseLeadMap.get(proposal.case_id);
        if (leadId) {
          const clientId = leadClientIdMap.get(leadId);
          if (clientId && clientMap.has(clientId)) {
            return clientMap.get(clientId);
          }
        }
      }
      // 3. Fallback to proposal.client_name
      if (proposal?.client_name) return proposal.client_name;
      return "Sem cliente";
    }

    const profileIds = unique(proposals.map((proposal: any) => proposal.created_by));
    const profiles = await selectInChunks(supabase, "profiles", "id, full_name", "id", profileIds);
    const profileMap = new Map(profiles.map((profile: any) => [profile.id, profile.full_name]));

    const transactions = financialRecords.map((record: any) => {
      const proposalId = record.proposal_id || contractProposalMap.get(record.contract_id);
      const proposal = proposalId ? proposalMap.get(proposalId) : null;
      const payment = latestPaymentByFinancialRecord.get(record.id);
      const amount = Number(record.installment_value ?? record.total_value ?? 0);
      const metadata = payment?.metadata && typeof payment.metadata === "object" ? payment.metadata : {};

      return {
        id: record.id,
        amount,
        installment_value: Number(record.installment_value ?? 0),
        total_value: Number(record.total_value ?? 0),
        status: record.status,
        payment_method: payment?.payment_method || record.payment_method || "—",
        gateway: payment?.gateway || metadata.gateway || "—",
        due_date: record.due_date,
        paid_at: record.paid_at,
        created_at: record.created_at,
        description: record.description || proposal?.title || "Sem descrição",
        client_name: resolveClientName(proposal, payment),
        company_name: payment?.company_id ? companyMap.get(payment.company_id) || "—" : "—",
        responsible_name: proposal?.created_by ? profileMap.get(proposal.created_by) || "Sem responsável" : "Sem responsável",
      };
    });

    return json({ success: true, transactions, meta: { count: transactions.length } });
  } catch (error) {
    console.error("[bitrix24-reports] Error:", error);
    return json({ error: String(error) }, 500);
  }
});

async function resolveMemberId(req: Request) {
  if (req.method !== "GET") {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.member_id === "string" && body.member_id.trim()) {
      return body.member_id.trim();
    }
  }

  const url = new URL(req.url);
  return url.searchParams.get("member_id")?.trim() || null;
}

async function fetchAllFinancialRecords(supabase: any) {
  const PAGE_SIZE = 999;
  let offset = 0;
  const rows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("financial_records")
      .select("id, installment_value, total_value, status, payment_method, due_date, paid_at, created_at, contract_id, proposal_id, description")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length <= PAGE_SIZE) break;
    offset += PAGE_SIZE + 1;
  }

  return rows;
}

async function selectInChunks(
  supabase: any,
  table: string,
  columns: string,
  field: string,
  ids: any[],
  order?: { column: string; ascending: boolean },
) {
  const values = unique(ids);
  if (values.length === 0) return [];

  const CHUNK_SIZE = 200;
  const rows: any[] = [];

  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    const chunk = values.slice(index, index + CHUNK_SIZE);
    let query = supabase.from(table).select(columns).in(field, chunk);
    if (order) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    const { data, error } = await query;
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }

  return rows;
}

function unique(values: any[]) {
  return [...new Set(values.filter(Boolean))];
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
