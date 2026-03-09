import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function getGateway(country: string | null, currency: string): "stripe" | "asaas" {
  if (country?.toLowerCase() === "brasil" || country?.toLowerCase() === "brazil" || currency === "BRL") {
    return "asaas";
  }
  return "stripe";
}

function getStripePaymentMethods(region?: "pt" | "br" | null, requestedMethod?: string | null): string[] {
  // Base methods per region
  let methods: string[];
  if (region === "pt") {
    methods = ["card", "multibanco", "mb_way", "sepa_debit", "link"];
  } else if (region === "br") {
    methods = ["card", "boleto", "pix", "link"];
  } else {
    methods = ["card", "sepa_debit", "multibanco", "mb_way", "link"];
  }
  
  // If a specific method was requested and it's valid for Stripe, prioritize it
  if (requestedMethod && requestedMethod !== "card" && requestedMethod !== "direto") {
    // Move requested method to front if present, or add it if valid
    const validStripeMethods = ["card", "multibanco", "mb_way", "sepa_debit", "pix", "boleto", "link"];
    if (validStripeMethods.includes(requestedMethod)) {
      methods = methods.filter(m => m !== requestedMethod);
      methods.unshift(requestedMethod);
    }
  }
  
  return methods;
}

async function createStripePayment(apiKey: string, amount: number, currency: string, customerEmail: string, description: string, returnUrl?: string, region?: "pt" | "br" | null, requestedMethod?: string | null) {
  // Create a Checkout Session with regional payment methods
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("line_items[0][price_data][currency]", currency.toLowerCase());
  params.append("line_items[0][price_data][unit_amount]", Math.round(amount * 100).toString());
  params.append("line_items[0][price_data][product_data][name]", description);
  params.append("line_items[0][quantity]", "1");

  const paymentMethods = getStripePaymentMethods(region, requestedMethod);
  for (const pm of paymentMethods) {
    params.append("payment_method_types[]", pm);
  }

  if (customerEmail) params.append("customer_email", customerEmail);

  const baseUrl = returnUrl || "https://emmelycloud.lovable.app";
  params.append("success_url", `${baseUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  params.append("cancel_url", `${baseUrl}?payment=cancelled`);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return {
    gateway_payment_id: data.payment_intent || data.id,
    payment_url: data.url,
    client_secret: null,
    status: "pending",
    checkout_session_id: data.id,
  };
}

function isValidCPF(cpf: string): boolean {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  let rem = (sum * 10) % 11;
  if (rem >= 10) rem = 0;
  if (rem !== parseInt(cpf.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  rem = (sum * 10) % 11;
  if (rem >= 10) rem = 0;
  if (rem !== parseInt(cpf.substring(10, 11))) return false;
  return true;
}

function isValidCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/[^\d]+/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const weights1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(cnpj[i]) * weights1[i];
  let rem = sum % 11;
  if (parseInt(cnpj[12]) !== (rem < 2 ? 0 : 11 - rem)) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(cnpj[i]) * weights2[i];
  rem = sum % 11;
  if (parseInt(cnpj[13]) !== (rem < 2 ? 0 : 11 - rem)) return false;
  return true;
}

function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/[^\d]+/g, '');
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}

async function createAsaasPayment(apiKey: string, amount: number, paymentMethod: string, customerData: any, description: string, environment: string, customDueDate?: string) {
  const baseUrl = environment === "production" ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";

  // 1. Find or create customer
  let customerId: string | null = null;
  if (customerData?.cpf_cnpj) {
    const searchRes = await fetch(`${baseUrl}/customers?cpfCnpj=${customerData.cpf_cnpj}`, {
      headers: { "access_token": apiKey },
    });
    const searchData = await searchRes.json();
    if (searchData.data?.length > 0) {
      customerId = searchData.data[0].id;
    }
  }

  if (!customerId) {
    const createRes = await fetch(`${baseUrl}/customers`, {
      method: "POST",
      headers: { "access_token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: customerData?.name || "Cliente",
        email: customerData?.email || undefined,
        cpfCnpj: customerData?.cpf_cnpj || undefined,
        phone: customerData?.phone || undefined,
      }),
    });
    const createData = await createRes.json();
    if (createData.errors) throw new Error(JSON.stringify(createData.errors));
    customerId = createData.id;
  }

  // 2. Map payment method
  const billingTypeMap: Record<string, string> = {
    pix: "PIX",
    boleto: "BOLETO",
    card: "CREDIT_CARD",
  };
  const billingType = billingTypeMap[paymentMethod] || "PIX";

  // 3. Create payment
  const dueDate = customDueDate ? new Date(customDueDate) : new Date();
  if (!customDueDate) dueDate.setDate(dueDate.getDate() + 3);

  const paymentRes = await fetch(`${baseUrl}/payments`, {
    method: "POST",
    headers: { "access_token": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value: amount,
      dueDate: dueDate.toISOString().split("T")[0],
      description,
    }),
  });

  const paymentData = await paymentRes.json();
  if (paymentData.errors) throw new Error(JSON.stringify(paymentData.errors));

  let pixQrCode = null;
  let pixCode = null;

  // 4. If PIX, get QR code
  if (billingType === "PIX" && paymentData.id) {
    const pixRes = await fetch(`${baseUrl}/payments/${paymentData.id}/pixQrCode`, {
      headers: { "access_token": apiKey },
    });
    const pixData = await pixRes.json();
    if (pixData.encodedImage) pixQrCode = pixData.encodedImage;
    if (pixData.payload) pixCode = pixData.payload;
  }

  return {
    gateway_payment_id: paymentData.id,
    gateway_customer_id: customerId,
    payment_url: paymentData.invoiceUrl || paymentData.bankSlipUrl || null,
    pix_qr_code: pixQrCode,
    pix_code: pixCode,
    status: "pending",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // PATCH: update transaction metadata
  if (req.method === "PATCH") {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const body = await req.json();
      const { transaction_id, metadata_update, status_update } = body;
      if (!transaction_id) {
        return new Response(JSON.stringify({ error: "transaction_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Get existing metadata and merge
      const { data: existing } = await supabase.from("payment_transactions").select("metadata").eq("id", transaction_id).maybeSingle();
      const merged = metadata_update ? { ...(existing?.metadata as any || {}), ...metadata_update } : (existing?.metadata || {});
      const updatePayload: any = { metadata: merged };
      if (status_update) updatePayload.status = status_update;
      const { error } = await supabase.from("payment_transactions").update(updatePayload).eq("id", transaction_id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { contract_id, client_id, financial_record_id, amount, currency = "EUR", payment_method = "card", customer_data, description = "Pagamento Emmely Cloud", metadata: extraMetadata, due_date, installment_number, total_installments, installment_group_id, is_down_payment, force_gateway, company_id, credential_provider, credential_key } = body;

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "amount is required and must be > 0" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine gateway: force_gateway overrides auto-detection
    let gateway: "stripe" | "asaas";
    let stripeRegion: "pt" | "br" | null = null;

    if (force_gateway) {
      if (force_gateway === "stripe_pt") {
        gateway = "stripe";
        stripeRegion = "pt";
      } else if (force_gateway === "stripe_br") {
        gateway = "stripe";
        stripeRegion = "br";
      } else if (force_gateway === "asaas") {
        gateway = "asaas";
      } else if (force_gateway === "direto") {
        gateway = "stripe"; // won't be used, handled below
      } else {
        gateway = "stripe";
      }
    } else {
      let clientCountry = customer_data?.country || null;
      if (!clientCountry && client_id) {
        const { data: client } = await supabase.from("clients").select("country").eq("id", client_id).maybeSingle();
        clientCountry = client?.country || null;
      }
      gateway = getGateway(clientCountry, currency);
    }

    let result: any;

    if (payment_method === "direto" || force_gateway === "direto") {
      // Direct payment - no gateway call, just record the transaction
      result = {
        gateway_payment_id: `direto_${crypto.randomUUID()}`,
        payment_url: null,
        client_secret: null,
        status: "pending",
        gateway_customer_id: null,
        pix_qr_code: null,
        pix_code: null,
      };
    } else if (gateway === "stripe") {
      // Use credential override from company if provided
      let stripeKey: string | null = null;
      if (credential_provider && credential_key) {
        stripeKey = await getCredential(supabase, credential_provider, credential_key);
      }
      if (!stripeKey) {
        // Determine which Stripe key to use based on region
        const stripeKeyName = stripeRegion === "br" ? "STRIPE_SECRET_KEY_BR" : (stripeRegion === "pt" ? "STRIPE_SECRET_KEY_PT" : "STRIPE_SECRET_KEY");
        const stripeProvider = stripeRegion === "br" ? "stripe_br" : (stripeRegion === "pt" ? "stripe_pt" : "stripe");
        stripeKey = await getCredential(supabase, stripeProvider, stripeKeyName);
        if (!stripeKey && stripeRegion) {
          stripeKey = await getCredential(supabase, stripeProvider, "STRIPE_SECRET_KEY");
        }
        if (!stripeKey) {
          stripeKey = await getCredential(supabase, "stripe", stripeKeyName);
        }
        if (!stripeKey) {
          stripeKey = await getCredential(supabase, "stripe", "STRIPE_SECRET_KEY");
        }
      }
      if (!stripeKey) {
        return new Response(JSON.stringify({ error: `Stripe API key not configured` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      result = await createStripePayment(stripeKey, amount, currency, customer_data?.email || "", description, body.return_url, stripeRegion, payment_method);
    } else {
      // Validate CPF/CNPJ before calling Asaas
      if (customer_data?.cpf_cnpj) {
        if (!isValidCpfCnpj(customer_data.cpf_cnpj)) {
          return new Response(JSON.stringify({ error: "CPF/CNPJ inválido. Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // Use credential override from company if provided
      let asaasKey: string | null = null;
      if (credential_provider && credential_key) {
        asaasKey = await getCredential(supabase, credential_provider, credential_key);
      }
      if (!asaasKey) {
        asaasKey = await getCredential(supabase, "asaas", "ASAAS_API_KEY");
      }
      if (!asaasKey) {
        return new Response(JSON.stringify({ error: "Asaas API key not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const asaasEnv = await getCredential(supabase, "asaas", "ASAAS_ENVIRONMENT") || "sandbox";
      result = await createAsaasPayment(asaasKey, amount, payment_method, customer_data, description, asaasEnv, due_date);
    }

    const effectiveGateway = (payment_method === "direto" || force_gateway === "direto") ? "direto" : (force_gateway || gateway);

    // Save transaction
    const { data: tx, error: txError } = await supabase.from("payment_transactions").insert({
      contract_id: contract_id || null,
      client_id: client_id || null,
      financial_record_id: financial_record_id || null,
      company_id: company_id || null,
      gateway: effectiveGateway,
      gateway_payment_id: result.gateway_payment_id,
      gateway_customer_id: result.gateway_customer_id || null,
      amount,
      currency,
      payment_method: payment_method === "direto" ? "parcelado_direto" : payment_method,
      status: result.status || "pending",
      payment_url: result.payment_url,
      pix_qr_code: result.pix_qr_code || null,
      pix_code: result.pix_code || null,
      metadata: { client_secret: result.client_secret || null, installment_number: installment_number ?? null, total_installments: total_installments ?? null, installment_group_id: installment_group_id ?? null, is_down_payment: is_down_payment ?? false, ...(extraMetadata || {}) },
    }).select().single();

    if (txError) throw new Error(txError.message);

    // --- Bitrix24 Badge: emmely_payment_created ---
    try {
      const bitrixDealId = body.bitrix_deal_id || extraMetadata?.bitrix_deal_id;
      if (bitrixDealId) {
        const { data: integration } = await supabase
          .from("bitrix24_integrations")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (integration?.client_endpoint && integration?.access_token) {
          const endpoint = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
          const fmt = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
          await fetch(`${endpoint}crm.activity.configurable.add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              auth: integration.access_token,
              ownerTypeId: 2, // Deal
              ownerId: parseInt(bitrixDealId),
              fields: { completed: false, isIncomingChannel: "N", responsibleId: 1, badgeCode: "emmely_payment_created" },
              layout: {
                icon: { code: "money" },
                header: { title: "Cobrança Criada" },
                body: { logo: { code: "robot" }, blocks: {
                  amount: { type: "text", properties: { value: fmt(amount) } },
                  gateway: { type: "text", properties: { value: effectiveGateway } },
                  method: { type: "text", properties: { value: payment_method } },
                } },
              },
            }),
          });
          console.log(`[PAYMENT-CREATE] Badge emmely_payment_created for deal ${bitrixDealId}`);
        }
      }
    } catch (badgeErr) {
      console.error("[PAYMENT-CREATE] Badge error:", badgeErr);
    }

    return new Response(JSON.stringify({ ok: true, transaction: tx }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
