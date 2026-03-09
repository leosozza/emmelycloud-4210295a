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
    const { member_id, deal_id, entity_type = "deal", spa_entity_type_id, payment_data } = body;

    if (!member_id || !deal_id) {
      return new Response(
        JSON.stringify({ error: "member_id and deal_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const bitrixCall = async (method: string, payload: Record<string, any> = {}) => {
      const res = await fetch(`${endpoint}${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: accessToken, ...payload }),
      });
      return res.json();
    };

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

    console.log(`[update-deal-payment] entity=${entity_type} id=${deal_id} payment:`, payment_data);

    // ── 1. Update entity UF fields (aligned with bitrix24-install field names) ──
    const ufFields: Record<string, any> = {};
    if (total_installments !== undefined) ufFields["UF_CRM_EMMELY_TOTAL_INSTALLMENTS"] = total_installments;
    if (paid_installments !== undefined) ufFields["UF_CRM_EMMELY_PAID_INSTALLMENTS"] = paid_installments;
    if (installment_value !== undefined) ufFields["UF_CRM_EMMELY_INSTALLMENT_VALUE"] = installment_value;
    if (next_due_date) ufFields["UF_CRM_EMMELY_NEXT_DUE_DATE"] = next_due_date;
    if (payment_method) ufFields["UF_CRM_EMMELY_PAYMENT_METHOD"] = payment_method;
    if (gateway) ufFields["UF_CRM_EMMELY_GATEWAY"] = gateway;
    if (notes) ufFields["UF_CRM_EMMELY_PAYMENT_NOTES"] = notes;

    let entityUpdateResult = null;
    if (Object.keys(ufFields).length > 0) {
      if (entity_type === "lead") {
        entityUpdateResult = await bitrixCall("crm.lead.update", { id: deal_id, fields: ufFields });
      } else if (entity_type === "spa" && spa_entity_type_id) {
        // SPA uses camelCase UF fields
        const spaFields: Record<string, any> = {};
        for (const [k, v] of Object.entries(ufFields)) {
          // Convert UF_CRM_X to ufCrmX (camelCase)
          const camel = k.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          spaFields[camel] = v;
        }
        entityUpdateResult = await bitrixCall("crm.item.update", {
          entityTypeId: parseInt(spa_entity_type_id),
          id: parseInt(deal_id),
          fields: spaFields,
        });
      } else {
        entityUpdateResult = await bitrixCall("crm.deal.update", { id: deal_id, fields: ufFields });
      }
      console.log("[update-deal-payment] Entity update result:", entityUpdateResult);
    }

    // ── 2. Get entity data for contact/company info ──
    let contactId: string | null = null;
    let companyId: string | null = null;
    let currency = "EUR";
    let entityOpportunity = 0;

    if (entity_type === "lead") {
      const data = await bitrixCall("crm.lead.get", { id: deal_id });
      const lead = data.result;
      if (lead) {
        contactId = lead.CONTACT_ID;
        companyId = lead.COMPANY_ID;
        currency = lead.CURRENCY_ID || "EUR";
        entityOpportunity = parseFloat(lead.OPPORTUNITY) || 0;
      }
    } else if (entity_type === "spa" && spa_entity_type_id) {
      const data = await bitrixCall("crm.item.get", {
        entityTypeId: parseInt(spa_entity_type_id),
        id: parseInt(deal_id),
      });
      const item = data.result?.item || data.result;
      if (item) {
        contactId = item.contactId ? String(item.contactId) : null;
        companyId = item.companyId ? String(item.companyId) : null;
        currency = item.currencyId || "EUR";
        entityOpportunity = parseFloat(item.opportunity) || 0;
      }
    } else {
      const data = await bitrixCall("crm.deal.get", { id: deal_id });
      const deal = data.result;
      if (deal) {
        contactId = deal.CONTACT_ID;
        companyId = deal.COMPANY_ID;
        currency = deal.CURRENCY_ID || "EUR";
        entityOpportunity = parseFloat(deal.OPPORTUNITY) || 0;
      }
    }

    // ── 3. Create/Update Smart Invoices (Entity Type 31) ──
    const invoicesCreated: any[] = [];
    const totalInst = total_installments || 1;
    const paidInst = paid_installments || 0;
    const instValue = installment_value || (entityOpportunity / totalInst);

    for (let i = 0; i < totalInst; i++) {
      const installmentNum = i + 1;
      const isPaid = i < paidInst;
      const paidDate = isPaid && paid_dates?.[i] ? paid_dates[i] : null;

      let dueDate = null;
      if (!isPaid && next_due_date) {
        const baseDate = new Date(next_due_date);
        const offsetMonths = i - paidInst;
        baseDate.setMonth(baseDate.getMonth() + offsetMonths);
        dueDate = baseDate.toISOString().split("T")[0];
      }

      const stageId = isPaid ? "DT31_1:P" : "DT31_1:NEW";

      const invoiceFields: Record<string, any> = {
        title: `Parcela ${installmentNum}/${totalInst} - ${entity_type === "lead" ? "Lead" : entity_type === "spa" ? "SPA" : "Deal"} #${deal_id}`,
        opportunity: instValue,
        currencyId: currency,
        stageId,
      };

      // Link to parent entity
      if (entity_type === "deal") {
        invoiceFields["parentId2"] = deal_id; // Deal = entity type 2
      } else if (entity_type === "lead") {
        invoiceFields["parentId1"] = deal_id; // Lead = entity type 1
      } else if (entity_type === "spa" && spa_entity_type_id) {
        invoiceFields[`parentId${spa_entity_type_id}`] = deal_id;
      }

      if (contactId) invoiceFields["contactId"] = contactId;
      if (companyId) invoiceFields["companyId"] = companyId;
      if (dueDate) invoiceFields["ufCrm31DueDate"] = dueDate;
      if (paidDate) invoiceFields["ufCrm31PaidDate"] = paidDate;

      // Check existing
      const parentFilter: Record<string, any> = {
        title: `Parcela ${installmentNum}/${totalInst}%`,
      };
      if (entity_type === "deal") parentFilter["parentId2"] = deal_id;
      else if (entity_type === "lead") parentFilter["parentId1"] = deal_id;

      const existingData = await bitrixCall("crm.item.list", {
        entityTypeId: 31,
        filter: parentFilter,
        select: ["id", "title"],
      });
      const existing = existingData.result?.items?.[0];

      if (existing) {
        const updateData = await bitrixCall("crm.item.update", {
          entityTypeId: 31,
          id: existing.id,
          fields: invoiceFields,
        });
        invoicesCreated.push({ action: "updated", id: existing.id, result: updateData });
      } else {
        const createData = await bitrixCall("crm.item.add", {
          entityTypeId: 31,
          fields: invoiceFields,
        });
        invoicesCreated.push({ action: "created", result: createData });
      }
    }

    // ── 4. Badge ──
    // ownerTypeId: 1=Lead, 2=Deal, SPA=entityTypeId
    const ownerTypeId = entity_type === "lead" ? 1 : entity_type === "spa" ? parseInt(spa_entity_type_id || "2") : 2;
    try {
      await bitrixCall("crm.activity.configurable.add", {
        ownerTypeId,
        ownerId: parseInt(deal_id),
        fields: { completed: false, isIncomingChannel: "N", responsibleId: 1, badgeCode: "emmely_deal_payment_updated" },
        layout: {
          icon: { code: "money" },
          header: { title: "Parcelas Atualizadas" },
          body: {
            logo: { code: "robot" },
            blocks: {
              total: { type: "text", properties: { value: `${totalInst} parcelas` } },
              paid: { type: "text", properties: { value: `${paidInst} pagas` } },
              value: { type: "text", properties: { value: `${instValue} ${currency}` } },
            },
          },
        },
      });
    } catch (badgeErr) {
      console.error("[update-deal-payment] Badge error:", badgeErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        entityUpdateResult,
        invoicesCreated,
        message: `${entity_type} ${deal_id} updated with ${invoicesCreated.length} invoices processed`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[update-deal-payment] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
