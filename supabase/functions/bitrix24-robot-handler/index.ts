import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Helpers ---

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText);
  }
  const params = new URLSearchParams(bodyText);
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

async function callBitrix(
  clientEndpoint: string,
  accessToken: string,
  method: string,
  params: Record<string, any> = {}
): Promise<any> {
  const url = `${clientEndpoint}${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: accessToken }),
  });
  const data = await response.json();
  return data;
}

// callBitrix with auto-retry on expired token
async function callBitrixWithRefresh(
  supabase: any,
  integration: any,
  method: string,
  params: Record<string, any> = {}
): Promise<any> {
  const ep = integration.client_endpoint;
  let tk = integration.access_token;

  let result = await callBitrix(ep, tk, method, params);

  if (result?.error === "expired_token" || result?.error === "WRONG_TOKEN") {
    console.log(`[ROBOT-HANDLER] Token expired on ${method}, refreshing reactively...`);
    const refreshed = await refreshBitrixToken(supabase, integration);
    tk = refreshed.token;
    integration.access_token = tk; // update in-memory for subsequent calls
    result = await callBitrix(ep, tk, method, params);
  }

  return result;
}

async function debugLog(
  supabase: any,
  integrationId: string | null,
  eventType: string,
  direction: string,
  payload: any,
  error?: string
) {
  try {
    await supabase.from("bitrix24_debug_logs").insert({
      integration_id: integrationId,
      event_type: eventType,
      direction,
      payload,
      error: error || null,
    });
  } catch (e) {
    console.error("[DEBUG LOG] Failed:", e);
  }
}

// --- Token Refresh ---
async function refreshBitrixToken(supabase: any, integration: any): Promise<{ endpoint: string; token: string }> {
  const ep = integration.client_endpoint;
  let tk = integration.access_token;

  // Check if token is expired or about to expire (5 min buffer)
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  const now = Date.now();
  const needsRefresh = !expiresAt || (expiresAt - now) < 5 * 60 * 1000;

  if (needsRefresh && integration.refresh_token) {
    console.log("[ROBOT-HANDLER] Token expired/expiring, refreshing...");
    const clientId = Deno.env.get("BITRIX24_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("BITRIX24_CLIENT_SECRET") || "";

    try {
      const refreshUrl = `https://oauth.bitrix.info/oauth/token/?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${integration.refresh_token}`;
      const refreshRes = await fetch(refreshUrl);
      const refreshData = await refreshRes.json();

      if (refreshData.access_token) {
        tk = refreshData.access_token;
        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();
        await supabase.from("bitrix24_integrations").update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token || integration.refresh_token,
          expires_at: newExpiresAt,
        }).eq("id", integration.id);
        console.log("[ROBOT-HANDLER] Token refreshed successfully");
      } else {
        console.error("[ROBOT-HANDLER] Token refresh failed:", JSON.stringify(refreshData));
      }
    } catch (refreshErr) {
      console.error("[ROBOT-HANDLER] Token refresh error:", refreshErr);
    }
  }

  return { endpoint: ep, token: tk };
}

// --- Robot Handlers ---

async function handleSendWhatsApp(properties: Record<string, any>, supabaseUrl: string, serviceKey: string): Promise<Record<string, string>> {
  const phone = properties.phone || properties.PHONE || "";
  const message = properties.message || properties.MESSAGE || "";

  if (!phone || !message) {
    return { message_id: "", status: "error", error: "phone and message are required" };
  }

  try {
    // Find or create conversation for this phone
    const supabase = createClient(supabaseUrl, serviceKey);
    let conversationId: string;

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel", "whatsapp")
      .eq("contact_phone", phone)
      .maybeSingle();

    if (existing) {
      conversationId = existing.id;
    } else {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({ channel: "whatsapp", contact_name: phone, contact_phone: phone, status: "aberta" })
        .select("id")
        .single();
      conversationId = newConv?.id || "";
    }

    if (!conversationId) {
      return { message_id: "", status: "error", error: "Failed to find/create conversation" };
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ conversation_id: conversationId, content: message }),
    });
    const data = await res.json();
    if (data.error) {
      return { message_id: "", status: "error", error: data.error };
    }
    return {
      message_id: data.message_id || "",
      status: "sent",
      error: "",
    };
  } catch (e) {
    return { message_id: "", status: "error", error: String(e) };
  }
}

async function handleSendInstagram(properties: Record<string, any>, supabaseUrl: string, serviceKey: string): Promise<Record<string, string>> {
  const instagramUser = properties.instagram_user || properties.INSTAGRAM_USER || "";
  const message = properties.message || properties.MESSAGE || "";

  if (!instagramUser || !message) {
    return { message_id: "", status: "error", error: "instagram_user and message are required" };
  }

  try {
    // Find or create conversation for this Instagram user
    const supabase = createClient(supabaseUrl, serviceKey);
    let conversationId: string;

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel", "instagram")
      .eq("contact_instagram", instagramUser)
      .maybeSingle();

    if (existing) {
      conversationId = existing.id;
    } else {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({ channel: "instagram", contact_name: instagramUser, contact_instagram: instagramUser, status: "aberta" })
        .select("id")
        .single();
      conversationId = newConv?.id || "";
    }

    if (!conversationId) {
      return { message_id: "", status: "error", error: "Failed to find/create conversation" };
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ conversation_id: conversationId, content: message }),
    });
    const data = await res.json();
    if (data.error) {
      return { message_id: "", status: "error", error: data.error };
    }
    return {
      message_id: data.message_id || "",
      status: "sent",
      error: "",
    };
  } catch (e) {
    return { message_id: "", status: "error", error: String(e) };
  }
}

