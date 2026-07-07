import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  readEmmelyPaymentPlan,
  expandPlanToInstallments,
  type EmmelyPaymentPlan,
  type InstallmentRow,
} from "../_shared/deal-payment-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LateFeeConfig {
  penalty_pct: number;
  interest_monthly_pct: number;
  max_interest_days: number;
  grace_days: number;
}

const DEFAULT_LATE_FEE_CONFIG: LateFeeConfig = {
  penalty_pct: 10, interest_monthly_pct: 1, max_interest_days: 365, grace_days: 0,
};

function publicReportUrl(token: string): string {
  const base = (Deno.env.get("PUBLIC_RECEIPT_URL") || "https://emmelycloud.pages.dev").replace(/\/+$/, "");
  return `${base}/pagamento/${token}`;
}

// Minimal Bitrix caller for the receipt (read-only, no token refresh needed).
function makeBxCall(endpoint: string, token: string) {
  const ep = endpoint.endsWith("/") ? endpoint : endpoint + "/";
  return async (method: string, params: Record<string, any> = {}) => {
    const res = await fetch(`${ep}${method}?auth=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    try { return await res.json(); } catch { return { result: null }; }
  };
}

async function loadIntegration(supabase: any) {
  const { data } = await supabase
    .from("bitrix24_integrations")
    .select("client_endpoint, access_token")
    .limit(1).maybeSingle();
  return data;
}

function rowsFromFinancialRecords(records: any[]): InstallmentRow[] {
  return records.map((r: any) => ({
    id: String(r.id),
    installment_number: Number(r.installment_number) || 1,
    total_installments: Number(r.total_installments) || 1,
    installment_value: Number(r.installment_value) || 0,
    total_value: Number(r.total_value) || 0,
    currency: r.currency || "EUR",
    due_date: r.due_date || null,
    paid_at: r.paid_at || null,
    status: (r.status || "pendente") as any,
    is_down_payment: String(r.description || "").toLowerCase().startsWith("entrada"),
    payment_method: r.payment_method || null,
    description: r.description || "",
    is_synthetic: false as any,
    bitrix24_deal_id: r.bitrix24_deal_id || null,
    contract_id: r.contract_id || null,
  }));
}

function transactionKey(tx: any): string {
  const meta = tx?.metadata || {};
  const isDown = meta.is_down_payment === true || meta.is_down_payment === "true";
  const n = Number(meta.installment_number || 1) || 1;
  return `${isDown ? "d" : "r"}:${n}`;
}

function mergeRowsWithTransactions(rows: InstallmentRow[], txs: any[]): InstallmentRow[] {
  const active = (txs || [])
    .filter((tx: any) => !["cancelled", "canceled"].includes(String(tx.status || "").toLowerCase()))
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const byKey = new Map<string, any>();
  for (const tx of active) {
    const key = transactionKey(tx);
    if (!byKey.has(key)) byKey.set(key, tx);
  }
  return rows.map((row) => {
    const key = `${row.is_down_payment ? "d" : "r"}:${row.installment_number || 1}`;
    const tx = byKey.get(key);
    if (!tx) return row;
    const meta = tx.metadata || {};
    let status = row.status;
    if (["paid", "confirmed", "succeeded"].includes(String(tx.status || "").toLowerCase())) status = "paga" as any;
    else if (["overdue", "failed"].includes(String(tx.status || "").toLowerCase())) status = "atrasada" as any;
    return {
      ...row,
      due_date: meta.due_date || row.due_date,
      paid_at: status === "paga" ? (tx.updated_at || row.paid_at) : row.paid_at,
      status,
      payment_method: tx.payment_method || meta.requested_payment_method || row.payment_method,
      description: row.is_down_payment ? "Entrada" : row.description,
    };
  });
}

/**
 * Load installments for a receipt link, matching the placement (Emmely Pay tab)
 * logic: prefer the deal payment plan when it is explicitly split (Entrada +
 * Saldo) and there are no paid/generated real rows yet; otherwise fall back to
 * financial_records; last resort a single-row deal amount.
 */
async function loadInstallments(supabase: any, link: any) {
  // Contract-only flow — return real records untouched
  if (link.contract_id) {
    const { data } = await supabase.from("financial_records")
      .select("*").eq("contract_id", link.contract_id)
      .order("installment_number", { ascending: true });
    const records = data || [];
    const installments = rowsFromFinancialRecords(records);
    const total_value = records[0]?.total_value
      || installments.reduce((s, r) => s + r.installment_value, 0);
    const currency = installments[0]?.currency || "EUR";
    return { installments, currency, total_value, deal_title: link.deal_title };
  }

  // Deal-based flow — mirror placement precedence
  const dealId = link.bitrix24_deal_id ? String(link.bitrix24_deal_id) : null;
  if (!dealId) {
    return { installments: [], currency: "EUR", total_value: 0, deal_title: link.deal_title };
  }

  const { data: recData } = await supabase.from("financial_records")
    .select("*").eq("bitrix24_deal_id", dealId)
    .order("installment_number", { ascending: true });
  const records: any[] = recData || [];

  const { data: txData } = await supabase.from("payment_transactions")
    .select("id, status, amount, currency, payment_method, payment_url, financial_record_id, created_at, updated_at, metadata")
    .or(`metadata->>bitrix_deal_id.eq.${dealId},metadata->>bitrix24_deal_id.eq.${dealId}`)
    .order("created_at", { ascending: false });
  const dealTransactions: any[] = txData || [];

  // Try to read the deal payment plan from Bitrix24
  let plan: EmmelyPaymentPlan | null = null;
  let dealTitle: string | null = null;
  let dealAmount = 0;
  let dealCurrency = "EUR";
  try {
    const integration = await loadIntegration(supabase);
    if (integration?.client_endpoint && integration?.access_token) {
      const bxCall = makeBxCall(integration.client_endpoint, integration.access_token);
      plan = await readEmmelyPaymentPlan(bxCall, "deal", dealId, undefined, supabase);
      dealTitle = String(plan.raw?.TITLE || plan.raw?.title || "") || null;
      dealAmount = plan.totalAmount || 0;
      dealCurrency = plan.currency || "EUR";
    }
  } catch (e) {
    console.error("[payment-receipt] plan lookup error:", e);
  }

  const paidCount = plan ? parseInt(String(plan.raw?.UF_CRM_EMMELY_PAID_INSTALLMENTS || "0"), 10) || 0 : 0;

  // Synthetic rows from the plan (Entrada + parcelas), exactly like the placement.
  const plannedRows = plan && plan.totalAmount > 0
    ? expandPlanToInstallments(plan, { paidCount, dealId })
    : [];

  const realInstallments = rowsFromFinancialRecords(records);
  const hasPaidReal = realInstallments.some((i) => i.status === "paga");
  const planExplicitlySplit = !!plan && (plan.downPayment > 0 || plan.remainingInstallments > 1 || !!plan.firstDue || !!plan.downMethod);
  const planSum = Math.round(plannedRows.reduce((s, r) => s + r.installment_value, 0) * 100) / 100;
  const realSum = Math.round(realInstallments.reduce((s, r) => s + r.installment_value, 0) * 100) / 100;
  const planDiffers = plannedRows.length !== realInstallments.length || Math.abs(planSum - realSum) > 0.01;

  let installments: InstallmentRow[];
  let total_value: number;
  let currency: string;

  if (plannedRows.length > 0 && planExplicitlySplit && !hasPaidReal && (realInstallments.length === 0 || planDiffers)) {
    installments = mergeRowsWithTransactions(plannedRows, dealTransactions);
    total_value = plan!.totalAmount;
    currency = plan!.currency || "EUR";
  } else if (realInstallments.length > 0) {
    installments = mergeRowsWithTransactions(realInstallments, dealTransactions);
    total_value = records[0]?.total_value || realSum;
    currency = realInstallments[0]?.currency || dealCurrency;
  } else if (dealAmount > 0) {
    installments = [{
      id: `deal-${dealId}`,
      installment_number: 1, total_installments: 1,
      installment_value: dealAmount, total_value: dealAmount,
      currency: dealCurrency, due_date: plan?.firstDue || null, paid_at: null,
      status: "pendente", is_down_payment: false, payment_method: null,
      description: dealTitle || "", is_synthetic: true as any,
      bitrix24_deal_id: dealId, contract_id: null,
    }];
    total_value = dealAmount;
    currency = dealCurrency;
  } else {
    installments = [];
    total_value = 0;
    currency = dealCurrency;
  }

  return { installments, currency, total_value, deal_title: link.deal_title || dealTitle };
}

async function loadLateFeeConfig(supabase: any): Promise<LateFeeConfig> {
  const { data } = await supabase.from("payment_gateway_config").select("config, is_active").eq("gateway", "late_fees").eq("is_active", true).maybeSingle();
  if (!data?.config) return DEFAULT_LATE_FEE_CONFIG;
  const c = data.config as any;
  return {
    penalty_pct: c.penalty_pct ?? 10,
    interest_monthly_pct: c.interest_monthly_pct ?? 1,
    max_interest_days: c.max_interest_days ?? 365,
    grace_days: c.grace_days ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const paymentStatus = url.searchParams.get("payment");
  const format = url.searchParams.get("format"); // "json" para o frontend
  const wantsJson = format === "json" || (req.headers.get("accept") || "").includes("application/json");

  if (!token) {
    if (wantsJson) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response("<h1>Token inválido</h1>", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: link } = await supabase.from("receipt_links").select("*").eq("token", token).maybeSingle();
  if (!link) {
    if (wantsJson) return new Response(JSON.stringify({ error: "Comprovante não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response("<h1>Comprovante não encontrado</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const lateFeeConfig = await loadLateFeeConfig(supabase);
  const { installments, currency, total_value, deal_title } = await loadInstallments(supabase, link);

  if (wantsJson) {
    return new Response(JSON.stringify({
      client_name: link.client_name || null,
      deal_title: deal_title || null,
      currency,
      total_value,
      installments,
      late_fee_config: lateFeeConfig,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const redirectUrl = `${publicReportUrl(token)}${paymentStatus ? `?payment=${paymentStatus}` : ""}`;
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirectUrl } });
});
