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
  penalty_pct: 10,
  interest_monthly_pct: 1,
  max_interest_days: 365,
  grace_days: 0,
};

function calculateLateFees(amount: number, daysLate: number, config: LateFeeConfig) {
  const effectiveDays = Math.max(0, daysLate - config.grace_days);
  const cappedDays = Math.min(effectiveDays, config.max_interest_days);
  if (cappedDays <= 0) return { charges: 0, total: amount };
  const penalty = Math.round(amount * (config.penalty_pct / 100) * 100) / 100;
  const interest = Math.round(amount * (config.interest_monthly_pct / 100) * (cappedDays / 30) * 100) / 100;
  const charges = penalty + interest;
  return { charges, total: Math.round((amount + charges) * 100) / 100 };
}

function getStripePaymentMethods(currency: string, requestedMethod?: string | null): string[] {
  const cur = (currency || "").toUpperCase();
  const validStripeMethods = ["card", "multibanco", "mb_way", "sepa_debit", "pix", "boleto", "link"];
  if (requestedMethod && requestedMethod !== "card" && requestedMethod !== "direto") {
    if (validStripeMethods.includes(requestedMethod)) return [requestedMethod];
  }
  if (cur === "BRL") return ["card", "boleto", "pix"];
  if (cur === "EUR") return ["card", "multibanco", "mb_way", "sepa_debit"];
  return ["card"];
}

async function getCredential(supabase: any, provider: string, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", provider)
    .eq("credential_key", key)
    .maybeSingle();
  return data?.credential_value?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token, financial_record_id, payment_method } = body || {};

    if (!token || !financial_record_id) {
      return new Response(JSON.stringify({ error: "token and financial_record_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Validate token
    const { data: link } = await supabase
      .from("receipt_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!link) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch installment and validate ownership
    const { data: record } = await supabase
      .from("financial_records")
      .select("*")
      .eq("id", financial_record_id)
      .maybeSingle();

    if (!record) {
      return new Response(JSON.stringify({ error: "Installment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Security: record must belong to the same contract or deal as the receipt link
    const matchesContract = link.contract_id && record.contract_id === link.contract_id;
    const matchesDeal = link.bitrix24_deal_id && record.bitrix24_deal_id === link.bitrix24_deal_id;
    if (!matchesContract && !matchesDeal) {
      return new Response(JSON.stringify({ error: "Installment does not belong to this receipt" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (record.status === "paga") {
      return new Response(JSON.stringify({ error: "Esta parcela já foi paga" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Calculate amount with late fees
    const baseAmount = Number(record.installment_value || 0);
    const currency = record.currency || "EUR";
    let finalAmount = baseAmount;
    let lateChargesInfo = "";

    if (record.due_date) {
      const now = new Date();
      const due = new Date(record.due_date);
      if (due < now) {
        // Load late-fee config
        let lateCfg = DEFAULT_LATE_FEE_CONFIG;
        const { data: lfRow } = await supabase
          .from("payment_gateway_config")
          .select("config")
          .eq("gateway", "late_fees")
          .eq("is_active", true)
          .maybeSingle();
        if (lfRow?.config) {
          const c = lfRow.config as any;
          lateCfg = {
            penalty_pct: c.penalty_pct ?? 10,
            interest_monthly_pct: c.interest_monthly_pct ?? 1,
            max_interest_days: c.max_interest_days ?? 365,
            grace_days: c.grace_days ?? 0,
          };
        }
        const daysLate = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const fees = calculateLateFees(baseAmount, daysLate, lateCfg);
        finalAmount = fees.total;
        if (fees.charges > 0) lateChargesInfo = ` (inclui juros/multa: ${fees.charges.toFixed(2)})`;
      }
    }

    // 4. Get Stripe key (region: EUR -> stripe_pt, BRL -> stripe_br/asaas; for Stripe assume PT default)
    const region = currency === "BRL" ? "br" : "pt";
    const credKey = region === "br" ? "stripe_secret_br" : "stripe_secret_pt";
    let stripeKey = await getCredential(supabase, "stripe", credKey);
    if (!stripeKey) stripeKey = await getCredential(supabase, "stripe", "stripe_secret");
    if (!stripeKey) stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || null;

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Build Stripe checkout
    const description = `Parcela ${record.installment_number || 1}/${record.total_installments || 1} — ${link.deal_title || record.description || "Pagamento"}${lateChargesInfo}`;
    const baseUrl = Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";
    const successUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-receipt?token=${token}&payment=success`;
    const cancelUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-receipt?token=${token}&payment=cancelled`;
    const methods = getStripePaymentMethods(currency, payment_method);

    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("line_items[0][price_data][currency]", currency.toLowerCase());
    params.append("line_items[0][price_data][unit_amount]", Math.round(finalAmount * 100).toString());
    params.append("line_items[0][price_data][product_data][name]", description);
    params.append("line_items[0][quantity]", "1");
    methods.forEach((m, i) => params.append(`payment_method_types[${i}]`, m));
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);
    params.append("metadata[financial_record_id]", financial_record_id);
    params.append("metadata[receipt_token]", token);
    if (link.bitrix24_deal_id) params.append("metadata[bitrix24_deal_id]", String(link.bitrix24_deal_id));
    if (record.contract_id) params.append("metadata[contract_id]", record.contract_id);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const stripeData = await stripeRes.json();

    if (stripeData.error) {
      const msg = stripeData.error.message || "Stripe error";
      if (msg.includes("payment method type provided")) {
        return new Response(JSON.stringify({
          error: `Método "${payment_method}" não está activado. Active-o no painel Stripe.`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Create payment_transactions row + save link
    const gatewayPaymentId = stripeData.payment_intent || stripeData.id;
    const paymentUrl = stripeData.url;

    try {
      await supabase.from("payment_transactions").insert({
        financial_record_id,
        contract_id: record.contract_id || null,
        amount: finalAmount,
        currency,
        gateway: "stripe",
        gateway_payment_id: gatewayPaymentId,
        payment_method: payment_method || methods[0] || "card",
        status: "pending",
        metadata: {
          source: "payment_create_link",
          receipt_token: token,
          checkout_session_id: stripeData.id,
          payment_url: paymentUrl,
          base_amount: baseAmount,
          late_charges: finalAmount - baseAmount,
        },
      });
    } catch (txErr) {
      console.error("[PAYMENT-CREATE-LINK] tx insert error:", txErr);
    }

    // Track on the financial record itself
    try {
      await supabase.from("financial_records")
        .update({ stripe_payment_id: gatewayPaymentId })
        .eq("id", financial_record_id);
    } catch (e) {
      console.error("[PAYMENT-CREATE-LINK] financial_records update error:", e);
    }

    return new Response(JSON.stringify({
      payment_url: paymentUrl,
      gateway_payment_id: gatewayPaymentId,
      amount: finalAmount,
      base_amount: baseAmount,
      late_charges: finalAmount - baseAmount,
      currency,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[PAYMENT-CREATE-LINK] fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