async function handleCreateCharge(
  properties: Record<string, any>,
  supabaseUrl: string,
  integration?: { client_endpoint: string; access_token: string; id: string } | null
): Promise<Record<string, string>> {
  const totalAmount = parseFloat(properties.amount || properties.AMOUNT || "0");
  const currency = properties.currency || properties.CURRENCY || "EUR";
  const gateway = properties.gateway || properties.GATEWAY || "auto";
  const paymentMethod = properties.payment_method || properties.PAYMENT_METHOD || "card";
  const customerName = properties.customer_name || properties.CUSTOMER_NAME || "";
  const customerEmail = properties.customer_email || properties.CUSTOMER_EMAIL || "";
  const customerCpf = properties.customer_cpf || properties.CUSTOMER_CPF || "";
  const description = properties.description || properties.DESCRIPTION || "Cobrança Emmely via Bitrix24";
  const numInstallments = parseInt(properties.installments || properties.INSTALLMENTS || "1") || 1;
  const downPayment = parseFloat(properties.down_payment || properties.DOWN_PAYMENT || "0");
  const firstDueDate = properties.first_due_date || properties.FIRST_DUE_DATE || "";
  const dealId = properties.deal_id || properties.DEAL_ID || "";
  const contactId = properties.contact_id || properties.CONTACT_ID || "";
  const companyId = properties.company_id || properties.COMPANY_ID || "";

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!totalAmount || totalAmount <= 0) {
    return { charge_id: "", charge_status: "error", payment_url: "", pix_code: "", gateway_used: "", invoices_created: "0", error: "amount must be > 0" };
  }

  // Lookup company credentials if company_id provided
  let companyCredentialProvider = "";
  let companyCredentialKey = "";
  let companyGateway = gateway;
  let companyName = "";

  if (companyId) {
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .maybeSingle();

      if (company) {
        companyName = company.name || "";
        // Use company's default gateway if robot sends "auto"
        if (companyGateway === "auto" && company.default_gateway && company.default_gateway !== "auto") {
          companyGateway = company.default_gateway;
        }
        // Determine credential override based on gateway
        if (companyGateway === "asaas" && company.asaas_credential_key) {
          companyCredentialProvider = company.asaas_credential_key || "";
          companyCredentialKey = "ASAAS_API_KEY";
        } else if ((companyGateway === "stripe_pt" || companyGateway === "stripe_br" || companyGateway === "stripe") && company.stripe_credential_key) {
          companyCredentialProvider = company.stripe_credential_key || "";
          companyCredentialKey = "STRIPE_SECRET_KEY";
        }
        console.log(`[ROBOT-HANDLER] Company: ${companyName}, gateway: ${companyGateway}, provider: ${companyCredentialProvider}`);
      }
    } catch (e) {
      console.error("[ROBOT-HANDLER] Company lookup error:", e);
    }
  }

  // Auto-determine gateway based on currency if still "auto"
  if (companyGateway === "auto") {
    companyGateway = currency === "BRL" ? "stripe_br" : "stripe_pt";
  }

  // Validate payment method against gateway - map incompatible methods
  let effectivePaymentMethod = paymentMethod;
  const ptOnlyMethods = ["multibanco", "mb_way", "sepa_debit"];
  const brOnlyMethods = ["pix", "boleto"];
  
  if (ptOnlyMethods.includes(paymentMethod) && companyGateway !== "stripe_pt" && companyGateway !== "stripe") {
    // PT-only method requested but not using PT gateway - fallback to card
    console.warn(`[ROBOT-HANDLER] ${paymentMethod} not supported on ${companyGateway}, using card`);
    effectivePaymentMethod = "card";
  } else if (brOnlyMethods.includes(paymentMethod) && companyGateway !== "stripe_br" && companyGateway !== "asaas") {
    // BR-only method requested but not using BR gateway - fallback to card
    console.warn(`[ROBOT-HANDLER] ${paymentMethod} not supported on ${companyGateway}, using card`);
    effectivePaymentMethod = "card";
  }

  let country = currency === "BRL" ? "Brasil" : "Portugal";
  if (companyGateway === "stripe" || companyGateway === "stripe_pt") country = "Portugal";
  else if (companyGateway === "asaas" || companyGateway === "stripe_br") country = "Brasil";

  try {
    // Calculate installment plan
    const hasDown = downPayment > 0;
    const remaining = totalAmount - downPayment;
    const instValue = numInstallments > 0 ? Math.floor(remaining * 100 / numInstallments) / 100 : 0;
    const lastInstValue = remaining - (instValue * (numInstallments - 1));
    const totalCount = (hasDown ? 1 : 0) + numInstallments;

    // Build parcels array
    const parcels: { amount: number; due_date: string; number: number; is_down: boolean }[] = [];
    const today = new Date().toISOString().split("T")[0];
    const baseDueDate = firstDueDate || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split("T")[0];
    })();

    if (hasDown) {
      parcels.push({ amount: downPayment, due_date: today, number: 0, is_down: true });
    }
    for (let i = 0; i < numInstallments; i++) {
      const d = new Date(baseDueDate);
      d.setDate(d.getDate() + (30 * i));
      const val = i === numInstallments - 1 ? lastInstValue : instValue;
      parcels.push({ amount: val, due_date: d.toISOString().split("T")[0], number: i + 1, is_down: false });
    }

    const groupId = crypto.randomUUID();
    let firstChargeId = "";
    let firstGateway = "";
    let invoicesCreated = 0;

    for (const parcel of parcels) {
      const label = parcel.is_down ? "Entrada" : `Parcela ${parcel.number}/${numInstallments}`;

      // 1. Create payment transaction
      const paymentBody: Record<string, any> = {
        amount: parcel.amount,
        currency,
        payment_method: effectivePaymentMethod,
        customer_data: {
          name: customerName,
          email: customerEmail,
          cpf_cnpj: customerCpf || undefined,
          country,
        },
        description: `${description} (${label})`,
        due_date: parcel.due_date,
        installment_number: parcel.number,
        total_installments: totalCount,
        installment_group_id: groupId,
        is_down_payment: parcel.is_down,
        force_gateway: companyGateway,
        company_id: companyId || undefined,
        metadata: {
          bitrix_deal_id: dealId,
          bitrix_contact_id: contactId,
          source: "bitrix24_robot",
          company_name: companyName || undefined,
          requested_payment_method: paymentMethod,
        },
      };
      // Add credential overrides if company has them
      if (companyCredentialProvider && companyCredentialKey) {
        paymentBody.credential_provider = companyCredentialProvider;
        paymentBody.credential_key = companyCredentialKey;
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentBody),
      });
      const data = await res.json();
      const tx = data.transaction || {};

      if (!firstChargeId && tx.id) firstChargeId = tx.id;
      if (!firstGateway && tx.gateway) firstGateway = tx.gateway;

      // 2. Create Invoice (old API) in Bitrix24
      if (integration?.client_endpoint && integration?.access_token && dealId) {
        try {
          const invoiceResult = await callBitrix(
            integration.client_endpoint,
            integration.access_token,
            "crm.invoice.add",
            {
              fields: {
                ORDER_TOPIC: `${label} - ${description}`,
                STATUS_ID: "N",
                DATE_BILL: today,
                DATE_PAY_BEFORE: parcel.due_date,
                UF_DEAL_ID: parseInt(dealId) || 0,
                UF_CONTACT_ID: parseInt(contactId) || 0,
                RESPONSIBLE_ID: 1,
                PERSON_TYPE_ID: 1,
                PRODUCT_ROWS: [{
                  PRODUCT_NAME: label,
                  QUANTITY: 1,
                  PRICE: parcel.amount,
                }],
              },
            }
          );
          const invoiceId = invoiceResult.result;
          if (invoiceId) {
            invoicesCreated++;
            console.log(`[ROBOT-HANDLER] Invoice created: ${invoiceId} for ${label}`);
            // Update transaction metadata with old invoice ID
            if (tx.id) {
              await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  transaction_id: tx.id,
                  metadata_update: { bitrix_old_invoice_id: invoiceId },
                }),
              });
            }
          } else {
            console.error("[ROBOT-HANDLER] Invoice creation failed:", JSON.stringify(invoiceResult));
          }
        } catch (invErr) {
          console.error("[ROBOT-HANDLER] Invoice error:", invErr);
        }
      }
    }

    return {
      charge_id: firstChargeId,
      charge_status: "pending",
      payment_url: "",
      pix_code: "",
      gateway_used: firstGateway,
      invoices_created: String(invoicesCreated),
      error: "",
    };
  } catch (e) {
    return { charge_id: "", charge_status: "error", payment_url: "", pix_code: "", gateway_used: "", invoices_created: "0", error: String(e) };
  }
}

