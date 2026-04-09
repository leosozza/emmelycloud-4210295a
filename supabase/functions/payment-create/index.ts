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
  // Create a Checkout Session — do NOT hardcode payment_method_types
  // Instead, omit them so Stripe uses "automatic_payment_methods" (default behavior)
  // which only shows methods activated in the merchant's dashboard
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("line_items[0][price_data][currency]", currency.toLowerCase());
  params.append("line_items[0][price_data][unit_amount]", Math.round(amount * 100).toString());
  params.append("line_items[0][price_data][product_data][name]", description);
  params.append("line_items[0][quantity]", "1");

  if (customerEmail) params.append("customer_email", customerEmail);

  const baseUrl = returnUrl || Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";
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
      let { transaction_id, metadata_update, status_update, amount_update, due_date_update, payment_method_update, paid_amount, discount_amount, discount_reason, proof_url, notes } = body;
      const financial_record_id = body.financial_record_id;

      console.log(`[PAYMENT-CREATE PATCH] transaction_id=${transaction_id} financial_record_id=${financial_record_id} status_update=${status_update}`);

      // If no transaction_id but we have financial_record_id, try to resolve or auto-create
      if (!transaction_id && financial_record_id) {
        // Look for existing transaction linked to this financial_record
        const { data: existingTx } = await supabase.from("payment_transactions")
          .select("id").eq("financial_record_id", financial_record_id).limit(1).maybeSingle();
        if (existingTx) {
          transaction_id = existingTx.id;
          console.log(`[PAYMENT-CREATE PATCH] Resolved tx ${transaction_id} from financial_record_id ${financial_record_id}`);
        } else {
          // Auto-create synthetic transaction for legacy record
          const { data: fr } = await supabase.from("financial_records")
            .select("installment_value, total_value, bitrix24_deal_id, bitrix24_invoice_id, installment_number, total_installments, description, contract_id")
            .eq("id", financial_record_id).maybeSingle();
          const amt = fr?.installment_value || fr?.total_value || 0;
          const meta: any = { source: "payment_create_auto_legacy", bitrix_deal_id: fr?.bitrix24_deal_id };
          if (fr?.bitrix24_invoice_id) meta.bitrix_invoice_id = fr.bitrix24_invoice_id;
          if (fr?.installment_number) meta.installment_number = fr.installment_number;
          if (fr?.total_installments) meta.total_installments = fr.total_installments;
          const { data: newTx, error: createErr } = await supabase.from("payment_transactions").insert({
            financial_record_id,
            contract_id: fr?.contract_id || null,
            amount: amt,
            currency: "EUR",
            gateway: "direto",
            gateway_payment_id: `direto_${crypto.randomUUID()}`,
            payment_method: "parcelado_direto",
            status: "pending",
            metadata: meta,
          }).select().single();
          if (createErr) throw new Error(`Auto-create tx failed: ${createErr.message}`);
          transaction_id = newTx.id;
          console.log(`[PAYMENT-CREATE PATCH] Auto-created tx ${transaction_id} for legacy financial_record ${financial_record_id}`);
        }
      }

      if (!transaction_id) {
        return new Response(JSON.stringify({ error: "transaction_id or financial_record_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get existing metadata and merge
      const { data: existing } = await supabase.from("payment_transactions").select("metadata, amount").eq("id", transaction_id).maybeSingle();
      if (!existing) {
        return new Response(JSON.stringify({ error: `Transaction ${transaction_id} not found in payment_transactions` }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const existingMeta = (existing?.metadata as any) || {};
      const metaUpdates: any = { ...(metadata_update || {}) };

      // Handle paid_amount / discount for partial payments
      if (paid_amount != null) metaUpdates.paid_amount = paid_amount;
      if (discount_amount != null) metaUpdates.discount_amount = discount_amount;
      if (discount_reason) metaUpdates.discount_reason = discount_reason;
      if (proof_url) metaUpdates.proof_url = proof_url;
      if (notes) metaUpdates.notes = notes;
      if (due_date_update) metaUpdates.due_date = due_date_update;

      const merged = { ...existingMeta, ...metaUpdates };
      const updatePayload: any = { metadata: merged };
      if (status_update) updatePayload.status = status_update;
      if (amount_update != null && amount_update > 0) updatePayload.amount = amount_update;
      if (payment_method_update) updatePayload.payment_method = payment_method_update;
      const { data: txRow, error } = await supabase.from("payment_transactions").update(updatePayload).eq("id", transaction_id).select("financial_record_id, metadata, payment_method").maybeSingle();
      if (error) throw new Error(error.message);

      // Sync financial_records when marking as confirmed/paid
      if (status_update === "confirmed" || status_update === "paid") {
        const paidAt = new Date().toISOString();
        const frId = txRow?.financial_record_id || financial_record_id;
        const txMeta = (txRow?.metadata as any) || {};
        const effectivePaymentMethod = payment_method_update || txRow?.payment_method || txMeta.payment_method;

        if (frId) {
          const frUpdate: any = { status: "paga", paid_at: paidAt };
          if (effectivePaymentMethod) frUpdate.payment_method = effectivePaymentMethod;
          if (proof_url || txMeta.proof_url) frUpdate.receipt_url = proof_url || txMeta.proof_url;
          // Persist late fee info if paid_amount or discount metadata exists
          if (paid_amount != null || discount_amount != null) {
            const lateMeta: any = {};
            if (paid_amount != null) lateMeta.paid_amount = paid_amount;
            if (discount_amount != null) lateMeta.discount_amount = discount_amount;
            if (discount_reason) lateMeta.discount_reason = discount_reason;
            frUpdate.description = undefined; // don't overwrite
          }
          await supabase.from("financial_records").update(frUpdate).eq("id", frId);
          console.log(`[PAYMENT-CREATE] Synced financial_record ${frId} to paga`);

          // Auto-create receipt_link if not exists and update Bitrix24 UF fields
          try {
            const { data: currentFrForReceipt } = await supabase.from("financial_records")
              .select("contract_id, bitrix24_deal_id, description")
              .eq("id", frId).maybeSingle();
            if (currentFrForReceipt) {
              const contractId = currentFrForReceipt.contract_id;
              const dealId = currentFrForReceipt.bitrix24_deal_id;
              // Check if receipt_link already exists
              let existsQuery = supabase.from("receipt_links").select("id, token").limit(1);
              if (dealId) existsQuery = existsQuery.eq("bitrix24_deal_id", dealId);
              else if (contractId) existsQuery = existsQuery.eq("contract_id", contractId);
              const { data: existingLink } = await existsQuery.maybeSingle();
              let receiptToken = existingLink?.token;
              if (!existingLink && (contractId || dealId)) {
                const { data: newLink } = await supabase.from("receipt_links").insert({
                  contract_id: contractId || null,
                  bitrix24_deal_id: dealId || null,
                  client_name: body.client_name || txMeta.client_name || null,
                  deal_title: currentFrForReceipt.description || txMeta.deal_title || null,
                }).select("token").maybeSingle();
                receiptToken = newLink?.token;
                console.log(`[PAYMENT-CREATE] Created receipt_link for contract=${contractId} deal=${dealId}`);
              }
              // Update Bitrix24 deal with receipt URL if we have a token and dealId
              if (receiptToken && dealId) {
                const receiptUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-receipt?token=${receiptToken}`;
                try {
                  const { data: integration } = await supabase.from("bitrix24_integrations")
                    .select("*").limit(1).maybeSingle();
                  if (integration?.client_endpoint && integration?.access_token) {
                    await fetch(`${integration.client_endpoint}crm.deal.update`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        auth: integration.access_token,
                        id: parseInt(dealId),
                        fields: { UF_CRM_EMMELY_RECEIPT_URL: receiptUrl }
                      }),
                    });
                    console.log(`[PAYMENT-CREATE] Updated Bitrix24 deal ${dealId} with receipt URL`);
                  }
                } catch (bxErr) {
                  console.error(`[PAYMENT-CREATE] Bitrix24 receipt URL update error:`, bxErr);
                }
              }
            }
          } catch (rlErr) {
            console.error(`[PAYMENT-CREATE] Receipt link creation error:`, rlErr);
          }

          // Carry-over: if paid less than expected and no discount_reason, add remainder to next installment
          const carry_over_amount = body.carry_over_amount;
          if (carry_over_amount && carry_over_amount > 0.001) {
            // Find next pending installment
            const { data: currentFr } = await supabase.from("financial_records")
              .select("contract_id, bitrix24_deal_id, installment_number")
              .eq("id", frId).maybeSingle();
            if (currentFr) {
              const nextInstNum = (currentFr.installment_number || 0) + 1;
              let nextQuery = supabase.from("financial_records")
                .select("id, installment_value, metadata")
                .in("status", ["pendente", "atrasada"])
                .order("installment_number", { ascending: true })
                .limit(1);
              if (currentFr.bitrix24_deal_id) {
                nextQuery = nextQuery.eq("bitrix24_deal_id", currentFr.bitrix24_deal_id).gte("installment_number", nextInstNum);
              } else if (currentFr.contract_id) {
                nextQuery = nextQuery.eq("contract_id", currentFr.contract_id).gte("installment_number", nextInstNum);
              }
              const { data: nextInst } = await nextQuery.maybeSingle();
              if (nextInst) {
                const newValue = (nextInst.installment_value || 0) + carry_over_amount;
                await supabase.from("financial_records").update({
                  installment_value: Math.round(newValue * 100) / 100,
                }).eq("id", nextInst.id);
                const { data: nextTx } = await supabase.from("payment_transactions")
                  .select("id, metadata").eq("financial_record_id", nextInst.id).maybeSingle();
                if (nextTx) {
                  const nm = (nextTx.metadata as any) || {};
                  await supabase.from("payment_transactions").update({
                    amount: Math.round(newValue * 100) / 100,
                    metadata: { ...nm, carried_amount: carry_over_amount, carried_from: frId },
                  }).eq("id", nextTx.id);
                }
                console.log(`[PAYMENT-CREATE] Carried over ${carry_over_amount} to next installment ${nextInst.id}`);
              } else {
                console.log(`[PAYMENT-CREATE] No next installment found for carry-over`);
              }
            }
          }
        } else {
          // Try to find by bitrix24_deal_id + installment_number in metadata
          const dealId = txMeta.bitrix_deal_id || txMeta.bitrix24_deal_id;
          const installNum = txMeta.installment_number;
          if (dealId && installNum) {
            const frUpdate: any = { status: "paga", paid_at: paidAt };
            if (effectivePaymentMethod) frUpdate.payment_method = effectivePaymentMethod;
            if (proof_url || txMeta.proof_url) frUpdate.receipt_url = proof_url || txMeta.proof_url;
            const { data: matched } = await supabase.from("financial_records")
              .update(frUpdate)
              .eq("bitrix24_deal_id", dealId)
              .eq("installment_number", installNum)
              .select("id");
            if (matched?.length) {
              console.log(`[PAYMENT-CREATE] Synced financial_record by deal ${dealId} inst ${installNum}`);
            }

            // Auto-create receipt_link for deal and update Bitrix24
            try {
              const { data: existingLink } = await supabase.from("receipt_links")
                .select("id, token").eq("bitrix24_deal_id", dealId).limit(1).maybeSingle();
              let receiptToken = existingLink?.token;
              if (!existingLink) {
                const { data: newLink } = await supabase.from("receipt_links").insert({
                  bitrix24_deal_id: dealId,
                  client_name: body.client_name || txMeta.client_name || null,
                  deal_title: txMeta.deal_title || null,
                }).select("token").maybeSingle();
                receiptToken = newLink?.token;
                console.log(`[PAYMENT-CREATE] Created receipt_link for deal=${dealId}`);
              }
              if (receiptToken) {
                const receiptUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-receipt?token=${receiptToken}`;
                try {
                  const { data: integration } = await supabase.from("bitrix24_integrations")
                    .select("*").limit(1).maybeSingle();
                  if (integration?.client_endpoint && integration?.access_token) {
                    await fetch(`${integration.client_endpoint}crm.deal.update`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        auth: integration.access_token,
                        id: parseInt(dealId),
                        fields: { UF_CRM_EMMELY_RECEIPT_URL: receiptUrl }
                      }),
                    });
                    console.log(`[PAYMENT-CREATE] Updated Bitrix24 deal ${dealId} with receipt URL`);
                  }
                } catch (bxErr) {
                  console.error(`[PAYMENT-CREATE] Bitrix24 receipt URL update error:`, bxErr);
                }
              }
            } catch (rlErr) {
              console.error(`[PAYMENT-CREATE] Receipt link error:`, rlErr);
            }
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
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

    // Stripe minimum is 0.50 for most currencies; Asaas minimum is 5.00 BRL
    const minAmount = (currency === "BRL") ? 5.0 : 0.50;
    if (amount < minAmount && payment_method !== "direto" && force_gateway !== "direto") {
      return new Response(JSON.stringify({ error: `Valor mínimo para cobrança é ${currency} ${minAmount.toFixed(2)}. Valor enviado: ${currency} ${amount.toFixed(2)}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize force_gateway labels to provider codes (case-insensitive)
    let normalizedGateway = force_gateway ? force_gateway.trim() : null;
    if (normalizedGateway) {
      const gwMap: Record<string, string> = {
        "stripe pt": "stripe_pt", "stripe_pt": "stripe_pt", "stripept": "stripe_pt",
        "stripe br": "stripe_br", "stripe_br": "stripe_br", "stripebr": "stripe_br",
        "stripe": "stripe",
        "asaas": "asaas",
        "direto": "direto", "direct": "direto",
      };
      normalizedGateway = gwMap[normalizedGateway.toLowerCase()] || normalizedGateway;
    }

    // Determine gateway: force_gateway overrides auto-detection
    let gateway: "stripe" | "asaas";
    let stripeRegion: "pt" | "br" | null = null;

    if (normalizedGateway) {
      if (normalizedGateway === "stripe_pt") {
        gateway = "stripe";
        stripeRegion = "pt";
      } else if (normalizedGateway === "stripe_br") {
        gateway = "stripe";
        stripeRegion = "br";
      } else if (normalizedGateway === "asaas") {
        gateway = "asaas";
      } else if (normalizedGateway === "direto") {
        gateway = "stripe"; // won't be used, handled below
      } else if (normalizedGateway === "stripe") {
        gateway = "stripe";
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

    if (payment_method === "direto" || normalizedGateway === "direto") {
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
      if (stripeKey.startsWith("pk_")) {
        return new Response(JSON.stringify({ error: "A chave Stripe configurada é uma Publishable Key (pk_). Configure a Secret Key (sk_) em Integrações." }), {
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

    const effectiveGateway = (payment_method === "direto" || normalizedGateway === "direto") ? "direto" : (normalizedGateway || gateway);

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
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
