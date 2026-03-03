import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return integration.access_token;
  }
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh: ${data.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return data.access_token;
}

interface InstallmentPlan {
  amount: number;
  due_date: string;
  installment_number: number;
  is_down_payment: boolean;
}

function calculateInstallments(opts: {
  totalAmount: number;
  downPayment: number;
  numInstallments: number;
  firstDueDate: string;
  intervalDays: number;
}): InstallmentPlan[] {
  const { totalAmount, downPayment, numInstallments, firstDueDate, intervalDays } = opts;
  const parcels: InstallmentPlan[] = [];

  const effectiveDown = Math.min(downPayment, totalAmount);
  if (effectiveDown > 0) {
    parcels.push({
      amount: effectiveDown,
      due_date: new Date().toISOString().split("T")[0],
      installment_number: 0,
      is_down_payment: true,
    });
  }

  const remaining = totalAmount - effectiveDown;
  if (remaining <= 0 || numInstallments <= 0) return parcels;

  const instValue = Math.floor(remaining * 100 / numInstallments) / 100;
  const lastInstValue = remaining - (instValue * (numInstallments - 1));

  for (let i = 0; i < numInstallments; i++) {
    const dueDate = new Date(firstDueDate);
    dueDate.setDate(dueDate.getDate() + (intervalDays * i));
    parcels.push({
      amount: i === numInstallments - 1 ? lastInstValue : instValue,
      due_date: dueDate.toISOString().split("T")[0],
      installment_number: i + 1,
      is_down_payment: false,
    });
  }

  return parcels;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const body = await req.json();
    const dealId = body.deal_id || body.DEAL_ID || body.id || body.ID || "";
    
    // Body overrides (allow caller to force values without field mappings)
    const bodyOverrides = {
      num_installments: body.num_installments ? parseInt(body.num_installments) : undefined,
      total_amount: body.total_amount ? parseFloat(body.total_amount) : undefined,
      down_payment: body.down_payment ? parseFloat(body.down_payment) : undefined,
      first_due_date: body.first_due_date || undefined,
      interval_days: body.interval_days ? parseInt(body.interval_days) : undefined,
      force_gateway: body.force_gateway || undefined,
      currency: body.currency || undefined,
    };

    if (!dealId) {
      return new Response(JSON.stringify({ error: "deal_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[PAYMENT-WEBHOOK] Processing deal_id:", dealId);

    // Find active integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!integration?.client_endpoint) {
      return new Response(JSON.stringify({ error: "No active Bitrix24 integration found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await ensureValidToken(supabase, integration);
    const config = (integration.config as any) || {};

    // Read payment field mappings from config
    const amountField = config.deal_amount_field || "OPPORTUNITY";
    const currencyField = config.deal_currency_field || "CURRENCY_ID";
    const gatewayField = config.deal_gateway_field || "";
    const installmentsField = config.deal_installments_field || "";
    const downPaymentField = config.deal_down_payment_field || "";
    const firstDueDateField = config.deal_first_due_date_field || "";
    const intervalDaysField = config.deal_interval_days_field || "";
    const customerNameField = config.deal_customer_name_field || "";
    const customerEmailField = config.deal_customer_email_field || "";
    const customerCpfField = config.deal_customer_cpf_field || "";

    // Fetch deal from Bitrix24
    const dealResult = await callBitrix(integration.client_endpoint, accessToken, "crm.deal.get", { ID: dealId });
    const deal = dealResult.result;

    if (!deal) {
      return new Response(JSON.stringify({ error: `Deal ${dealId} not found in Bitrix24` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[PAYMENT-WEBHOOK] Deal fetched:", deal.TITLE, "| OPPORTUNITY:", deal.OPPORTUNITY);

    // Extract values from mapped fields (body overrides take priority)
    const totalAmount = bodyOverrides.total_amount || parseFloat(deal[amountField] || deal.OPPORTUNITY || "0");
    const currency = bodyOverrides.currency || deal[currencyField] || deal.CURRENCY_ID || "EUR";
    const numInstallments = bodyOverrides.num_installments || (parseInt(installmentsField ? (deal[installmentsField] || "1") : "1") || 1);
    const downPayment = bodyOverrides.down_payment ?? (parseFloat(downPaymentField ? (deal[downPaymentField] || "0") : "0") || 0);
    const intervalDays = bodyOverrides.interval_days || (parseInt(intervalDaysField ? (deal[intervalDaysField] || "30") : "30") || 30);

    // First due date
    let firstDueDate: string;
    if (bodyOverrides.first_due_date) {
      firstDueDate = bodyOverrides.first_due_date;
    } else if (firstDueDateField && deal[firstDueDateField]) {
      const parsed = new Date(deal[firstDueDateField]);
      firstDueDate = isNaN(parsed.getTime()) ? new Date(Date.now() + intervalDays * 86400000).toISOString().split("T")[0] : parsed.toISOString().split("T")[0];
    } else {
      const d = new Date();
      d.setDate(d.getDate() + intervalDays);
      firstDueDate = d.toISOString().split("T")[0];
    }

    // Gateway (body override takes priority)
    let forceGateway = bodyOverrides.force_gateway;
    if (!forceGateway) {
      const gatewayValue = gatewayField ? (deal[gatewayField] || "").toString().toLowerCase().trim() : "";
      const gatewayMap: Record<string, string> = {
        stripe_pt: "stripe_pt", stripe_br: "stripe_br", asaas: "asaas",
        direto: "direto", financiamento: "direto",
        "stripe portugal": "stripe_pt", "stripe brasil": "stripe_br",
      };
      forceGateway = gatewayMap[gatewayValue] || gatewayValue || undefined;
    }

    if (totalAmount <= 0) {
      return new Response(JSON.stringify({ error: "Deal amount is 0 or invalid" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get contact info
    const contactId = deal.CONTACT_ID;
    let customerData: any = {};

    // Try mapped customer fields from deal first
    if (customerNameField && deal[customerNameField]) customerData.name = deal[customerNameField];
    if (customerEmailField && deal[customerEmailField]) customerData.email = deal[customerEmailField];
    if (customerCpfField && deal[customerCpfField]) customerData.cpf_cnpj = deal[customerCpfField];

    // Fallback: fetch contact from Bitrix24
    if (contactId && (!customerData.name || !customerData.email)) {
      try {
        const contactResult = await callBitrix(integration.client_endpoint, accessToken, "crm.contact.get", { ID: contactId });
        const contact = contactResult.result;
        if (contact) {
          if (!customerData.name) customerData.name = `${contact.NAME || ""} ${contact.LAST_NAME || ""}`.trim() || "Cliente";
          if (!customerData.email) customerData.email = contact.EMAIL?.[0]?.VALUE || "";
          if (!customerData.phone) customerData.phone = contact.PHONE?.[0]?.VALUE || "";
          if (!customerData.cpf_cnpj) {
            // Try common CPF fields on contact
            customerData.cpf_cnpj = contact.UF_CRM_CPF || contact.UF_CRM_CNPJ || contact.UF_CRM_CPF_CNPJ || "";
          }
        }
      } catch (e) {
        console.error("[PAYMENT-WEBHOOK] Error fetching contact:", e);
      }
    }

    if (!customerData.name) customerData.name = deal.TITLE || "Cliente Bitrix24";

    console.log("[PAYMENT-WEBHOOK] Calculating installments:", { totalAmount, downPayment, numInstallments, firstDueDate, intervalDays });

    // Calculate installment plan
    const parcels = calculateInstallments({
      totalAmount,
      downPayment,
      numInstallments,
      firstDueDate,
      intervalDays,
    });

    const totalCount = parcels.length;
    const groupId = crypto.randomUUID();
    const transactions: any[] = [];
    const errors: string[] = [];

    // Create payment for each parcel
    for (const parcel of parcels) {
      const label = parcel.is_down_payment ? "Entrada" : `Parcela ${parcel.installment_number}/${numInstallments}`;
      const description = `${deal.TITLE || "Deal"} - ${label}`;

      try {
        const paymentRes = await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            amount: parcel.amount,
            currency,
            force_gateway: forceGateway || undefined,
            payment_method: forceGateway === "asaas" ? "pix" : (forceGateway === "direto" ? "direto" : "card"),
            description,
            customer_data: customerData,
            due_date: parcel.due_date,
            installment_number: parcel.installment_number,
            total_installments: totalCount,
            installment_group_id: groupId,
            is_down_payment: parcel.is_down_payment,
            metadata: {
              bitrix_deal_id: String(dealId),
              bitrix_member_id: integration.member_id,
              due_date: parcel.due_date,
              source: "bitrix24_payment_webhook",
            },
          }),
        });

        const result = await paymentRes.json();
        if (result.error) {
          errors.push(`${label}: ${result.error}`);
        } else if (result.transaction) {
          transactions.push(result.transaction);
        }
      } catch (e) {
        errors.push(`${label}: ${e.message}`);
      }
    }

    // Create Smart Invoices in Bitrix24
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const parcel = parcels[i];
      const label = parcel.is_down_payment ? "Entrada" : `Parcela ${parcel.installment_number}/${numInstallments}`;
      const invoiceTitle = `${label} - ${deal.TITLE || "Negócio"}`;

      try {
        const invoiceResult = await callBitrix(integration.client_endpoint, accessToken, "crm.item.add", {
          entityTypeId: 31,
          fields: {
            title: invoiceTitle,
            opportunity: parcel.amount,
            currencyId: currency,
            isManualOpportunity: "Y",
            parentId2: parseInt(String(dealId)),
            contactId: contactId ? parseInt(String(contactId)) : undefined,
            begindate: new Date().toISOString().split("T")[0],
            closedate: parcel.due_date,
            comments: `Fatura gerada automaticamente pelo Emmely Pay. ${label}. Grupo: ${groupId}`,
          },
        });

        const invoiceId = invoiceResult.result?.item?.id;
        if (invoiceId) {
          // Update transaction metadata with invoice ID
          await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              transaction_id: tx.id,
              metadata_update: { bitrix_invoice_id: invoiceId },
            }),
          });
          tx.bitrix_invoice_id = invoiceId;
        }
      } catch (e) {
        console.error("[PAYMENT-WEBHOOK] Smart Invoice error:", e);
      }
    }

    // Debug log
    try {
      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration.id,
        event_type: "payment_webhook_processed",
        direction: "inbound",
        payload: {
          deal_id: dealId,
          total_amount: totalAmount,
          num_installments: numInstallments,
          parcels_created: transactions.length,
          errors,
          group_id: groupId,
        },
      });
    } catch (_) { /* ignore */ }

    console.log("[PAYMENT-WEBHOOK] Done:", transactions.length, "transactions created,", errors.length, "errors");

    return new Response(JSON.stringify({
      ok: true,
      deal_id: dealId,
      deal_title: deal.TITLE,
      total_amount: totalAmount,
      currency,
      installments: numInstallments,
      down_payment: downPayment,
      transactions_created: transactions.length,
      transactions: transactions.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        status: tx.status,
        payment_url: tx.payment_url,
        due_date: tx.metadata?.due_date,
        installment_number: tx.metadata?.installment_number,
        bitrix_invoice_id: tx.bitrix_invoice_id,
      })),
      errors: errors.length > 0 ? errors : undefined,
      group_id: groupId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[PAYMENT-WEBHOOK] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