async function handleCheckPayment(properties: Record<string, any>, supabaseUrl: string): Promise<Record<string, string>> {
  const chargeId = properties.charge_id || properties.CHARGE_ID || "";

  if (!chargeId) {
    return { status: "error", paid_at: "", paid_value: "", error: "charge_id is required" };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/payment-status?id=${chargeId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.error) {
      return { status: "error", paid_at: "", paid_value: "", error: data.error };
    }
    return {
      status: data.status || "unknown",
      paid_at: data.paid_at || "",
      paid_value: String(data.amount || data.paid_value || ""),
      error: "",
    };
  } catch (e) {
    return { status: "error", paid_at: "", paid_value: "", error: String(e) };
  }
}

async function handleGenerateProposal(
  properties: Record<string, any>,
  memberId: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<Record<string, string>> {
  const dealId = properties.deal_id || properties.DEAL_ID || "";
  const leadId = properties.lead_id || properties.LEAD_ID || "";
  const entityType = (properties.entity_type || properties.ENTITY_TYPE || "deal").toLowerCase();
  const manualTitle = properties.title || properties.TITLE || "";
  const serviceName = properties.service_name || properties.SERVICE_NAME || "";
  const templateName = properties.template_name || properties.TEMPLATE_NAME || "";
  const productIdsRaw = properties.product_ids || properties.PRODUCT_IDS || "";
  const sendMethod = (properties.send_method || properties.SEND_METHOD || "none").toLowerCase();
  const sendToPhone = properties.send_to_phone || properties.SEND_TO_PHONE || "";
  let paymentType = properties.payment_type || properties.PAYMENT_TYPE || "";
  let installments = parseInt(properties.installments || properties.INSTALLMENTS || "0") || 0;
  const manualValue = parseFloat(properties.value || properties.VALUE || "0");
  const manualDescription = properties.description || properties.DESCRIPTION || "";
  let conditions = properties.conditions || properties.CONDITIONS || "";
  const validDays = parseInt(properties.valid_days || properties.VALID_DAYS || "30") || 30;

  const acceptStageId = properties.accept_stage_id || properties.ACCEPT_STAGE_ID || "";
  const acceptFlowId = properties.accept_flow_id || properties.ACCEPT_FLOW_ID || "";

  const entityId = entityType === "lead" ? leadId : dealId;
  if (!entityId) {
    return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", template_used: "", products_used: "", send_status: "", error: "deal_id or lead_id is required" };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Get Bitrix24 integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .eq("member_id", memberId)
      .maybeSingle();

    if (!integration?.client_endpoint || !integration?.access_token) {
      return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", template_used: "", products_used: "", send_status: "", error: "Bitrix24 integration not found" };
    }

    const { endpoint: ep, token: tk } = await refreshBitrixToken(supabase, integration);

    // 2. Fetch entity data from Bitrix24
    const method = entityType === "lead" ? "crm.lead.get" : "crm.deal.get";
    const entityResult = await callBitrix(ep, tk, method, { ID: entityId });
    const entity = entityResult.result;

    if (!entity) {
      return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", template_used: "", products_used: "", send_status: "", error: `Entity ${entityType} ${entityId} not found in Bitrix24` };
    }

    const entityTitle = entity.TITLE || "";
    const opportunity = parseFloat(entity.OPPORTUNITY || "0");
    const currencyId = entity.CURRENCY_ID || "EUR";

    // Currency symbol map
    const currencySymbols: Record<string, string> = { EUR: "€", BRL: "R$", USD: "$", GBP: "£", CHF: "CHF", CAD: "C$" };
    const currSymbol = currencySymbols[currencyId] || currencyId;

    // 3. Fetch contact data
    let clientName = "";
    let clientEmail = "";
    let clientPhone = "";
    let clientDocument = "";
    let clientAddress = "";

    const contactId = entity.CONTACT_ID || entity.CONTACT_IDS?.[0];
    if (contactId) {
      const contactResult = await callBitrix(ep, tk, "crm.contact.get", { ID: contactId });
      const contact = contactResult.result;
      if (contact) {
        clientName = `${contact.NAME || ""} ${contact.LAST_NAME || ""}`.trim();
        if (contact.EMAIL && Array.isArray(contact.EMAIL) && contact.EMAIL.length > 0) {
          clientEmail = contact.EMAIL[0].VALUE || "";
        }
        if (contact.PHONE && Array.isArray(contact.PHONE) && contact.PHONE.length > 0) {
          clientPhone = contact.PHONE[0].VALUE || "";
        }
        if (contact.ADDRESS) clientAddress = contact.ADDRESS;
      }
    }

    // 4. Fetch template if template_name provided
    let templateUsed = "";
    let templateTitle = "";
    let templateDescription = "";
    let templateConditions = "";
    let templatePaymentType = "";
    let templateInstallments = 0;
    let templateValue = 0;
    let templateServiceId: string | null = null;
    let templateId: string | null = null;

    if (templateName) {
      // Try by ID first (new select-based flow), then fallback to name search (legacy)
      let tmpl: any = null;
      const { data: tmplById } = await supabase
        .from("proposal_templates")
        .select("*")
        .eq("id", templateName)
        .eq("template_type", "proposta")
        .maybeSingle();

      if (tmplById) {
        tmpl = tmplById;
      } else {
        const { data: tmplByName } = await supabase
          .from("proposal_templates")
          .select("*")
          .eq("template_type", "proposta")
          .ilike("name", `%${templateName}%`)
          .maybeSingle();
        tmpl = tmplByName;
      }

      if (tmpl) {
        templateId = tmpl.id;
        templateUsed = tmpl.name;
        templateTitle = tmpl.title || "";
        templateDescription = tmpl.description || "";
        templateConditions = tmpl.conditions || "";
        templatePaymentType = tmpl.payment_type || "";
        templateInstallments = tmpl.installments || 1;
        templateValue = tmpl.value || 0;
        templateServiceId = tmpl.service_id || null;
        console.log(`[ROBOT-HANDLER] Template found: ${tmpl.name} (value: ${tmpl.value})`);
      } else {
        console.warn(`[ROBOT-HANDLER] Template not found: ${templateName}`);
      }
    }

    // 5. Fetch products — from manual IDs or auto-load from Bitrix24 deal
    let productsUsed = "";
    let productsValue = 0;
    let productsDescription = "";

    let productsJson: Array<{name: string, quantity: number, price: number, total: number, description: string}> = [];

    if (productIdsRaw) {
      const productIds = productIdsRaw.split(",").map((id: string) => id.trim()).filter(Boolean);
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("services")
          .select("*")
          .in("id", productIds);

        if (products && products.length > 0) {
          productsUsed = products.map((p: any) => p.name).join(", ");
          productsValue = products.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
          productsDescription = products
            .map((p: any) => `• ${p.name}: ${currSymbol} ${(p.value || 0).toFixed(2)}${p.budget_details ? ` — ${p.budget_details}` : ""}`)
            .join("\n");
          productsJson = products.map((p: any) => ({ name: p.name, quantity: 1, price: p.value || 0, total: p.value || 0, description: p.budget_details || "" }));
          console.log(`[ROBOT-HANDLER] Products found: ${productsUsed} (total: ${productsValue})`);
        }
      }
    } else if (entityType === "deal" && entityId) {
      // Auto-load products from Bitrix24 deal
      try {
        const productRows = await callBitrix(ep, tk, "crm.deal.productrows.list", { id: entityId });
        const rows = productRows.result || [];
        if (rows.length > 0) {
          // Enrich with product descriptions from catalog
          for (const row of rows) {
            const qty = parseFloat(row.QUANTITY || "1");
            const price = parseFloat(row.PRICE || "0");
            const total = price * qty;
            let prodDesc = "";
            let prodName = row.PRODUCT_NAME || `Produto #${row.PRODUCT_ID}`;
            if (row.PRODUCT_ID) {
              try {
                const prodResult = await callBitrix(ep, tk, "crm.product.get", { id: row.PRODUCT_ID });
                if (prodResult.result) {
                  prodName = prodResult.result.NAME || prodName;
                  prodDesc = prodResult.result.DESCRIPTION || "";
                }
              } catch (_) { /* use fallback name */ }
            }
            productsJson.push({ name: prodName, quantity: qty, price, total, description: prodDesc });
          }
          productsUsed = productsJson.map(p => p.name).join(", ");
          productsValue = productsJson.reduce((sum, p) => sum + p.total, 0);
          productsDescription = productsJson
            .map(p => `• ${p.name}: ${p.quantity > 1 ? `${p.quantity}x ` : ""}${currSymbol} ${p.total.toFixed(2)}`)
            .join("\n");
          console.log(`[ROBOT-HANDLER] Bitrix24 deal products loaded: ${productsUsed} (total: ${productsValue})`);
        }
      } catch (prodErr) {
        console.error("[ROBOT-HANDLER] Failed to load deal products:", prodErr);
      }
    }

    // 6. Legacy: Fetch service if service_name provided (backwards compatible)
    let serviceId: string | null = templateServiceId;
    let serviceValue = 0;
    let serviceDescription = "";

    if (serviceName) {
      const { data: svc } = await supabase
        .from("services")
        .select("*")
        .ilike("name", `%${serviceName}%`)
        .maybeSingle();

      if (svc) {
        serviceId = svc.id;
        serviceValue = svc.value || 0;
        serviceDescription = svc.budget_details || "";
      }
    }

    // 7. Determine final values — manual > products > template > service > entity
    const finalValue = manualValue > 0
      ? manualValue
      : productsValue > 0
        ? productsValue
        : templateValue > 0
          ? templateValue
          : serviceValue > 0
            ? serviceValue
            : opportunity;

    // Build a meaningful title: prefer manual, then service/product names, then entity title
    const baseTitle = manualTitle || templateTitle || productsUsed || serviceName || entityTitle || "Proposta";
    const finalTitle = clientName ? `${baseTitle} — ${clientName}` : baseTitle;

    const finalDescription = manualDescription
      || (productsDescription ? productsDescription : "")
      || templateDescription
      || serviceDescription
      || "";

    if (!conditions && templateConditions) conditions = templateConditions;
    if (!paymentType && templatePaymentType) paymentType = templatePaymentType;
    if (!paymentType) paymentType = "fixo";
    if (!installments && templateInstallments > 0) installments = templateInstallments;
    if (!installments) installments = 1;

    // 8. Find existing case or create one — avoid ghost cases
    let caseId: string;

    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("bitrix24_id", String(entityId))
      .maybeSingle();

    if (existingLead) {
      const { data: existingCase } = await supabase
        .from("cases")
        .select("id")
        .eq("lead_id", existingLead.id)
        .maybeSingle();

      if (existingCase) {
        caseId = existingCase.id;
      } else {
        const { data: newCase } = await supabase
          .from("cases")
          .insert({
            title: finalTitle,
            description: `Caso criado via Bitrix24 (${entityType} #${entityId})`,
            legal_area: "outro",
            status: "aberto",
            lead_id: existingLead.id,
          })
          .select("id")
          .single();
        if (!newCase) return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", template_used: templateUsed, products_used: productsUsed, send_status: "", error: "Failed to create case" };
        caseId = newCase.id;
      }
    } else {
      const { data: newCase } = await supabase
        .from("cases")
        .insert({
          title: finalTitle,
          description: `Caso criado via Bitrix24 (${entityType} #${entityId})`,
          legal_area: "outro",
          status: "aberto",
        })
        .select("id")
        .single();
      if (!newCase) return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", template_used: templateUsed, products_used: productsUsed, send_status: "", error: "Failed to create case" };
      caseId = newCase.id;
    }

    // 9. Insert proposal
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: proposal, error: proposalErr } = await supabase
      .from("proposals")
      .insert({
        title: finalTitle,
        case_id: caseId,
        value: finalValue,
        payment_type: paymentType,
        installments,
        description: finalDescription,
        conditions,
        valid_until: validUntil,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
        client_document: clientDocument,
        client_address: clientAddress,
        service_id: serviceId,
        template_id: templateId,
        status: "enviada",
        products_json: productsJson,
        currency: currencyId,
        bitrix24_deal_id: entityType === "deal" ? String(entityId) : null,
        accept_stage_id: acceptStageId || null,
      } as any)
      .select("id, accept_token")
      .single();

    if (proposalErr || !proposal) {
      return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", template_used: templateUsed, products_used: productsUsed, send_status: "", error: proposalErr?.message || "Failed to create proposal" };
    }

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";
    const proposalUrl = `${frontendUrl}/proposta/${proposal.accept_token}`;

    // 10. Generate PDF
    let pdfUrl = "";
    try {
      const pdfRes = await fetch(`${supabaseUrl}/functions/v1/proposal-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ proposal_id: proposal.id }),
      });
      const pdfData = await pdfRes.json();
      pdfUrl = pdfData.pdf_url || pdfData.url || "";
    } catch (pdfErr) {
      console.error("[ROBOT-HANDLER] PDF generation error:", pdfErr);
    }

    // 11. Send via WhatsApp if requested
    let sendStatus = "";
    const targetPhone = sendToPhone || clientPhone;

    if (sendMethod !== "none" && targetPhone) {
      try {
        if (sendMethod === "link" || sendMethod === "both") {
          const linkMsg = `📋 *Proposta: ${finalTitle}*\n\nValor: ${currSymbol} ${finalValue.toFixed(2)}\nValidade: ${validDays} dias\n\n✅ Aceite a proposta aqui:\n${proposalUrl}`;
          await handleSendWhatsApp({ phone: targetPhone, message: linkMsg }, supabaseUrl, serviceKey);
          sendStatus = "link_sent";
        }

        if ((sendMethod === "pdf" || sendMethod === "both") && pdfUrl) {
          const pdfMsg = `📄 Segue o PDF da proposta *${finalTitle}*:\n${pdfUrl}`;
          await handleSendWhatsApp({ phone: targetPhone, message: pdfMsg }, supabaseUrl, serviceKey);
          sendStatus = sendMethod === "both" ? "link_and_pdf_sent" : "pdf_sent";
        }

        if (sendMethod === "pdf" && !pdfUrl) {
          sendStatus = "pdf_not_available";
        }
      } catch (sendErr) {
        console.error("[ROBOT-HANDLER] Send error:", sendErr);
        sendStatus = "send_error";
      }
    } else if (sendMethod !== "none" && !targetPhone) {
      sendStatus = "no_phone";
    }

    // 12. Save proposal URLs back to Bitrix24 deal
    if (entityType === "deal" && entityId) {
      try {
        await callBitrix(ep, tk, "crm.deal.update", {
          ID: entityId,
          fields: {
            UF_CRM_EMMELY_PROPOSAL_URL: proposalUrl,
            UF_CRM_EMMELY_PROPOSAL_PDF: pdfUrl || "",
          },
        });
        console.log(`[ROBOT-HANDLER] Saved proposal URLs to deal ${entityId}`);
      } catch (saveErr) {
        console.error("[ROBOT-HANDLER] Failed to save proposal URLs to deal:", saveErr);
      }
    }

    return {
      proposal_url: proposalUrl,
      pdf_url: pdfUrl,
      proposal_id: proposal.id,
      template_used: templateUsed,
      products_used: productsUsed,
      send_status: sendStatus,
      status: "created",
      error: "",
    };
  } catch (e) {
    return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", template_used: "", products_used: "", send_status: "", error: String(e) };
  }
}

// --- Generate Contract Handler ---
async function handleGenerateContract(
  properties: Record<string, any>,
  memberId: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<Record<string, string>> {
  const proposalId = properties.proposal_id || properties.PROPOSAL_ID || "";
  const dealId = properties.deal_id || properties.DEAL_ID || "";
  const entityType = (properties.entity_type || properties.ENTITY_TYPE || "deal").toLowerCase();
  const templateName = properties.template_name || properties.TEMPLATE_NAME || "";
  const startsAtRaw = properties.starts_at || properties.STARTS_AT || "";
  const durationMonths = parseInt(properties.duration_months || properties.DURATION_MONTHS || "12") || 12;
  const sendMethod = (properties.send_method || properties.SEND_METHOD || "none").toLowerCase();
  const sendToPhone = properties.send_to_phone || properties.SEND_TO_PHONE || "";

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Get Bitrix24 integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .eq("member_id", memberId)
      .maybeSingle();

    if (!integration?.client_endpoint || !integration?.access_token) {
      return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: "Bitrix24 integration not found" };
    }

    const { endpoint: ep, token: tk } = await refreshBitrixToken(supabase, integration);

    let proposal: any = null;
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";

    if (proposalId) {
      // 2a. Load existing proposal
      const { data: prop, error: propErr } = await supabase
        .from("proposals")
        .select("*")
        .eq("id", proposalId)
        .single();

      if (propErr || !prop) {
        return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: "Proposal not found: " + proposalId };
      }
      proposal = prop;

      // If proposal not yet set as contract, set contract_status to pendente
      if (!proposal.contract_status || proposal.contract_status === "rascunho") {
        const signToken = proposal.sign_token || crypto.randomUUID();
        const startsAt = startsAtRaw || new Date().toISOString().split("T")[0];
        const expiresAt = new Date(new Date(startsAt).getTime() + durationMonths * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        // Apply contract template if provided
        if (templateName) {
          let tmpl: any = null;
          const { data: tmplById } = await supabase.from("proposal_templates").select("*").eq("id", templateName).eq("template_type", "contrato").maybeSingle();
          tmpl = tmplById;
          if (!tmpl) {
            const { data: tmplByName } = await supabase.from("proposal_templates").select("*").eq("template_type", "contrato").ilike("name", `%${templateName}%`).maybeSingle();
            tmpl = tmplByName;
          }
          if (tmpl) {
            // Update proposal with contract template data
            await supabase.from("proposals").update({
              template_id: tmpl.id,
              conditions: tmpl.conditions || proposal.conditions,
              description: tmpl.description || proposal.description,
            }).eq("id", proposal.id);
          }
        }

        const { error: upErr } = await supabase
          .from("proposals")
          .update({
            contract_status: "pendente",
            sign_token: signToken,
            starts_at: startsAt,
            expires_at: expiresAt,
            status: "aceite",
          })
          .eq("id", proposal.id);

        if (upErr) {
          return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: "Failed to update proposal: " + upErr.message };
        }

        proposal.sign_token = signToken;
      }
    } else {
      // 2b. Create new contract from template + deal data
      const entityId = dealId;
      if (!entityId) {
        return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: "proposal_id or deal_id is required" };
      }

      const method = entityType === "lead" ? "crm.lead.get" : "crm.deal.get";
      const entityResult = await callBitrix(ep, tk, method, { ID: entityId });
      const entity = entityResult.result;
      if (!entity) {
        return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: `Entity ${entityId} not found` };
      }

      let clientName = "", clientEmail = "", clientPhone = "";
      const contactId = entity.CONTACT_ID || entity.CONTACT_IDS?.[0];
      if (contactId) {
        const contactResult = await callBitrix(ep, tk, "crm.contact.get", { ID: contactId });
        const contact = contactResult.result;
        if (contact) {
          clientName = `${contact.NAME || ""} ${contact.LAST_NAME || ""}`.trim();
          if (contact.EMAIL?.length > 0) clientEmail = contact.EMAIL[0].VALUE || "";
          if (contact.PHONE?.length > 0) clientPhone = contact.PHONE[0].VALUE || "";
        }
      }

      let tmpl: any = null;
      if (templateName) {
        const { data: tmplById } = await supabase.from("proposal_templates").select("*").eq("id", templateName).eq("template_type", "contrato").maybeSingle();
        tmpl = tmplById;
        if (!tmpl) {
          const { data: tmplByName } = await supabase.from("proposal_templates").select("*").eq("template_type", "contrato").ilike("name", `%${templateName}%`).maybeSingle();
          tmpl = tmplByName;
        }
      }

      const finalTitle = tmpl?.title || entity.TITLE || "Contrato";
      const finalValue = parseFloat(entity.OPPORTUNITY || "0") || tmpl?.value || 0;
      const startsAt = startsAtRaw || new Date().toISOString().split("T")[0];
      const expiresAt = new Date(new Date(startsAt).getTime() + durationMonths * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Find or create case
      let caseId = "";
      const { data: existingLead } = await supabase.from("leads").select("id").eq("bitrix24_id", String(entityId)).maybeSingle();
      if (existingLead) {
        const { data: existingCase } = await supabase.from("cases").select("id").eq("lead_id", existingLead.id).maybeSingle();
        if (existingCase) {
          caseId = existingCase.id;
        } else {
          const { data: newCase } = await supabase.from("cases").insert({ title: finalTitle, description: `Contrato via Bitrix24 (${entityType} #${entityId})`, legal_area: "outro", status: "aberto", lead_id: existingLead.id }).select("id").single();
          caseId = newCase?.id || "";
        }
      } else {
        const { data: newCase } = await supabase.from("cases").insert({ title: finalTitle, description: `Contrato via Bitrix24 (${entityType} #${entityId})`, legal_area: "outro", status: "aberto" }).select("id").single();
        caseId = newCase?.id || "";
      }

      if (!caseId) {
        return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: "Failed to create case" };
      }

      const signToken = crypto.randomUUID();
      const { data: newProposal, error: insertErr } = await supabase
        .from("proposals")
        .insert({
          title: clientName ? `${finalTitle} — ${clientName}` : finalTitle,
          case_id: caseId,
          value: finalValue,
          payment_type: tmpl?.payment_type || "fixo",
          installments: tmpl?.installments || 1,
          description: tmpl?.description || "",
          conditions: tmpl?.conditions || "",
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          template_id: tmpl?.id || null,
          service_id: tmpl?.service_id || null,
          status: "aceite",
          contract_status: "pendente",
          sign_token: signToken,
          starts_at: startsAt,
          expires_at: expiresAt,
        })
        .select("*")
        .single();

      if (insertErr || !newProposal) {
        return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: "Failed to create contract: " + (insertErr?.message || "") };
      }
      proposal = newProposal;
    }

    // 3. Build URLs
    const contractUrl = `${frontendUrl}/sign/${proposal.sign_token}`;

    // 4. Generate PDF
    let contractPdf = "";
    try {
      const pdfRes = await fetch(`${supabaseUrl}/functions/v1/proposal-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ proposal_id: proposal.id }),
      });
      const pdfData = await pdfRes.json();
      contractPdf = pdfData.pdf_url || pdfData.url || "";
    } catch (pdfErr) {
      console.error("[ROBOT-HANDLER] Contract PDF generation error:", pdfErr);
    }

    // 5. Save URLs to Bitrix24 deal
    if (dealId) {
      try {
        await callBitrix(ep, tk, "crm.deal.update", {
          ID: dealId,
          fields: {
            UF_CRM_EMMELY_CONTRACT_URL: contractUrl,
            UF_CRM_EMMELY_CONTRACT_PDF: contractPdf || "",
          },
        });
        console.log(`[ROBOT-HANDLER] Saved contract URLs to deal ${dealId}`);
      } catch (saveErr) {
        console.error("[ROBOT-HANDLER] Failed to save contract URLs:", saveErr);
      }
    }

    // 6. Send via WhatsApp if requested
    let sendStatus = "";
    const targetPhone = sendToPhone || proposal.client_phone || "";

    if (sendMethod !== "none" && targetPhone) {
      try {
        if (sendMethod === "link" || sendMethod === "both") {
          const linkMsg = `📝 *Contrato: ${proposal.title}*\n\n✍️ Assine digitalmente aqui:\n${contractUrl}`;
          await handleSendWhatsApp({ phone: targetPhone, message: linkMsg }, supabaseUrl, serviceKey);
          sendStatus = "link_sent";
        }
        if ((sendMethod === "pdf" || sendMethod === "both") && contractPdf) {
          const pdfMsg = `📄 Segue o PDF do contrato *${proposal.title}*:\n${contractPdf}`;
          await handleSendWhatsApp({ phone: targetPhone, message: pdfMsg }, supabaseUrl, serviceKey);
          sendStatus = sendMethod === "both" ? "link_and_pdf_sent" : "pdf_sent";
        }
      } catch (sendErr) {
        console.error("[ROBOT-HANDLER] Contract send error:", sendErr);
        sendStatus = "send_error";
      }
    } else if (sendMethod !== "none" && !targetPhone) {
      sendStatus = "no_phone";
    }

    return {
      contract_url: contractUrl,
      contract_pdf: contractPdf,
      contract_id: proposal.id,
      status: "created",
      send_status: sendStatus,
      error: "",
    };
  } catch (e) {
    return { contract_url: "", contract_pdf: "", contract_id: "", status: "error", send_status: "", error: String(e) };
  }
}

async function handleSendProposal(
  properties: Record<string, any>,
  supabaseUrl: string,
  serviceKey: string
): Promise<Record<string, string>> {
  const proposalId = properties.proposal_id || properties.PROPOSAL_ID || "";
  const sendMethod = (properties.send_method || properties.SEND_METHOD || "link").toLowerCase();
  const phoneOverride = properties.phone || properties.PHONE || "";
  const customMessage = properties.custom_message || properties.CUSTOM_MESSAGE || "";

  if (!proposalId) {
    return { send_status: "error", proposal_url: "", pdf_url: "", error: "proposal_id is required" };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch proposal
    const { data: proposal, error: propErr } = await supabase
      .from("proposals")
      .select("id, accept_token, title, value, client_name, client_phone, pdf_url, valid_until")
      .eq("id", proposalId)
      .single();

    if (propErr || !proposal) {
      return { send_status: "error", proposal_url: "", pdf_url: "", error: "Proposal not found" };
    }

    const targetPhone = phoneOverride || proposal.client_phone || "";
    if (!targetPhone) {
      return { send_status: "no_phone", proposal_url: "", pdf_url: "", error: "No phone number available" };
    }

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";
    const proposalUrl = `${frontendUrl}/proposta/${proposal.accept_token}`;

    // Generate PDF if not yet available
    let pdfUrl = proposal.pdf_url || "";
    if ((sendMethod === "pdf" || sendMethod === "both") && !pdfUrl) {
      try {
        const pdfRes = await fetch(`${supabaseUrl}/functions/v1/proposal-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ proposal_id: proposal.id }),
        });
        const pdfData = await pdfRes.json();
        pdfUrl = pdfData.pdf_url || pdfData.url || "";
      } catch (pdfErr) {
        console.error("[ROBOT-HANDLER] PDF generation error:", pdfErr);
      }
    }

    const title = proposal.title || "Proposta";
    const value = Number(proposal.value || 0).toFixed(2);
    const prefix = customMessage ? `${customMessage}\n\n` : "";
    let sendStatus = "";

    if (sendMethod === "link" || sendMethod === "both") {
      const linkMsg = `${prefix}📋 *Proposta: ${title}*\n\nValor: € ${value}\n\n✅ Aceite a proposta aqui:\n${proposalUrl}`;
      await handleSendWhatsApp({ phone: targetPhone, message: linkMsg }, supabaseUrl, serviceKey);
      sendStatus = "link_sent";
    }

    if ((sendMethod === "pdf" || sendMethod === "both") && pdfUrl) {
      const pdfMsg = `${prefix}📄 Segue o PDF da proposta *${title}*:\n${pdfUrl}`;
      await handleSendWhatsApp({ phone: targetPhone, message: pdfMsg }, supabaseUrl, serviceKey);
      sendStatus = sendMethod === "both" ? "link_and_pdf_sent" : "pdf_sent";
    }

    if (sendMethod === "pdf" && !pdfUrl) {
      sendStatus = "pdf_not_available";
    }

    return {
      send_status: sendStatus,
      proposal_url: proposalUrl,
      pdf_url: pdfUrl,
      error: "",
    };
  } catch (e) {
    return { send_status: "error", proposal_url: "", pdf_url: "", error: String(e) };
  }
}

