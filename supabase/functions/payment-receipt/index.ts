import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function calculateLateFees(amount: number, daysLate: number, config: LateFeeConfig) {
  const effectiveDays = Math.max(0, daysLate - config.grace_days);
  const cappedDays = Math.min(effectiveDays, config.max_interest_days);
  if (cappedDays <= 0) return { daysLate: 0, penalty: 0, interest: 0, charges: 0, total: amount };
  const penalty = Math.round(amount * (config.penalty_pct / 100) * 100) / 100;
  const interest = Math.round(amount * (config.interest_monthly_pct / 100) * (cappedDays / 30) * 100) / 100;
  const charges = penalty + interest;
  return { daysLate: cappedDays, penalty, interest, charges, total: Math.round((amount + charges) * 100) / 100 };
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(value);
}
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return dateStr; }
}

function publicReportUrl(token: string): string {
  // Always serve the public receipt from the Lovable-hosted build so the latest
  // frontend (Stripe-style redesign) is picked up immediately after publish.
  // FRONTEND_URL continues to be used elsewhere for internal links.
  const base = (Deno.env.get("PUBLIC_RECEIPT_URL") || "https://emmelycloud.lovable.app").replace(/\/+$/, "");
  return `${base}/pagamento/${token}`;
}

interface BitrixDealInfo {
  amount: number;
  currency: string;
  title: string | null;
  totalInstallments: number | null;
  installmentValue: number | null;
  nextDueDate: string | null;
  paidInstallments: number | null;
  paymentMethod: string | null;
  gateway: string | null;
}

