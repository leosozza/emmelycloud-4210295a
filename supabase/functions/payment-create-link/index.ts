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
  // "customer_choice" = deixar o cliente escolher → devolve o leque completo da moeda.
  if (requestedMethod === "customer_choice") requestedMethod = null;
  if (requestedMethod && requestedMethod !== "direto") {
    if (validStripeMethods.includes(requestedMethod)) return [requestedMethod];
  }
  if (cur === "BRL") return ["card", "boleto", "pix"];
  if (cur === "EUR") return ["multibanco", "mb_way", "card", "sepa_debit"];
  return ["card"];
}

// In-memory cache of methods known to be inactive in the connected Stripe account (per currency).
// Resets whenever the function worker is recycled.
const INACTIVE_METHODS: Record<string, Set<string>> = {};
function markInactive(currency: string, method: string) {
  const k = currency.toUpperCase();
  if (!INACTIVE_METHODS[k]) INACTIVE_METHODS[k] = new Set();
  INACTIVE_METHODS[k].add(method);
}
function filterInactive(currency: string, methods: string[]): string[] {
  const k = currency.toUpperCase();
  const blocked = INACTIVE_METHODS[k];
  if (!blocked || blocked.size === 0) return methods;
  return methods.filter((m) => !blocked.has(m));
}
function extractOffendingMethod(msg: string): string | null {
  // Padrão 1: "The payment method type provided: sepa_debit is invalid"
  let m = msg.match(/type provided:\s*([a-z_]+)/i);
  if (m) return m[1];
  // Padrão 2: 'payment method type "card" is not activated'
  m = msg.match(/payment method type "([a-z_]+)"/i);
  if (m) return m[1];
  // Padrão 3: "payment_method_types[2]: sepa_debit"
  m = msg.match(/payment_method_types\[\d+\]:\s*([a-z_]+)/i);
  if (m) return m[1];
  // Fallback: método com underscore após a palavra "type" (ignora "provided")
  m = msg.match(/type[^a-z_]+([a-z]+_[a-z_]+)/i);
  if (m) return m[1];
  return null;
}