async function handleExecuteFlow(properties: Record<string, any>, supabaseUrl: string, serviceKey: string): Promise<Record<string, string>> {
  const flowId = properties.flow_id || properties.FLOW_ID || "";
  const phone = properties.phone || properties.PHONE || "";
  const triggerMessage = properties.trigger_message || properties.TRIGGER_MESSAGE || "iniciar";

  if (!flowId) {
    return { status: "error", error: "flow_id is required" };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify flow exists and is active
    const { data: flow, error: flowErr } = await supabase
      .from("flows")
      .select("id, name, is_active")
      .eq("id", flowId)
      .single();

    if (flowErr || !flow) {
      return { status: "error", error: "Flow not found" };
    }
    if (!flow.is_active) {
      return { status: "error", error: "Flow is not active" };
    }

    // Find or create conversation
    let conversationId: string;
    if (phone) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel", "whatsapp")
        .eq("contact_phone", phone)
        .maybeSingle();

      if (existing) {
        conversationId = existing.id;
      } else {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            channel: "whatsapp",
            // Use phone as contact_name placeholder; will be updated when customer replies
            contact_name: phone,
            contact_phone: phone,
            status: "aberta",
          })
          .select("id")
          .single();
        conversationId = newConv?.id || "";
      }
    } else {
      return { status: "error", error: "phone is required to identify conversation" };
    }

    if (!conversationId) {
      return { status: "error", error: "Could not find or create conversation" };
    }

    // Trigger the flow-engine
    const res = await fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ conversation_id: conversationId, message_text: triggerMessage }),
    });

    const result = await res.json();
    return {
      status: result.error ? "error" : "triggered",
      conversation_id: conversationId,
      flow_name: flow.name,
      error: result.error || "",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// --- Currency Conversion Handler ---

async function handleConvertCurrency(properties: Record<string, any>): Promise<Record<string, string>> {
  const sourceValue = parseFloat(properties.source_value || properties.SOURCE_VALUE || "0");
  const sourceCurrency = (properties.source_currency || properties.SOURCE_CURRENCY || "EUR").toUpperCase();
  const targetCurrency = (properties.target_currency || properties.TARGET_CURRENCY || "BRL").toUpperCase();
  const spreadPercent = parseFloat(properties.spread_percent || properties.SPREAD_PERCENT || "0");

  if (!sourceValue || sourceValue <= 0) {
    return { converted_value: "0", exchange_rate: "0", rate_date: "", error: "Valor inválido" };
  }

  if (sourceCurrency === targetCurrency) {
    return {
      converted_value: String(sourceValue),
      exchange_rate: "1",
      rate_date: new Date().toISOString().split("T")[0],
      error: "",
    };
  }

  // Fallback rates (updated periodically)
  const fallbackRates: Record<string, number> = {
    // EUR pairs
    "EUR_BRL": 6.10, "BRL_EUR": 0.164,
    "EUR_USD": 1.08, "USD_EUR": 0.926,
    "EUR_GBP": 0.84, "GBP_EUR": 1.19,
    "EUR_CHF": 0.94, "CHF_EUR": 1.06,
    "EUR_CAD": 1.50, "CAD_EUR": 0.67,
    // USD pairs
    "USD_BRL": 5.50, "BRL_USD": 0.182,
    "USD_GBP": 0.78, "GBP_USD": 1.28,
    "USD_CHF": 0.87, "CHF_USD": 1.15,
    "USD_CAD": 1.39, "CAD_USD": 0.72,
    // GBP pairs
    "GBP_BRL": 7.10, "BRL_GBP": 0.141,
    "GBP_CHF": 1.12, "CHF_GBP": 0.89,
    "GBP_CAD": 1.78, "CAD_GBP": 0.56,
    // CHF pairs
    "CHF_BRL": 6.30, "BRL_CHF": 0.159,
    "CHF_CAD": 1.59, "CAD_CHF": 0.63,
    // CAD pairs
    "CAD_BRL": 3.96, "BRL_CAD": 0.253,
  };

  try {
    // Try exchangerate.host API (free, no key required)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const apiUrl = `https://api.exchangerate.host/latest?base=${sourceCurrency}&symbols=${targetCurrency}`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await res.json();

    if (data.success && data.rates?.[targetCurrency]) {
      const rate = data.rates[targetCurrency];
      const finalRate = rate * (1 + spreadPercent / 100);
      const converted = sourceValue * finalRate;

      return {
        converted_value: String(Math.round(converted * 100) / 100),
        exchange_rate: String(Math.round(finalRate * 10000) / 10000),
        rate_date: data.date || new Date().toISOString().split("T")[0],
        error: "",
      };
    }

    // API response invalid, use fallback
    const rateKey = `${sourceCurrency}_${targetCurrency}`;
    const rate = fallbackRates[rateKey] || 1;
    const finalRate = rate * (1 + spreadPercent / 100);
    const converted = sourceValue * finalRate;

    return {
      converted_value: String(Math.round(converted * 100) / 100),
      exchange_rate: String(Math.round(finalRate * 10000) / 10000),
      rate_date: new Date().toISOString().split("T")[0] + " (fallback)",
      error: "",
    };
  } catch (e) {
    // Network error, use fallback
    console.warn("[ROBOT-HANDLER] Currency API failed, using fallback:", e);
    const rateKey = `${sourceCurrency}_${targetCurrency}`;
    const rate = fallbackRates[rateKey] || 1;
    const finalRate = rate * (1 + spreadPercent / 100);
    const converted = sourceValue * finalRate;

    return {
      converted_value: String(Math.round(converted * 100) / 100),
      exchange_rate: String(Math.round(finalRate * 10000) / 10000),
      rate_date: new Date().toISOString().split("T")[0] + " (fallback)",
      error: "",
    };
  }
}

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    console.log("[ROBOT-HANDLER] Received:", JSON.stringify(data).substring(0, 500));

    // Extract robot code and properties
    const code = data.code || data.CODE || "";
    const eventToken = data.event_token || data.EVENT_TOKEN || "";
    const properties = data.properties || data.PROPERTIES || {};
    const authData = data.auth || {};
    const memberId = authData.member_id || data.member_id || "";

    if (!code) {
      console.error("[ROBOT-HANDLER] No robot code in payload");
      return new Response(JSON.stringify({ error: "No robot code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await debugLog(supabase, null, `robot_${code}`, "inbound", { code, properties, memberId });

    // Execute robot logic
    let returnValues: Record<string, string> = {};

    switch (code) {
      case "emmely_send_whatsapp":
        returnValues = await handleSendWhatsApp(properties, supabaseUrl, serviceKey);
        break;
      case "emmely_send_instagram":
        returnValues = await handleSendInstagram(properties, supabaseUrl, serviceKey);
        break;
      case "emmely_create_charge": {
        // Get integration to pass to handleCreateCharge for Bitrix API calls
        let chargeIntegration: any = null;
        if (memberId) {
          const { data: intData } = await supabase
            .from("bitrix24_integrations")
            .select("*")
            .eq("member_id", memberId)
            .maybeSingle();
          chargeIntegration = intData;
        }
        returnValues = await handleCreateCharge(properties, supabaseUrl, chargeIntegration);
        break;
      }
        break;
      case "emmely_check_payment":
        returnValues = await handleCheckPayment(properties, supabaseUrl);
        break;
      case "emmely_execute_flow":
        returnValues = await handleExecuteFlow(properties, supabaseUrl, serviceKey);
        break;
      case "emmely_generate_proposal":
        returnValues = await handleGenerateProposal(properties, memberId, supabaseUrl, serviceKey);
        break;
      case "emmely_send_proposal":
        returnValues = await handleSendProposal(properties, supabaseUrl, serviceKey);
        break;
      case "emmely_generate_contract":
        returnValues = await handleGenerateContract(properties, memberId, supabaseUrl, serviceKey);
        break;
      case "emmely_convert_currency":
        returnValues = await handleConvertCurrency(properties);
        break;
      case "emmely_create_badge": {
        const badgeCode = properties.badge_code || properties.BADGE_CODE || "";
        const headerTitle = properties.header_title || properties.HEADER_TITLE || "";
        const messagePreview = properties.message_preview || properties.MESSAGE_PREVIEW || "";
        const entityType = (properties.entity_type || properties.ENTITY_TYPE || "deal").toLowerCase();
        const entityId = properties.entity_id || properties.ENTITY_ID || "";
        const badgeType = properties.badge_type || properties.BADGE_TYPE || "success";

        if (!badgeCode || !entityId) {
          returnValues = { badge_status: "error", error: "badge_code and entity_id are required" };
        } else {
          try {
            // Get integration for Bitrix API access
            let badgeIntegration: any = null;
            if (memberId) {
              const { data: intData } = await supabase
                .from("bitrix24_integrations")
                .select("*")
                .eq("member_id", memberId)
                .maybeSingle();
              badgeIntegration = intData;
            }
            if (!badgeIntegration?.client_endpoint || !badgeIntegration?.access_token) {
              returnValues = { badge_status: "error", error: "Bitrix24 integration not found" };
            } else {
              // Map entity type to Bitrix owner type
              const ownerTypeMap: Record<string, number> = { lead: 1, deal: 2, contact: 3 };
              const ownerTypeId = ownerTypeMap[entityType] || 2;

              // 1. Create timeline activity
              const actResult = await callBitrix(badgeIntegration.client_endpoint, badgeIntegration.access_token, "crm.activity.add", {
                fields: {
                  OWNER_TYPE_ID: ownerTypeId,
                  OWNER_ID: parseInt(entityId) || 0,
                  TYPE_ID: 6,
                  PROVIDER_ID: "REST_APP",
                  PROVIDER_TYPE_ID: "emmely_badge",
                  SUBJECT: headerTitle || badgeCode,
                  DESCRIPTION: messagePreview || "",
                  COMPLETED: "Y",
                  DIRECTION: 0,
                },
              });

              const activityId = actResult.result;
              if (activityId) {
                // 2. Assign badge to activity
                const badgeResult = await callBitrix(badgeIntegration.client_endpoint, badgeIntegration.access_token, "crm.activity.badge.set", {
                  activityId,
                  badgeCode,
                });
                returnValues = { badge_status: "created", activity_id: String(activityId), error: "" };
              } else {
                returnValues = { badge_status: "error", error: `Activity creation failed: ${JSON.stringify(actResult)}` };
              }
            }
          } catch (e) {
            returnValues = { badge_status: "error", error: String(e) };
          }
        }
        break;
      }
      default:
        console.error("[ROBOT-HANDLER] Unknown robot code:", code);
        returnValues = { error: `Unknown robot: ${code}` };
    }

    console.log("[ROBOT-HANDLER] Result for", code, ":", JSON.stringify(returnValues));

    // Send result back to Bitrix24 workflow via bizproc.event.send
    if (eventToken && memberId) {
      // Look up integration to get access token and endpoint
      const { data: integration } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .eq("member_id", memberId)
        .maybeSingle();

      if (integration?.client_endpoint && integration?.access_token) {
        const { endpoint: sendEp, token: sendTk } = await refreshBitrixToken(supabase, integration);
        const sendResult = await callBitrix(
          sendEp,
          sendTk,
          "bizproc.event.send",
          {
            EVENT_TOKEN: eventToken,
            RETURN_VALUES: returnValues,
          }
        );
        console.log("[ROBOT-HANDLER] bizproc.event.send result:", JSON.stringify(sendResult));
        await debugLog(supabase, integration.id, `robot_${code}_response`, "outbound", {
          returnValues,
          sendResult,
        });
      } else {
        console.error("[ROBOT-HANDLER] Integration not found for member:", memberId);
        await debugLog(supabase, null, `robot_${code}_error`, "outbound", null, `Integration not found for member ${memberId}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, returnValues }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ROBOT-HANDLER] Fatal error:", error);
    await debugLog(supabase, null, "robot_fatal", "inbound", null, String(error));
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
