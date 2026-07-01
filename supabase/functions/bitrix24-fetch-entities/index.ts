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

    if (!action || !entity) {
      return new Response(
        JSON.stringify({ error: "action and entity are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve integration: by member_id if provided, else most recently updated
    let integration: any = null;
    if (memberId) {
      const { data } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .eq("member_id", memberId)
        .maybeSingle();
      integration = data;
    }
    if (!integration) {
      const { data } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      integration = data;
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ error: "No Bitrix24 integration found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Token refresh if expired
    const ep = integration.client_endpoint;
    let auth = integration.access_token;

    if (!ep || !auth) {
      return new Response(
        JSON.stringify({ error: "Missing Bitrix24 credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expiresAt = new Date(integration.expires_at);
    const bufferMs = 5 * 60 * 1000;
    if (expiresAt.getTime() - Date.now() <= bufferMs) {
      try {
        console.log("[fetch-entities] Token expired, refreshing...");
        const tokenRes = await fetch("https://oauth.bitrix.info/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
            client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
            refresh_token: integration.refresh_token,
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.error) {
          auth = tokenData.access_token;
          await supabase.from("bitrix24_integrations").update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          }).eq("id", integration.id);
        }
      } catch (e) {
        console.error("[fetch-entities] Token refresh failed:", e);
      }
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
        // Paginate to get ALL deal categories
        const allCategories: any[] = [];
        let start = 0;
        while (true) {
          const data = await bitrixCall("crm.dealcategory.list", { start });
          const items = data.result || [];
          allCategories.push(...items);
          if (!data.next) break;
          start = data.next;
        }
        const categories = [
          { id: "0", name: "Pipeline Geral" },
          ...allCategories.map((c: any) => ({ id: String(c.ID), name: c.NAME })),
        ];
        return json({ success: true, pipelines: categories, total_pipelines: categories.length });
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
        const contactIds = [...new Set(leads.filter((l: any) => l.CONTACT_ID).map((l: any) => String(l.CONTACT_ID)))] as string[];
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
        const contactIds = [...new Set(deals.filter((d: any) => d.CONTACT_ID).map((d: any) => String(d.CONTACT_ID)))] as string[];
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
        const contactsMap = await fetchContacts(ep, auth, contactIds as string[]);

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
