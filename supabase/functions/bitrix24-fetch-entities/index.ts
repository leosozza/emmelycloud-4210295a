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
    const action = url.searchParams.get("action"); // pipelines | stages | items
    const entity = url.searchParams.get("entity"); // lead | deal | spa
    const categoryId = url.searchParams.get("category_id");
    const spaEntityTypeId = url.searchParams.get("spa_entity_type_id");
    const stageId = url.searchParams.get("stage_id");
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");

    if (!memberId || !action || !entity) {
      return new Response(
        JSON.stringify({ error: "member_id, action, and entity are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const ep = integration.client_endpoint;
    const auth = integration.access_token;

    if (!ep || !auth) {
      return new Response(
        JSON.stringify({ error: "Missing Bitrix24 credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bitrixCall = async (method: string, body: Record<string, any> = {}) => {
      const res = await fetch(`${ep}${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth, ...body }),
      });
      return res.json();
    };

    // ===================== PIPELINES =====================
    if (action === "pipelines") {
      if (entity === "lead") {
        // Leads don't have pipelines/categories — return a single "default"
        const data = await bitrixCall("crm.status.list", {
          filter: { ENTITY_ID: "STATUS" },
        });
        const stages = (data.result || []).map((s: any) => ({
          id: s.STATUS_ID,
          name: s.NAME,
          sort: s.SORT,
        }));
        return json({ success: true, pipelines: [{ id: "0", name: "Lead (padrão)" }], stages });
      }

      if (entity === "deal") {
        const data = await bitrixCall("crm.dealcategory.list");
        const categories = [
          { id: "0", name: "Pipeline Geral" },
          ...((data.result || []).map((c: any) => ({ id: String(c.ID), name: c.NAME }))),
        ];
        return json({ success: true, pipelines: categories });
      }

      if (entity === "spa") {
        const data = await bitrixCall("crm.type.list");
        const types = (data.result?.types || data.result || []).map((t: any) => ({
          id: String(t.entityTypeId || t.id),
          name: t.title || t.name || `SPA ${t.entityTypeId || t.id}`,
        }));
        return json({ success: true, pipelines: types });
      }
    }

    // ===================== STAGES =====================
    if (action === "stages") {
      if (entity === "lead") {
        const data = await bitrixCall("crm.status.list", {
          filter: { ENTITY_ID: "STATUS" },
        });
        const stages = (data.result || []).map((s: any) => ({
          id: s.STATUS_ID,
          name: s.NAME,
          sort: s.SORT,
        }));
        return json({ success: true, stages });
      }

      if (entity === "deal") {
        const catId = categoryId ? parseInt(categoryId) : 0;
        const data = await bitrixCall("crm.dealcategory.stage.list", { id: catId });
        const stages = (data.result || []).map((s: any) => ({
          id: s.STATUS_ID,
          name: s.NAME,
          sort: s.SORT,
        }));
        return json({ success: true, stages });
      }

      if (entity === "spa") {
        if (!spaEntityTypeId) {
          return json({ success: false, error: "spa_entity_type_id required for SPA stages" });
        }
        // For SPA, stages come from crm.status.list with ENTITY_ID = "DYNAMIC_{entityTypeId}_STAGE_{categoryId}"
        // Or we can use crm.item.fields to get stage field items
        // Simpler: use crm.status.list with prefix
        const entityPrefix = `DYNAMIC_${spaEntityTypeId}_STAGE_`;
        const data = await bitrixCall("crm.status.list");
        const allStatuses = data.result || [];
        const stages = allStatuses
          .filter((s: any) => s.ENTITY_ID?.startsWith(entityPrefix) || s.ENTITY_ID === `DYNAMIC_${spaEntityTypeId}_STAGE_0`)
          .map((s: any) => ({
            id: s.STATUS_ID,
            name: s.NAME,
            sort: s.SORT,
            category: s.ENTITY_ID,
          }));

        // If no stages found with prefix, try the default category
        if (stages.length === 0) {
          // Fallback: fetch item fields and get stageId items
          const fieldsData = await bitrixCall("crm.item.fields", { entityTypeId: parseInt(spaEntityTypeId) });
          const stageField = fieldsData.result?.fields?.stageId;
          if (stageField?.items) {
            const fallbackStages = stageField.items.map((item: any) => ({
              id: item.ID || item.STATUS_ID,
              name: item.VALUE || item.NAME,
              sort: 0,
            }));
            return json({ success: true, stages: fallbackStages });
          }
        }

        return json({ success: true, stages });
      }
    }

    // ===================== ITEMS =====================
    if (action === "items") {
      if (entity === "lead") {
        const filter: Record<string, any> = {};
        if (stageId) filter["STATUS_ID"] = stageId;
        if (dateFrom) filter[">DATE_CREATE"] = dateFrom;
        if (dateTo) filter["<DATE_CREATE"] = dateTo;

        const data = await bitrixCall("crm.lead.list", {
          filter,
          select: ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "CONTACT_ID", "STATUS_ID", "DATE_CREATE"],
          order: { DATE_CREATE: "DESC" },
        });

        if (data.error) return json({ error: data.error, error_description: data.error_description }, 400);

        const leads = data.result || [];
        const contactIds = [...new Set(leads.filter((l: any) => l.CONTACT_ID).map((l: any) => l.CONTACT_ID))];
        const contactsMap = await fetchContacts(ep, auth, contactIds);

        // Fetch stage names
        const stagesData = await bitrixCall("crm.status.list", { filter: { ENTITY_ID: "STATUS" } });
        const stagesMap: Record<string, string> = {};
        for (const s of (stagesData.result || [])) {
          stagesMap[s.STATUS_ID] = s.NAME;
        }

        const items = leads.map((l: any) => {
          const contact = contactsMap[l.CONTACT_ID] || {};
          return {
            id: l.ID,
            title: l.TITLE,
            opportunity: parseFloat(l.OPPORTUNITY) || 0,
            currency: l.CURRENCY_ID || "EUR",
            stage_id: l.STATUS_ID,
            stage_name: stagesMap[l.STATUS_ID] || l.STATUS_ID,
            contact_id: l.CONTACT_ID,
            contact_name: contact.name || null,
            contact_phone: contact.phone || null,
            contact_email: contact.email || null,
            date_create: l.DATE_CREATE,
          };
        });

        return json({ success: true, items, total: items.length });
      }

      if (entity === "deal") {
        const filter: Record<string, any> = {};
        if (stageId) filter["STAGE_ID"] = stageId;
        if (categoryId) filter["CATEGORY_ID"] = categoryId;
        if (dateFrom) filter[">DATE_CREATE"] = dateFrom;
        if (dateTo) filter["<DATE_CREATE"] = dateTo;

        const data = await bitrixCall("crm.deal.list", {
          filter,
          select: ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "CONTACT_ID", "COMPANY_ID", "STAGE_ID", "DATE_CREATE"],
          order: { DATE_CREATE: "DESC" },
        });

        if (data.error) return json({ error: data.error, error_description: data.error_description }, 400);

        const deals = data.result || [];
        const contactIds = [...new Set(deals.filter((d: any) => d.CONTACT_ID).map((d: any) => d.CONTACT_ID))];
        const contactsMap = await fetchContacts(ep, auth, contactIds);

        const catId = categoryId ? parseInt(categoryId) : 0;
        const stagesData = await bitrixCall("crm.dealcategory.stage.list", { id: catId });
        const stagesMap: Record<string, string> = {};
        for (const s of (stagesData.result || [])) {
          stagesMap[s.STATUS_ID] = s.NAME;
        }

        const items = deals.map((d: any) => {
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

        return json({ success: true, items, total: items.length });
      }

      if (entity === "spa") {
        if (!spaEntityTypeId) {
          return json({ success: false, error: "spa_entity_type_id required for SPA items" });
        }

        const filter: Record<string, any> = {};
        if (stageId) filter["stageId"] = stageId;
        if (dateFrom) filter[">createdTime"] = dateFrom;
        if (dateTo) filter["<createdTime"] = dateTo;

        const data = await bitrixCall("crm.item.list", {
          entityTypeId: parseInt(spaEntityTypeId),
          filter,
          select: ["id", "title", "opportunity", "currencyId", "contactId", "companyId", "stageId", "createdTime"],
          order: { createdTime: "DESC" },
        });

        if (data.error) return json({ error: data.error, error_description: data.error_description }, 400);

        const spaItems = data.result?.items || [];
        const contactIds = [...new Set(spaItems.filter((i: any) => i.contactId).map((i: any) => String(i.contactId)))];
        const contactsMap = await fetchContacts(ep, auth, contactIds);

        const items = spaItems.map((i: any) => {
          const contact = contactsMap[String(i.contactId)] || {};
          return {
            id: String(i.id),
            title: i.title || `SPA #${i.id}`,
            opportunity: parseFloat(i.opportunity) || 0,
            currency: i.currencyId || "EUR",
            stage_id: i.stageId,
            stage_name: i.stageId, // SPA stage names resolved client-side or via stages call
            contact_id: i.contactId ? String(i.contactId) : null,
            contact_name: contact.name || null,
            contact_phone: contact.phone || null,
            contact_email: contact.email || null,
            date_create: i.createdTime,
          };
        });

        return json({ success: true, items, total: items.length });
      }
    }

    return json({ error: `Unknown action '${action}' or entity '${entity}'` }, 400);
  } catch (error) {
    console.error("[bitrix24-fetch-entities] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: fetch contacts by IDs
async function fetchContacts(ep: string, auth: string, contactIds: string[]): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  if (contactIds.length === 0) return map;

  const res = await fetch(`${ep}crm.contact.list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth,
      filter: { ID: contactIds },
      select: ["ID", "NAME", "SECOND_NAME", "LAST_NAME", "PHONE", "EMAIL"],
    }),
  });
  const data = await res.json();
  if (data.result) {
    for (const c of data.result) {
      const fullName = [c.NAME, c.SECOND_NAME, c.LAST_NAME].filter(Boolean).join(" ");
      map[c.ID] = {
        name: fullName,
        phone: c.PHONE?.[0]?.VALUE || null,
        email: c.EMAIL?.[0]?.VALUE || null,
      };
    }
  }
  return map;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    },
  });
}