async function createStripeCheckout(
  stripeKey: string,
  baseParams: URLSearchParams,
  methods: string[],
  currency: string,
): Promise<{ ok: true; data: any; usedMethods: string[] } | { ok: false; error: string; offending: string | null }> {
  let attempt = methods.slice();
  for (let i = 0; i < 4; i++) {
    if (attempt.length === 0) {
      return {
        ok: false,
        error: `Nenhum método de pagamento ativo na conta Stripe para ${currency}. Active card / multibanco / mb_way no painel Stripe.`,
        offending: null,
      };
    }
    const params = new URLSearchParams(baseParams.toString());
    attempt.forEach((m, idx) => params.append(`payment_method_types[${idx}]`, m));
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    if (!data.error) return { ok: true, data, usedMethods: attempt };
    const msg: string = data.error.message || "Stripe error";
    const offending = extractOffendingMethod(msg);
    if (offending && attempt.includes(offending)) {
      markInactive(currency, offending);
      attempt = attempt.filter((m) => m !== offending);
      continue;
    }
    return { ok: false, error: msg, offending };
  }
  return { ok: false, error: "Esgotadas as tentativas de métodos de pagamento.", offending: null };
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

    // Métodos de cobrança direta (não-gateway) — não geram link Stripe.
    const directMethods = ["direto", "parcelado_direto", "transferencia", "n"];
    if (payment_method && directMethods.includes(String(payment_method).toLowerCase())) {
      return new Response(JSON.stringify({
        error: `Método "${payment_method}" é de cobrança direta — não gera link de pagamento. Edite a parcela e escolha Cartão, Multibanco, MB Way, PIX ou Boleto para gerar um link.`,
      }), {
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

    // 2. Fetch installment — supports synthetic IDs (parcelas geradas a partir do Bitrix24)
    let record: any = null;
    let actualRecordId = financial_record_id;
    const isSynthetic = typeof financial_record_id === "string" && financial_record_id.startsWith("synthetic-");

    if (isSynthetic) {
      // Format: synthetic-{dealId}-{installmentNumber}
      const parts = financial_record_id.split("-");
      const dealIdStr = parts[1];
      const installmentNumber = parseInt(parts[2] || "1", 10);
      const dealIdNum = parseInt(dealIdStr, 10);

      if (!isFinite(dealIdNum) || !isFinite(installmentNumber)) {
        return new Response(JSON.stringify({ error: "Synthetic ID inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Security: deal must match receipt link
      if (!link.bitrix24_deal_id || Number(link.bitrix24_deal_id) !== dealIdNum) {
        return new Response(JSON.stringify({ error: "Parcela não pertence a este comprovante" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try to find an existing record for this deal+installment first
      const { data: existing } = await supabase
        .from("financial_records")
        .select("*")
        .eq("bitrix24_deal_id", dealIdNum)
        .eq("installment_number", installmentNumber)
        .maybeSingle();

      if (existing) {
        record = existing;
        actualRecordId = existing.id;
      } else {
        // Materialize synthetic installment from Bitrix24 deal data
        const { data: integration } = await supabase
          .from("bitrix24_integrations")
          .select("client_endpoint, access_token")
          .limit(1).maybeSingle();

        if (!integration?.client_endpoint || !integration?.access_token) {
          return new Response(JSON.stringify({ error: "Integração Bitrix24 não configurada" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const endpoint = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
        const dealRes = await fetch(`${endpoint}crm.deal.get?auth=${integration.access_token}&id=${dealIdNum}`);
        const dealJson = await dealRes.json();
        const dealData = dealJson?.result;

        if (!dealData) {
          return new Response(JSON.stringify({ error: "Negócio Bitrix24 não encontrado" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Resolve enumeration for total installments
        let totalInstallments = parseInt(parts[3] || "0", 10) || installmentNumber;
        const totalEnum = dealData.UF_CRM_EMMELY_TOTAL_INSTALLMENTS;
        if (totalEnum) {
          try {
            const ufRes = await fetch(`${endpoint}crm.deal.userfield.list?auth=${integration.access_token}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filter: { FIELD_NAME: "UF_CRM_EMMELY_TOTAL_INSTALLMENTS" } }),
            });
            const ufJson = await ufRes.json();
            const field = (ufJson?.result || [])[0];
            const item = (field?.LIST || []).find((i: any) => String(i.ID) === String(totalEnum));
            const n = parseInt(item?.VALUE || String(totalEnum), 10);
            if (isFinite(n) && n > 0) totalInstallments = n;
          } catch {}
        }

        const dealAmount = parseFloat(dealData.OPPORTUNITY || "0") || 0;
        const installmentValueRaw = parseFloat(dealData.UF_CRM_EMMELY_INSTALLMENT_VALUE || "0");
        const perValue = installmentValueRaw > 0
          ? installmentValueRaw
          : Math.round((dealAmount / totalInstallments) * 100) / 100;

        const dealCurrency = dealData.CURRENCY_ID || "EUR";
        const baseDue = dealData.UF_CRM_EMMELY_NEXT_DUE_DATE || null;
        const paidCount = parseInt(dealData.UF_CRM_EMMELY_PAID_INSTALLMENTS || "0", 10) || 0;

        // Compute due date for this installment
        let dueDate: string | null = null;
        if (baseDue) {
          const offset = installmentNumber - (paidCount + 1);
          const d = new Date(baseDue);
          if (!isNaN(d.getTime())) {
            const day = d.getUTCDate();
            d.setUTCMonth(d.getUTCMonth() + offset);
            if (d.getUTCDate() < day) d.setUTCDate(0);
            dueDate = d.toISOString().slice(0, 10);
          }
        }

        // Validate required Bitrix24 fields BEFORE attempting insert
        const missingFields: string[] = [];
        if (!(perValue > 0)) missingFields.push("UF_CRM_EMMELY_INSTALLMENT_VALUE (ou OPPORTUNITY)");
        if (!dealCurrency) missingFields.push("CURRENCY_ID");
        if (missingFields.length > 0) {
          return new Response(JSON.stringify({
            error: "Faltam dados no Bitrix24 para gerar a cobrança",
            missing_fields: missingFields,
            deal_id: dealIdNum,
          }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const totalValue = perValue * totalInstallments;

        // Note: 'currency' is intentionally NOT inserted — column doesn't exist on financial_records.
        // Currency is tracked via Stripe checkout + payment_transactions.
        const { data: inserted, error: insertErr } = await supabase
          .from("financial_records")
          .insert({
            bitrix24_deal_id: String(dealIdNum),
            installment_number: installmentNumber,
            total_installments: totalInstallments,
            installment_value: perValue,
            total_value: totalValue,
            due_date: dueDate,
            status: "pendente",
            description: dealData.TITLE || link.deal_title || `Parcela ${installmentNumber}/${totalInstallments}`,
          })
          .select()
          .single();

        if (insertErr || !inserted) {
          console.error("[PAYMENT-CREATE-LINK] materialize error:", insertErr);
          return new Response(JSON.stringify({
            error: "Não foi possível materializar a parcela",
            details: insertErr?.message || "erro desconhecido",
          }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        record = { ...inserted, currency: dealCurrency };
        actualRecordId = inserted.id;
      }
    } else {
      const { data: existingRecord } = await supabase
        .from("financial_records")
        .select("*")
        .eq("id", financial_record_id)
        .maybeSingle();

      if (!existingRecord) {
        return new Response(JSON.stringify({ error: "Parcela não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      record = existingRecord;

      // Security: record must belong to the same contract or deal as the receipt link
      const matchesContract = link.contract_id && record.contract_id === link.contract_id;
      const matchesDeal = link.bitrix24_deal_id && record.bitrix24_deal_id === link.bitrix24_deal_id;
      if (!matchesContract && !matchesDeal) {
        return new Response(JSON.stringify({ error: "Parcela não pertence a este comprovante" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // 4. Get Stripe key — try multiple key-name conventions (case-insensitive as last resort)
    const region = currency === "BRL" ? "br" : "pt";
    const regionalKey = region === "br" ? "STRIPE_SECRET_KEY_BR" : "STRIPE_SECRET_KEY_PT";
    const regionalProvider = region === "br" ? "stripe_br" : "stripe_pt";
    const candidates: Array<{ provider: string; key: string }> = [
      { provider: regionalProvider, key: regionalKey },
      { provider: regionalProvider, key: "STRIPE_SECRET_KEY" },
      { provider: "stripe", key: regionalKey },
      { provider: "stripe", key: "STRIPE_SECRET_KEY" },
      { provider: "stripe", key: region === "br" ? "stripe_secret_br" : "stripe_secret_pt" },
      { provider: "stripe", key: "stripe_secret" },
    ];
    let stripeKey: string | null = null;
    const isValidSecret = (v: string | null | undefined) => !!v && !v.startsWith("pk_") && !v.startsWith("rk_") && (v.startsWith("sk_") || v.length > 30);
    for (const c of candidates) {
      const v = await getCredential(supabase, c.provider, c.key);
      if (isValidSecret(v)) { stripeKey = v; break; }
    }
    // Case-insensitive fallback: scan any stripe* provider for a valid sk_ key
    if (!stripeKey) {
      const { data: rows } = await supabase
        .from("integration_credentials")
        .select("credential_value, credential_key, provider")
        .ilike("provider", "stripe%")
        .ilike("credential_key", "%stripe_secret%");
      for (const r of rows || []) {
        const v = String(r.credential_value || "").trim();
        if (isValidSecret(v)) { stripeKey = v; break; }
      }
    }
    if (!stripeKey) {
      const envKey = Deno.env.get("STRIPE_SECRET_KEY") || null;
      if (isValidSecret(envKey)) stripeKey = envKey;
    }

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Build Stripe checkout
    const description = `Parcela ${record.installment_number || 1}/${record.total_installments || 1} — ${link.deal_title || record.description || "Pagamento"}${lateChargesInfo}`;
    const baseUrl = (Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev").replace(/\/+$/, "");
    const successUrl = `${baseUrl}/pagamento/${token}?payment=success`;
    const cancelUrl = `${baseUrl}/pagamento/${token}?payment=cancelled`;
    const requested = getStripePaymentMethods(currency, payment_method);
    const methods = filterInactive(currency, requested).length > 0
      ? filterInactive(currency, requested)
      : requested;

    const baseParams = new URLSearchParams();
    baseParams.append("mode", "payment");
    baseParams.append("line_items[0][price_data][currency]", currency.toLowerCase());
    baseParams.append("line_items[0][price_data][unit_amount]", Math.round(finalAmount * 100).toString());
    baseParams.append("line_items[0][price_data][product_data][name]", description);
    baseParams.append("line_items[0][quantity]", "1");
    baseParams.append("success_url", successUrl);
    baseParams.append("cancel_url", cancelUrl);
    baseParams.append("metadata[financial_record_id]", actualRecordId);
    baseParams.append("metadata[receipt_token]", token);
    if (link.bitrix24_deal_id) baseParams.append("metadata[bitrix24_deal_id]", String(link.bitrix24_deal_id));
    if (record.contract_id) baseParams.append("metadata[contract_id]", record.contract_id);

    const stripeResult = await createStripeCheckout(stripeKey, baseParams, methods, currency);

    if (!stripeResult.ok) {
      const offending = stripeResult.offending ?? payment_method ?? "(desconhecido)";
      const userMsg = stripeResult.offending
        ? `Método "${stripeResult.offending}" não está activado. Active-o no painel Stripe ou escolha outro método.`
        : stripeResult.error;
      return new Response(JSON.stringify({ error: userMsg, details: stripeResult.error, offending_method: offending }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripeData = stripeResult.data;
    const usedMethods = stripeResult.usedMethods;

    // 6. Create payment_transactions row + save link
    const gatewayPaymentId = stripeData.payment_intent || stripeData.id;
    const paymentUrl = stripeData.url;

    try {
      await supabase.from("payment_transactions").insert({
        financial_record_id: actualRecordId,
        contract_id: record.contract_id || null,
        amount: finalAmount,
        currency,
        gateway: "stripe",
        gateway_payment_id: gatewayPaymentId,
        payment_method: payment_method || usedMethods[0] || "card",
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
        .eq("id", actualRecordId);
    } catch (e) {
      console.error("[PAYMENT-CREATE-LINK] financial_records update error:", e);
    }

    // 7. Materialize Smart Invoice in Bitrix24 (one invoice per installment).
    // Only when the record doesn't yet have one and we have a deal_id to link.
    let bitrixInvoiceId: string | null = (record.bitrix24_invoice_id as any) || null;
    let bitrixInvoiceWarning: string | null = null;

    if (!bitrixInvoiceId && link.bitrix24_deal_id) {
      try {
        const { data: integration } = await supabase
          .from("bitrix24_integrations")
          .select("client_endpoint, access_token")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (integration?.client_endpoint && integration?.access_token) {
          const endpoint = integration.client_endpoint.endsWith("/")
            ? integration.client_endpoint
            : integration.client_endpoint + "/";
          const dealIdNum = parseInt(String(link.bitrix24_deal_id), 10);

          let contactId: number | undefined = undefined;
          try {
            const dealRes = await fetch(`${endpoint}crm.deal.get?auth=${integration.access_token}&id=${dealIdNum}`);
            const dealJson = await dealRes.json();
            const cid = dealJson?.result?.CONTACT_ID;
            if (cid) contactId = parseInt(String(cid), 10);
          } catch { /* ignore */ }

          const invoiceTitle = `Parcela ${record.installment_number || 1}/${record.total_installments || 1} — ${link.deal_title || record.description || "Pagamento"}`;
          const invFields: Record<string, any> = {
            title: invoiceTitle,
            opportunity: baseAmount,
            currencyId: currency,
            isManualOpportunity: "Y",
            parentId2: dealIdNum,
            begindate: new Date().toISOString().split("T")[0],
            comments: `Fatura gerada automaticamente pelo Emmely Pay (parcela ${record.installment_number || 1}/${record.total_installments || 1}).`,
          };
          if (contactId) invFields.contactId = contactId;
          if (record.due_date) invFields.closedate = record.due_date;

          const invRes = await fetch(`${endpoint}crm.item.add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityTypeId: 31, fields: invFields, auth: integration.access_token }),
          });
          const invJson = await invRes.json();
          const newInvoiceId = invJson?.result?.item?.id;

          if (newInvoiceId) {
            bitrixInvoiceId = String(newInvoiceId);
            await supabase
              .from("financial_records")
              .update({ bitrix24_invoice_id: bitrixInvoiceId })
              .eq("id", actualRecordId);
            console.log("[PAYMENT-CREATE-LINK] Smart Invoice created:", bitrixInvoiceId);
          } else {
            bitrixInvoiceWarning = invJson?.error_description || invJson?.error || "unknown";
            console.error("[PAYMENT-CREATE-LINK] Smart Invoice create failed:", bitrixInvoiceWarning);
          }
        } else {
          bitrixInvoiceWarning = "no_active_integration";
        }
      } catch (invErr) {
        bitrixInvoiceWarning = invErr instanceof Error ? invErr.message : String(invErr);
        console.error("[PAYMENT-CREATE-LINK] Smart Invoice error:", invErr);
      }
    }

    return new Response(JSON.stringify({
      payment_url: paymentUrl,
      gateway_payment_id: gatewayPaymentId,
      amount: finalAmount,
      base_amount: baseAmount,
      late_charges: finalAmount - baseAmount,
      currency,
      bitrix24_invoice_id: bitrixInvoiceId,
      bitrix24_invoice_warning: bitrixInvoiceWarning,
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
