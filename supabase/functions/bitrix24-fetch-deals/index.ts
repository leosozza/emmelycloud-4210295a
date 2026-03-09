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
    const url = new URL(req.url);
    const memberId = url.searchParams.get("member_id");
    const stageId = url.searchParams.get("stage_id");
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const categoryId = url.searchParams.get("category_id");

    if (!memberId) {
      return new Response(
        JSON.stringify({ error: "member_id is required" }),
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
      .eq("member_id", memberId)
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

    // Build filter
    const filter: Record<string, any> = {};
    if (stageId) filter["STAGE_ID"] = stageId;
    if (dateFrom) filter[">DATE_CREATE"] = dateFrom;
    if (dateTo) filter["<DATE_CREATE"] = dateTo;
    if (categoryId) filter["CATEGORY_ID"] = categoryId;

    console.log("[bitrix24-fetch-deals] Fetching deals with filter:", filter);

    // Call crm.deal.list
    const dealListRes = await fetch(`${endpoint}crm.deal.list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: accessToken,
        filter,
        select: ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "CONTACT_ID", "COMPANY_ID", "STAGE_ID", "DATE_CREATE"],
        order: { DATE_CREATE: "DESC" },
      }),
    });

    const dealListData = await dealListRes.json();

    if (dealListData.error) {
      console.error("[bitrix24-fetch-deals] Bitrix error:", dealListData.error);
      return new Response(
        JSON.stringify({ error: dealListData.error, error_description: dealListData.error_description }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deals = dealListData.result || [];
    console.log(`[bitrix24-fetch-deals] Found ${deals.length} deals`);

    // Fetch contacts for deals that have CONTACT_ID
    const contactIds = [...new Set(deals.filter((d: any) => d.CONTACT_ID).map((d: any) => d.CONTACT_ID))];
    const contactsMap: Record<string, any> = {};

    if (contactIds.length > 0) {
      // Batch fetch contacts
      const contactRes = await fetch(`${endpoint}crm.contact.list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: accessToken,
          filter: { ID: contactIds },
          select: ["ID", "NAME", "SECOND_NAME", "LAST_NAME", "PHONE", "EMAIL"],
        }),
      });

      const contactData = await contactRes.json();
      if (contactData.result) {
        for (const c of contactData.result) {
          const fullName = [c.NAME, c.SECOND_NAME, c.LAST_NAME].filter(Boolean).join(" ");
          const phone = c.PHONE?.[0]?.VALUE || null;
          const email = c.EMAIL?.[0]?.VALUE || null;
          contactsMap[c.ID] = { name: fullName, phone, email };
        }
      }
    }

    // Fetch deal categories/stages for stage names
    const stageRes = await fetch(`${endpoint}crm.dealcategory.stage.list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: accessToken,
        id: categoryId || 0,
      }),
    });

    const stageData = await stageRes.json();
    const stagesMap: Record<string, string> = {};
    if (stageData.result) {
      for (const s of stageData.result) {
        stagesMap[s.STATUS_ID] = s.NAME;
      }
    }

    // Build response
    const result = deals.map((d: any) => {
      const contact = contactsMap[d.CONTACT_ID] || {};
      return {
        id: d.ID,
        title: d.TITLE,
        opportunity: parseFloat(d.OPPORTUNITY) || 0,
        currency: d.CURRENCY_ID || "EUR",
        stage_id: d.STAGE_ID,
        stage_name: stagesMap[d.STAGE_ID] || d.STAGE_ID,
        contact_id: d.CONTACT_ID,
        contact_name: contact.name || null,
        contact_phone: contact.phone || null,
        contact_email: contact.email || null,
        date_create: d.DATE_CREATE,
      };
    });

    return new Response(
      JSON.stringify({ success: true, deals: result, total: result.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[bitrix24-fetch-deals] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