async function resolveEnumValue(endpoint: string, token: string, fieldName: string, enumId: any): Promise<string | null> {
  if (!enumId) return null;
  try {
    const res = await fetch(`${endpoint}crm.deal.userfield.list?auth=${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filter: { FIELD_NAME: fieldName } }) });
    const j = await res.json();
    const field = (j?.result || [])[0];
    const item = (field?.LIST || []).find((i: any) => String(i.ID) === String(enumId));
    return item?.VALUE || null;
  } catch { return null; }
}

async function fetchBitrixDealAmount(supabase: any, dealId: string): Promise<BitrixDealInfo | null> {
  try {
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("client_endpoint, access_token")
      .limit(1).maybeSingle();
    if (!integration?.client_endpoint || !integration?.access_token) return null;
    const endpoint = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
    const url = `${endpoint}crm.deal.get?auth=${integration.access_token}&id=${parseInt(dealId)}`;
    const res = await fetch(url);
    const j = await res.json();
    const r = j?.result;
    if (!r) return null;
    const amount = parseFloat(r.OPPORTUNITY || "0");

    // Parse UF fields. TOTAL_INSTALLMENTS is enumeration → resolve to numeric label.
    const totalInstEnum = r.UF_CRM_EMMELY_TOTAL_INSTALLMENTS;
    let totalInstallments: number | null = null;
    if (totalInstEnum) {
      const label = await resolveEnumValue(endpoint, integration.access_token, "UF_CRM_EMMELY_TOTAL_INSTALLMENTS", totalInstEnum);
      const n = parseInt(label || String(totalInstEnum), 10);
      if (isFinite(n) && n > 0) totalInstallments = n;
    }

    const installmentValueRaw = parseFloat(r.UF_CRM_EMMELY_INSTALLMENT_VALUE || "0");
    const installmentValue = isFinite(installmentValueRaw) && installmentValueRaw > 0 ? installmentValueRaw : null;

    const nextDueDate = r.UF_CRM_EMMELY_NEXT_DUE_DATE || null;

    const paidInstRaw = parseInt(r.UF_CRM_EMMELY_PAID_INSTALLMENTS || "0", 10);
    const paidInstallments = isFinite(paidInstRaw) && paidInstRaw > 0 ? paidInstRaw : null;

    const paymentMethod = r.UF_CRM_EMMELY_PAYMENT_METHOD
      ? await resolveEnumValue(endpoint, integration.access_token, "UF_CRM_EMMELY_PAYMENT_METHOD", r.UF_CRM_EMMELY_PAYMENT_METHOD)
      : null;
    const gateway = r.UF_CRM_EMMELY_GATEWAY
      ? await resolveEnumValue(endpoint, integration.access_token, "UF_CRM_EMMELY_GATEWAY", r.UF_CRM_EMMELY_GATEWAY)
      : null;

    return {
      amount: isFinite(amount) ? amount : 0,
      currency: r.CURRENCY_ID || "EUR",
      title: r.TITLE || null,
      totalInstallments,
      installmentValue,
      nextDueDate,
      paidInstallments,
      paymentMethod,
      gateway,
    };
  } catch (e) {
    console.error("[payment-receipt] bitrix lookup error:", e);
    return null;
  }
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // handle month overflow
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

async function loadInstallments(supabase: any, link: any) {
  // 1) Load real financial_records (by contract_id or deal_id) — may be empty, partial, or complete
  let records: any[] = [];
  if (link.contract_id) {
    const { data } = await supabase.from("financial_records")
      .select("*").eq("contract_id", link.contract_id)
      .order("installment_number", { ascending: true });
    records = data || [];
  } else if (link.bitrix24_deal_id) {
    const { data } = await supabase.from("financial_records")
      .select("*").eq("bitrix24_deal_id", link.bitrix24_deal_id)
      .order("installment_number", { ascending: true });
    records = data || [];
  }

  // 2) Fetch Bitrix24 deal info (used to determine expected total installments + build synthetic slots)
  let deal: BitrixDealInfo | null = null;
  if (link.bitrix24_deal_id) {
    deal = await fetchBitrixDealAmount(supabase, String(link.bitrix24_deal_id));
  }

  // Derive expected installment count:
  //   - prefer deal.totalInstallments
  //   - fallback to max installment_number across real records
  //   - fallback to records[0].total_installments
  //   - else 1
  const maxRealNumber = records.reduce(
    (m, r) => Math.max(m, Number(r.installment_number) || 0), 0,
  );
  const totalFromRecord = records[0]?.total_installments || 0;
  const totalCount = Math.max(
    deal?.totalInstallments || 0,
    maxRealNumber,
    Number(totalFromRecord) || 0,
    1,
  );

  const currency = records[0]?.currency || deal?.currency || "EUR";

  // 3) Contract-only flow (no deal, no synthetic expansion) — return whatever exists
  if (!link.bitrix24_deal_id) {
    const total_value = records[0]?.total_value
      || records.reduce((s: number, r: any) => s + (Number(r.installment_value) || 0), 0);
    return { installments: records, currency, total_value, deal_title: link.deal_title };
  }

  // 4) Deal-based flow — MERGE real records into full synthetic scaffold so we always show totalCount slots
  // Compute synthetic defaults from deal
  const perValue = deal?.installmentValue && deal.installmentValue > 0
    ? deal.installmentValue
    : (deal?.amount && totalCount ? Math.round((deal.amount / totalCount) * 100) / 100 : 0);
  const totalValue = records[0]?.total_value
    || (deal?.installmentValue && deal?.totalInstallments
      ? Math.round(deal.installmentValue * deal.totalInstallments * 100) / 100
      : (deal?.amount || perValue * totalCount));
  const paidCount = deal?.paidInstallments || 0;
  const baseDue = deal?.nextDueDate || null;

  const realByNumber = new Map<number, any>();
  for (const r of records) {
    const n = Number(r.installment_number);
    if (isFinite(n) && n > 0) realByNumber.set(n, r);
  }

  const merged = Array.from({ length: totalCount }, (_, i) => {
    const number = i + 1;
    const real = realByNumber.get(number);
    if (real) return { ...real, is_synthetic: false };

    // Synthetic slot
    let dueDate: string | null = null;
    if (baseDue) {
      const offset = number - (paidCount + 1);
      dueDate = addMonths(baseDue, offset);
    }
    const isPaid = number <= paidCount;
    return {
      id: `synthetic-${link.bitrix24_deal_id}-${number}`,
      installment_number: number,
      total_installments: totalCount,
      installment_value: perValue,
      total_value: totalValue,
      due_date: dueDate,
      paid_at: isPaid ? new Date().toISOString() : null,
      status: isPaid ? "paga" : "pendente",
      currency: deal?.currency || currency,
      bitrix24_deal_id: link.bitrix24_deal_id,
      contract_id: null,
      payment_method: deal?.paymentMethod,
      gateway: deal?.gateway,
      is_synthetic: true,
    };
  });

  return {
    installments: merged,
    currency,
    total_value: totalValue,
    deal_title: link.deal_title || deal?.title,
  };
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

  // ---- JSON mode (new public frontend) ----
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

  // ---- HTML mode: redirect to public frontend (preserves backwards compatibility) ----
  const redirectUrl = `${publicReportUrl(token)}${paymentStatus ? `?payment=${paymentStatus}` : ""}`;
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirectUrl } });
});
