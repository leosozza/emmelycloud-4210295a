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
  const base = (Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev").replace(/\/+$/, "");
  return `${base}/pagamento/${token}`;
}

async function fetchBitrixDealAmount(supabase: any, dealId: string): Promise<{ amount: number; currency: string; title: string | null } | null> {
  try {
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("client_endpoint, access_token")
      .limit(1).maybeSingle();
    if (!integration?.client_endpoint || !integration?.access_token) return null;
    const url = `${integration.client_endpoint}crm.deal.get?auth=${integration.access_token}&id=${parseInt(dealId)}`;
    const res = await fetch(url);
    const j = await res.json();
    const r = j?.result;
    if (!r) return null;
    const amount = parseFloat(r.OPPORTUNITY || "0");
    return { amount: isFinite(amount) ? amount : 0, currency: r.CURRENCY_ID || "EUR", title: r.TITLE || null };
  } catch (e) {
    console.error("[payment-receipt] bitrix lookup error:", e);
    return null;
  }
}

async function loadInstallments(supabase: any, link: any) {
  // 1) financial_records by contract_id or deal_id
  let query = supabase.from("financial_records").select("*").order("installment_number", { ascending: true });
  if (link.contract_id) query = query.eq("contract_id", link.contract_id);
  else if (link.bitrix24_deal_id) query = query.eq("bitrix24_deal_id", link.bitrix24_deal_id);
  else return { installments: [], currency: "EUR", total_value: 0, deal_title: link.deal_title };

  const { data: records } = await query;
  if (records && records.length > 0) {
    const currency = records[0]?.currency || "EUR";
    const total_value = records[0]?.total_value || records.reduce((s: number, r: any) => s + (Number(r.installment_value) || 0), 0);
    return { installments: records, currency, total_value, deal_title: link.deal_title };
  }

  // 2) Synthetic fallback from Bitrix24 deal
  if (link.bitrix24_deal_id) {
    const deal = await fetchBitrixDealAmount(supabase, String(link.bitrix24_deal_id));
    if (deal && deal.amount > 0) {
      const synthetic = [{
        id: `synthetic-${link.bitrix24_deal_id}`,
        installment_number: 1,
        total_installments: 1,
        installment_value: deal.amount,
        total_value: deal.amount,
        due_date: null,
        paid_at: null,
        status: "pendente",
        currency: deal.currency,
        bitrix24_deal_id: link.bitrix24_deal_id,
        contract_id: null,
        is_synthetic: true,
      }];
      return { installments: synthetic, currency: deal.currency, total_value: deal.amount, deal_title: link.deal_title || deal.title };
    }
  }
  return { installments: [], currency: "EUR", total_value: 0, deal_title: link.deal_title };
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
