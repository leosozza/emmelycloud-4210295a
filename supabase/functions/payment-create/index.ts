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
  return data?.credential_value || null;
}

function getGateway(country: string | null, currency: string): "stripe" | "asaas" {
  if (country?.toLowerCase() === "brasil" || country?.toLowerCase() === "brazil" || currency === "BRL") {
    return "asaas";
  }
  return "stripe";
}

async function createStripePayment(apiKey: string, amount: number, currency: string, customerEmail: string, description: string) {
  // Create a Payment Intent
  const params = new URLSearchParams();
  params.append("amount", Math.round(amount * 100).toString()); // Stripe uses cents
  params.append("currency", currency.toLowerCase());
  params.append("description", description);
  if (customerEmail) params.append("receipt_email", customerEmail);
  params.append("payment_method_types[]", "card");

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
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
    gateway_payment_id: data.id,
    payment_url: null, // Payment Intent uses client_secret on frontend
    client_secret: data.client_secret,
    status: "pending",
  };
}

async function createAsaasPayment(apiKey: string, amount: number, paymentMethod: string, customerData: any, description: string) {
  // Detect sandbox keys (start with $aact_hmlg_ or similar sandbox prefixes)
  const isSandbox = apiKey.includes("_hmlg_") || apiKey.includes("sandbox");
  const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";

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
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);

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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { contract_id, client_id, financial_record_id, amount, currency = "EUR", payment_method = "card", customer_data, description = "Pagamento Emmely Cloud" } = body;

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "amount is required and must be > 0" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine gateway from client country or currency
    let clientCountry = customer_data?.country || null;
    if (!clientCountry && client_id) {
      const { data: client } = await supabase.from("clients").select("country").eq("id", client_id).maybeSingle();
      clientCountry = client?.country || null;
    }

    const gateway = getGateway(clientCountry, currency);

    let result: any;

    if (gateway === "stripe") {
      const stripeKey = await getCredential(supabase, "stripe", "STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return new Response(JSON.stringify({ error: "Stripe API key not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      result = await createStripePayment(stripeKey, amount, currency, customer_data?.email || "", description);
    } else {
      const asaasKey = await getCredential(supabase, "asaas", "ASAAS_API_KEY");
      if (!asaasKey) {
        return new Response(JSON.stringify({ error: "Asaas API key not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      result = await createAsaasPayment(asaasKey, amount, payment_method, customer_data, description);
    }

    // Save transaction
    const { data: tx, error: txError } = await supabase.from("payment_transactions").insert({
      contract_id: contract_id || null,
      client_id: client_id || null,
      financial_record_id: financial_record_id || null,
      gateway,
      gateway_payment_id: result.gateway_payment_id,
      gateway_customer_id: result.gateway_customer_id || null,
      amount,
      currency,
      payment_method,
      status: result.status || "pending",
      payment_url: result.payment_url,
      pix_qr_code: result.pix_qr_code || null,
      pix_code: result.pix_code || null,
      metadata: { client_secret: result.client_secret || null },
    }).select().single();

    if (txError) throw new Error(txError.message);

    return new Response(JSON.stringify({ ok: true, transaction: tx }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
