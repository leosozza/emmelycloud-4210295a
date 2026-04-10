import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getCredential(supabase: any, provider: string, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", provider)
    .eq("credential_key", key)
    .maybeSingle();
  return data?.credential_value?.trim() || null;
}

function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/[^\d]+/g, '');
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}

function isValidCPF(cpf: string): boolean {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  let rem = (sum * 10) % 11;
  if (rem >= 10) rem = 0;
  if (rem !== parseInt(cpf.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  rem = (sum * 10) % 11;
  if (rem >= 10) rem = 0;
  return rem === parseInt(cpf.substring(10, 11));
}

function isValidCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/[^\d]+/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(cnpj[i]) * w1[i];
  let rem = sum % 11;
  if (parseInt(cnpj[12]) !== (rem < 2 ? 0 : 11 - rem)) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(cnpj[i]) * w2[i];
  rem = sum % 11;
  return parseInt(cnpj[13]) === (rem < 2 ? 0 : 11 - rem);
}

/**
 * Bitrix24 Payment Handler — CHECKOUT Mode
 * 
 * Receives POST from Bitrix24 with payment data, creates a charge via Asaas or Stripe,
 * and returns { PAYMENT_URL, PAYMENT_ID } for the customer to be redirected.
 * 
 * Expected POST body (from Bitrix24 CHECKOUT_DATA):
 * {
 *   BX_SYSTEM_PARAMS: { RETURN_URL, PAYSYSTEM_ID, PAYMENT_ID, SUM, CURRENCY, EXTERNAL_PAYMENT_ID },
 *   ... additional FIELDS from handler CODES
 * }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse body — Bitrix24 may send as form-urlencoded or JSON
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, any>;

    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      // Form-urlencoded with PHP-style array notation
      const text = await req.text();
      body = parseFormData(text);
    }

    console.log("[BX24-PAYMENT] Received:", JSON.stringify(body).substring(0, 1000));

    const sysParams = body.BX_SYSTEM_PARAMS || body.bx_system_params || {};
    const paymentId = sysParams.PAYMENT_ID || sysParams.payment_id || body.PAYMENT_ID;
    const paySystemId = sysParams.PAYSYSTEM_ID || sysParams.paysystem_id || body.PAYSYSTEM_ID;
    const sum = parseFloat(sysParams.SUM || sysParams.sum || body.PAYMENT_SHOULD_PAY || "0");
    const currency = (sysParams.CURRENCY || sysParams.currency || body.PAYMENT_CURRENCY || "BRL").toUpperCase();
    const returnUrl = sysParams.RETURN_URL || sysParams.return_url || "";
    const externalPaymentId = sysParams.EXTERNAL_PAYMENT_ID || sysParams.external_payment_id || "";

    if (!sum || sum <= 0) {
      return new Response(JSON.stringify({ PAYMENT_ERRORS: ["Valor inválido. O valor deve ser maior que zero."] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If there's already an external payment ID, check if we have a transaction
    if (externalPaymentId) {
      const { data: existingTx } = await supabase
        .from("payment_transactions")
        .select("id, payment_url, gateway_payment_id, status")
        .eq("gateway_payment_id", externalPaymentId)
        .maybeSingle();

      if (existingTx?.payment_url) {
        return new Response(JSON.stringify({
          PAYMENT_URL: existingTx.payment_url,
          PAYMENT_ID: existingTx.gateway_payment_id,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Determine gateway: explicit selection > currency fallback
    const rawGateway = (body.GATEWAY || body.gateway || "").toString().trim();
    const gwMap: Record<string, string> = {
      "stripe pt": "stripe_pt", "stripe_pt": "stripe_pt",
      "stripe br": "stripe_br", "stripe_br": "stripe_br",
      "stripe": "stripe", "asaas": "asaas",
    };
    const resolvedGateway = rawGateway ? (gwMap[rawGateway.toLowerCase()] || rawGateway) : "";
    
    let gateway: string;
    let stripeProvider = "stripe";
    let stripeKeyName = "STRIPE_SECRET_KEY";
    
    if (resolvedGateway === "asaas") {
      gateway = "asaas";
    } else if (resolvedGateway === "stripe_pt") {
      gateway = "stripe";
      stripeProvider = "stripe_pt";
      stripeKeyName = "STRIPE_SECRET_KEY_PT";
    } else if (resolvedGateway === "stripe_br") {
      gateway = "stripe";
      stripeProvider = "stripe_br";
      stripeKeyName = "STRIPE_SECRET_KEY_BR";
    } else if (resolvedGateway === "stripe") {
      gateway = "stripe";
    } else {
      // Fallback by currency
      gateway = (currency === "BRL") ? "asaas" : "stripe";
    }
    
    const paymentMethod = (gateway === "asaas") ? "pix" : "card";
    const description = `Bitrix24 Payment #${paymentId}`;

    let result: any;

    if (gateway === "asaas") {
      const asaasKey = await getCredential(supabase, "asaas", "ASAAS_API_KEY");
      if (!asaasKey) {
        return new Response(JSON.stringify({ PAYMENT_ERRORS: ["Asaas API key não configurada."] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const asaasEnv = await getCredential(supabase, "asaas", "ASAAS_ENVIRONMENT") || "sandbox";
      const isHmlg = asaasKey.includes("_hmlg_");
      const baseUrl = (asaasEnv === "production" && !isHmlg)
        ? "https://api.asaas.com/v3"
        : "https://sandbox.asaas.com/api/v3";

      // Find or create customer (generic for Bitrix24)
      let customerId: string | null = null;
      const customerName = body.CUSTOMER_NAME || body.customer_name || "Cliente Bitrix24";
      const customerEmail = body.CUSTOMER_EMAIL || body.customer_email || "";
      const customerCpfCnpj = body.CUSTOMER_CPF_CNPJ || body.customer_cpf_cnpj || "";

      if (customerCpfCnpj && !isValidCpfCnpj(customerCpfCnpj)) {
        return new Response(JSON.stringify({ PAYMENT_ERRORS: ["CPF/CNPJ inválido."] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Search existing customer by CPF/CNPJ
      if (customerCpfCnpj) {
        const searchRes = await fetch(`${baseUrl}/customers?cpfCnpj=${customerCpfCnpj}`, {
          headers: { "access_token": asaasKey },
        });
        const searchData = await searchRes.json();
        if (searchData.data?.length > 0) customerId = searchData.data[0].id;
      }

      if (!customerId) {
        const createRes = await fetch(`${baseUrl}/customers`, {
          method: "POST",
          headers: { "access_token": asaasKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customerName,
            email: customerEmail || undefined,
            cpfCnpj: customerCpfCnpj || undefined,
          }),
        });
        const createData = await createRes.json();
        if (createData.errors) {
          return new Response(JSON.stringify({ PAYMENT_ERRORS: createData.errors.map((e: any) => e.description || e.code) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        customerId = createData.id;
      }

      // Create payment
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);

      const paymentRes = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: { "access_token": asaasKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customerId,
          billingType: "PIX",
          value: sum,
          dueDate: dueDate.toISOString().split("T")[0],
          description,
          externalReference: `bitrix24_${paymentId}`,
        }),
      });

      const paymentData = await paymentRes.json();
      if (paymentData.errors) {
        return new Response(JSON.stringify({ PAYMENT_ERRORS: paymentData.errors.map((e: any) => e.description || e.code) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get PIX QR code
      let pixQrCode = null;
      let pixCode = null;
      if (paymentData.id) {
        const pixRes = await fetch(`${baseUrl}/payments/${paymentData.id}/pixQrCode`, {
          headers: { "access_token": asaasKey },
        });
        const pixData = await pixRes.json();
        if (pixData.encodedImage) pixQrCode = pixData.encodedImage;
        if (pixData.payload) pixCode = pixData.payload;
      }

      result = {
        gateway_payment_id: paymentData.id,
        gateway_customer_id: customerId,
        payment_url: paymentData.invoiceUrl || paymentData.bankSlipUrl || null,
        pix_qr_code: pixQrCode,
        pix_code: pixCode,
      };
    } else {
      // Stripe — use regional key if selected, fallback to generic
      let stripeKey = await getCredential(supabase, stripeProvider, stripeKeyName);
      if (!stripeKey && stripeProvider !== "stripe") {
        stripeKey = await getCredential(supabase, stripeProvider, "STRIPE_SECRET_KEY");
      }
      if (!stripeKey) {
        stripeKey = await getCredential(supabase, "stripe", "STRIPE_SECRET_KEY");
      }
      if (!stripeKey) {
        return new Response(JSON.stringify({ PAYMENT_ERRORS: ["Stripe API key não configurada."] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (stripeKey.startsWith("pk_")) {
        return new Response(JSON.stringify({ PAYMENT_ERRORS: ["A chave Stripe configurada é uma Publishable Key (pk_). Configure a Secret Key (sk_) em Integrações."] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams();
      params.append("mode", "payment");
      params.append("line_items[0][price_data][currency]", currency.toLowerCase());
      params.append("line_items[0][price_data][unit_amount]", Math.round(sum * 100).toString());
      params.append("line_items[0][price_data][product_data][name]", description);
      params.append("line_items[0][quantity]", "1");

      // Explicitly set payment method types based on resolved region + currency
      const stripeRegion = stripeProvider === "stripe_pt" ? "pt" : stripeProvider === "stripe_br" ? "br" : null;
      const cur = currency.toUpperCase();
      let regionalMethods: string[];
      if (stripeRegion === "br" && cur === "BRL") {
        regionalMethods = ["card", "boleto", "pix"];
      } else if (stripeRegion === "pt" && cur === "EUR") {
        regionalMethods = ["card", "multibanco", "mb_way", "sepa_debit", "link"];
      } else {
        regionalMethods = ["card", "link"];
      }
      regionalMethods.forEach((m, i) => {
        params.append(`payment_method_types[${i}]`, m);
      });

      const customerEmail = body.CUSTOMER_EMAIL || body.customer_email || "";
      if (customerEmail) params.append("customer_email", customerEmail);

      const successUrl = returnUrl || Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";
      params.append("success_url", `${successUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`);
      params.append("cancel_url", `${successUrl}?payment=cancelled`);

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await res.json();
      if (data.error) {
        return new Response(JSON.stringify({ PAYMENT_ERRORS: [data.error.message] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      result = {
        gateway_payment_id: data.payment_intent || data.id,
        payment_url: data.url,
        client_secret: null,
      };
    }

    // Save transaction in our DB
    const { data: tx, error: txError } = await supabase.from("payment_transactions").insert({
      gateway,
      gateway_payment_id: result.gateway_payment_id,
      gateway_customer_id: result.gateway_customer_id || null,
      amount: sum,
      currency,
      payment_method: paymentMethod,
      status: "pending",
      payment_url: result.payment_url,
      pix_qr_code: result.pix_qr_code || null,
      pix_code: result.pix_code || null,
      metadata: {
        bitrix24_payment_id: paymentId,
        bitrix24_paysystem_id: paySystemId,
        bitrix24_return_url: returnUrl,
        client_secret: result.client_secret || null,
      },
    }).select("id").single();

    if (txError) {
      console.error("[BX24-PAYMENT] TX insert error:", txError);
    }

    // Return response to Bitrix24
    const paymentUrl = result.payment_url || returnUrl;

    // Stripe Checkout Sessions always provide a payment_url
    if (!paymentUrl) {
      return new Response(JSON.stringify({
        PAYMENT_ERRORS: ["Não foi possível gerar um link de pagamento. Tente novamente."],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[BX24-PAYMENT] Success. URL:", paymentUrl, "ID:", result.gateway_payment_id);

    return new Response(JSON.stringify({
      PAYMENT_URL: paymentUrl,
      PAYMENT_ID: result.gateway_payment_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[BX24-PAYMENT] Error:", err);
    return new Response(JSON.stringify({ PAYMENT_ERRORS: [(err instanceof Error ? err.message : "Erro interno")] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Parse form-urlencoded with PHP notation: BX_SYSTEM_PARAMS[PAYMENT_ID]=123
function parseFormData(text: string): Record<string, any> {
  if (!text) return {};
  const params = new URLSearchParams(text);
  const data: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    const match = key.match(/^(\w+)\[(\w+)\]$/);
    if (match) {
      if (!data[match[1]]) data[match[1]] = {};
      data[match[1]][match[2]] = value;
    } else {
      data[key] = value;
    }
  }
  return data;
}
