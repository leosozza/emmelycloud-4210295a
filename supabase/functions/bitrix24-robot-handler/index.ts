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
  return await response.json();
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

async function handleCreateCharge(properties: Record<string, any>, supabaseUrl: string): Promise<Record<string, string>> {
  const amount = parseFloat(properties.amount || properties.AMOUNT || "0");
  const currency = properties.currency || properties.CURRENCY || "EUR";
  const gateway = properties.gateway || properties.GATEWAY || "auto";
  const paymentMethod = properties.payment_method || properties.PAYMENT_METHOD || "card";
  const customerName = properties.customer_name || properties.CUSTOMER_NAME || "";
  const customerEmail = properties.customer_email || properties.CUSTOMER_EMAIL || "";
  const customerCpf = properties.customer_cpf || properties.CUSTOMER_CPF || "";
  const description = properties.description || properties.DESCRIPTION || "Cobrança Emmely via Bitrix24";

  if (!amount || amount <= 0) {
    return { charge_id: "", charge_status: "error", payment_url: "", pix_code: "", gateway_used: "", error: "amount must be > 0" };
  }

  // Determine country based on gateway selection
  let country = currency === "BRL" ? "Brasil" : "Portugal";
  if (gateway === "stripe") country = "Portugal";
  else if (gateway === "asaas") country = "Brasil";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        currency,
        payment_method: paymentMethod,
        customer_data: {
          name: customerName,
          email: customerEmail,
          cpf_cnpj: customerCpf || undefined,
          country,
        },
        description,
      }),
    });
    const data = await res.json();
    if (data.error) {
      return { charge_id: "", charge_status: "error", payment_url: "", pix_code: "", gateway_used: "", error: data.error };
    }
    const tx = data.transaction || {};
    return {
      charge_id: tx.id || tx.gateway_payment_id || "",
      charge_status: tx.status || "pending",
      payment_url: tx.payment_url || "",
      pix_code: tx.pix_code || "",
      gateway_used: tx.gateway || "",
      error: "",
    };
  } catch (e) {
    return { charge_id: "", charge_status: "error", payment_url: "", pix_code: "", gateway_used: "", error: String(e) };
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
  const paymentType = properties.payment_type || properties.PAYMENT_TYPE || "fixo";
  const installments = parseInt(properties.installments || properties.INSTALLMENTS || "1") || 1;
  const manualValue = parseFloat(properties.value || properties.VALUE || "0");
  const manualDescription = properties.description || properties.DESCRIPTION || "";
  const conditions = properties.conditions || properties.CONDITIONS || "";
  const validDays = parseInt(properties.valid_days || properties.VALID_DAYS || "30") || 30;

  const entityId = entityType === "lead" ? leadId : dealId;
  if (!entityId) {
    return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", error: "deal_id or lead_id is required" };
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
      return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", error: "Bitrix24 integration not found" };
    }

    const ep = integration.client_endpoint;
    const tk = integration.access_token;

    // 2. Fetch entity data from Bitrix24
    const method = entityType === "lead" ? "crm.lead.get" : "crm.deal.get";
    const entityResult = await callBitrix(ep, tk, method, { ID: entityId });
    const entity = entityResult.result;

    if (!entity) {
      return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", error: `Entity ${entityType} ${entityId} not found in Bitrix24` };
    }

    const entityTitle = entity.TITLE || "";
    const opportunity = parseFloat(entity.OPPORTUNITY || "0");

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
        // Extract first email and phone from multi-fields
        if (contact.EMAIL && Array.isArray(contact.EMAIL) && contact.EMAIL.length > 0) {
          clientEmail = contact.EMAIL[0].VALUE || "";
        }
        if (contact.PHONE && Array.isArray(contact.PHONE) && contact.PHONE.length > 0) {
          clientPhone = contact.PHONE[0].VALUE || "";
        }
        // Address from contact
        if (contact.ADDRESS) clientAddress = contact.ADDRESS;
      }
    }

    // 4. Fetch service if service_name provided
    let serviceId: string | null = null;
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

    // Determine final values
    const finalValue = manualValue > 0 ? manualValue : (serviceValue > 0 ? serviceValue : opportunity);
    const finalTitle = manualTitle || entityTitle || "Proposta";
    const finalDescription = manualDescription || serviceDescription || "";

    // 5. Create case to link proposal
    const { data: caseData } = await supabase
      .from("cases")
      .insert({
        title: finalTitle,
        description: `Caso criado automaticamente via Bitrix24 (${entityType} #${entityId})`,
        legal_area: "outro",
        status: "aberto",
      })
      .select("id")
      .single();

    if (!caseData) {
      return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", error: "Failed to create case" };
    }

    // 6. Insert proposal
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: proposal, error: proposalErr } = await supabase
      .from("proposals")
      .insert({
        title: finalTitle,
        case_id: caseData.id,
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
        status: "enviada",
      })
      .select("id, accept_token")
      .single();

    if (proposalErr || !proposal) {
      return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", error: proposalErr?.message || "Failed to create proposal" };
    }

    const proposalUrl = `https://emmelycloud.lovable.app/proposta/${proposal.accept_token}`;

    // 7. Generate PDF
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

    return {
      proposal_url: proposalUrl,
      pdf_url: pdfUrl,
      proposal_id: proposal.id,
      status: "created",
      error: "",
    };
  } catch (e) {
    return { proposal_url: "", pdf_url: "", proposal_id: "", status: "error", error: String(e) };
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
      case "emmely_create_charge":
        returnValues = await handleCreateCharge(properties, supabaseUrl);
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
        const sendResult = await callBitrix(
          integration.client_endpoint,
          integration.access_token,
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
