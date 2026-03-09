import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { member_id, deal_id, payment_data } = body;

    if (!member_id || !deal_id) {
      return new Response(
        JSON.stringify({ error: "member_id and deal_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch integration
    const { data: integration, error: intError } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .eq("member_id", member_id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Integration not found", details: intError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const endpoint = integration.client_endpoint;
    const accessToken = integration.access_token;

    if (!endpoint || !accessToken) {
      return new Response(
        JSON.stringify({ error: "Missing Bitrix24 credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      total_installments,
      installment_value,
      paid_installments,
      paid_dates,
      next_due_date,
      payment_method,
      gateway,
      notes,
    } = payment_data || {};

    console.log(`[bitrix24-update-deal-payment] Updating deal ${deal_id} with payment data:`, payment_data);

    // 1. Update deal UF_CRM_* fields
    const dealFields: Record<string, any> = {};
    if (total_installments !== undefined) dealFields["UF_CRM_PARCELAS_TOTAL"] = total_installments;
    if (paid_installments !== undefined) dealFields["UF_CRM_PARCELAS_PAGAS"] = paid_installments;
    if (installment_value !== undefined) dealFields["UF_CRM_VALOR_PARCELA"] = installment_value;
    if (next_due_date) dealFields["UF_CRM_PROX_VENCIMENTO"] = next_due_date;
    if (payment_method) dealFields["UF_CRM_METODO_PAGAMENTO"] = payment_method;
    if (gateway) dealFields["UF_CRM_GATEWAY"] = gateway;
    if (notes) dealFields["UF_CRM_NOTAS_PAGAMENTO"] = notes;

    let dealUpdateResult = null;
    if (Object.keys(dealFields).length > 0) {
      const dealUpdateRes = await fetch(`${endpoint}crm.deal.update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: accessToken,
          id: deal_id,
          fields: dealFields,
        }),
      });
      dealUpdateResult = await dealUpdateRes.json();
      console.log("[bitrix24-update-deal-payment] Deal update result:", dealUpdateResult);
    }

    // 2. Create/Update Smart Invoices (Entity Type 31) for each installment
    // First, get the deal to extract contact info
    const dealRes = await fetch(`${endpoint}crm.deal.get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: accessToken,
        id: deal_id,
      }),
    });
    const dealData = await dealRes.json();
    const deal = dealData.result;

    if (!deal) {
      return new Response(
        JSON.stringify({ error: "Deal not found in Bitrix24", dealUpdateResult }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contactId = deal.CONTACT_ID;
    const companyId = deal.COMPANY_ID;
    const currency = deal.CURRENCY_ID || "EUR";

    const invoicesCreated: any[] = [];

    // Create Smart Invoices for each installment
    const totalInst = total_installments || 1;
    const paidInst = paid_installments || 0;
    const instValue = installment_value || (parseFloat(deal.OPPORTUNITY) / totalInst);

    for (let i = 0; i < totalInst; i++) {
      const installmentNum = i + 1;
      const isPaid = i < paidInst;
      const paidDate = isPaid && paid_dates?.[i] ? paid_dates[i] : null;

      // Calculate due date for pending installments
      let dueDate = null;
      if (!isPaid && next_due_date) {
        const baseDate = new Date(next_due_date);
        const offsetMonths = i - paidInst;
        baseDate.setMonth(baseDate.getMonth() + offsetMonths);
        dueDate = baseDate.toISOString().split("T")[0];
      }

      // Stage: D31:NEW for pending, D31:FINAL_INVOICE for paid
      // Note: Stage IDs may vary per Bitrix24 instance
      const stageId = isPaid ? "DT31_1:P" : "DT31_1:NEW";

      const invoiceFields: Record<string, any> = {
        title: `Parcela ${installmentNum}/${totalInst} - Deal #${deal_id}`,
        opportunity: instValue,
        currencyId: currency,
        parentId2: deal_id, // Link to Deal
        stageId: stageId,
      };

      if (contactId) invoiceFields["contactId"] = contactId;
      if (companyId) invoiceFields["companyId"] = companyId;
      if (dueDate) invoiceFields["ufCrm31DueDate"] = dueDate;
      if (paidDate) invoiceFields["ufCrm31PaidDate"] = paidDate;

      // Check if invoice already exists for this installment
      const existingInvoiceRes = await fetch(`${endpoint}crm.item.list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: accessToken,
          entityTypeId: 31,
          filter: {
            "parentId2": deal_id,
            "title": `Parcela ${installmentNum}/${totalInst}%`,
          },
          select: ["id", "title"],
        }),
      });
      const existingInvoiceData = await existingInvoiceRes.json();
      const existingInvoice = existingInvoiceData.result?.items?.[0];

      if (existingInvoice) {
        // Update existing
        const updateRes = await fetch(`${endpoint}crm.item.update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auth: accessToken,
            entityTypeId: 31,
            id: existingInvoice.id,
            fields: invoiceFields,
          }),
        });
        const updateData = await updateRes.json();
        invoicesCreated.push({ action: "updated", id: existingInvoice.id, result: updateData });
      } else {
        // Create new
        const createRes = await fetch(`${endpoint}crm.item.add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auth: accessToken,
            entityTypeId: 31,
            fields: invoiceFields,
          }),
        });
        const createData = await createRes.json();
        invoicesCreated.push({ action: "created", result: createData });
      }
    }

    // --- Badge: emmely_deal_payment_updated ---
    try {
      await fetch(`${endpoint}crm.activity.configurable.add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: accessToken,
          ownerTypeId: 2,
          ownerId: parseInt(deal_id),
          fields: { completed: false, isIncomingChannel: "N", responsibleId: 1, badgeCode: "emmely_deal_payment_updated" },
          layout: {
            icon: { code: "money" },
            header: { title: "Parcelas Atualizadas" },
            body: { logo: { code: "robot" }, blocks: {
              total: { type: "text", properties: { value: `${totalInst} parcelas` } },
              paid: { type: "text", properties: { value: `${paidInst} pagas` } },
              value: { type: "text", properties: { value: `${instValue} ${currency}` } },
            } },
          },
        }),
      });
      console.log(`[bitrix24-update-deal-payment] Badge emmely_deal_payment_updated for deal ${deal_id}`);
    } catch (badgeErr) {
      console.error("[bitrix24-update-deal-payment] Badge error:", badgeErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        dealUpdateResult,
        invoicesCreated,
        message: `Deal ${deal_id} updated with ${invoicesCreated.length} invoices processed`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[bitrix24-update-deal-payment] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
