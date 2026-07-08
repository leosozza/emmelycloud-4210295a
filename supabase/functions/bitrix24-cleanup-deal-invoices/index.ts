import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const res = await fetch(`${endpoint}${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null;
  if (expiresAt && expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
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

/**
 * Admin one-off: list, cancel or set-paid Smart Invoices for a deal.
 *
 * Body:
 *  {
 *    deal_id: string,               // required — parentId2
 *    action: "list" | "apply",     // default: "list"
 *    keep_ids?: (string|number)[],  // invoice ids to keep untouched
 *    cancel_ids?: (string|number)[],// invoice ids to move to "declined"
 *    paid_ids?: (string|number)[],  // invoice ids to move to "paid"
 *    delete_ids?: (string|number)[],// invoice ids to hard-delete
 *  }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const dealId = String(body.deal_id || "").trim();
    const action = body.action || "list";
    if (!dealId) {
      return new Response(JSON.stringify({ error: "deal_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integration } = await supabase
      .from("bitrix24_integrations").select("*")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!integration?.client_endpoint) {
      return new Response(JSON.stringify({ error: "no integration" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = await ensureValidToken(supabase, integration);

    // Discover stages per category via crm.category.stage.list (works for Smart Invoice entityTypeId=31)
    const stagesByCategory: Record<string, { paid?: string; declined?: string; pending?: string; all: any[] }> = {};
    // discover categories
    const catRes = await callBitrix(integration.client_endpoint, token, "crm.category.list", { entityTypeId: 31 });
    const cats = catRes.result?.categories || [];
    for (const cat of cats) {
      const catId = cat.id;
      const res = await callBitrix(integration.client_endpoint, token, "crm.category.stage.list", {
        entityTypeId: 31, id: catId,
      });
      const items = res.result || [];
      const bucket: any = { all: items };
      for (const it of items) {
        const sem = String(it.SEMANTICS || it.semantics || "").toUpperCase();
        const sid = String(it.STATUS_ID || it.statusId || "");
        if (sem === "S" && !bucket.paid) bucket.paid = sid;
        else if (sem === "F" && !bucket.declined) bucket.declined = sid;
        else if (!bucket.pending) bucket.pending = sid;
      }
      stagesByCategory[String(catId)] = bucket;
    }

    // List invoices for the deal
    const listRes = await callBitrix(integration.client_endpoint, token, "crm.item.list", {
      entityTypeId: 31,
      filter: { parentId2: parseInt(dealId, 10) },
      select: ["id", "title", "stageId", "categoryId", "opportunity", "ufCrm_69B83DDB2661E"],
      order: { id: "ASC" },
    });
    const invoices = (listRes.result?.items || []).map((it: any) => ({
      id: it.id,
      title: it.title,
      stageId: it.stageId,
      categoryId: it.categoryId,
      amount: it.opportunity,
      group_id: it.ufCrm_69B83DDB2661E,
    }));

    // Fallback: if stagesByCategory buckets came back empty, infer using the invoice-observed prefix + standard codes
    for (const inv of invoices) {
      const cat = String(inv.categoryId);
      const bucket = stagesByCategory[cat] || (stagesByCategory[cat] = { all: [] });
      const prefix = String(inv.stageId || "").split(":")[0] || `DT31_${cat}`;
      if (!bucket.paid) bucket.paid = `${prefix}:P`;
      if (!bucket.declined) bucket.declined = `${prefix}:D`;
      if (!bucket.pending) bucket.pending = `${prefix}:N`;
    }

    if (action === "list") {
      return new Response(JSON.stringify({ ok: true, invoices, stagesByCategory }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toCancel = new Set((body.cancel_ids || []).map((x: any) => String(x)));
    const toPaid = new Set((body.paid_ids || []).map((x: any) => String(x)));
    const toDelete = new Set((body.delete_ids || []).map((x: any) => String(x)));

    const results: any[] = [];
    for (const inv of invoices) {
      const idStr = String(inv.id);
      const catBucket = stagesByCategory[String(inv.categoryId)] || stagesByCategory["1"];
      try {
        if (toDelete.has(idStr)) {
          const r = await callBitrix(integration.client_endpoint, token, "crm.item.delete", {
            entityTypeId: 31, id: inv.id,
          });
          results.push({ id: inv.id, action: "delete", ok: !r.error, error: r.error });
        } else if (toCancel.has(idStr)) {
          const stage = catBucket?.declined;
          if (!stage) { results.push({ id: inv.id, action: "cancel", ok: false, error: "no declined stage" }); continue; }
          const r = await callBitrix(integration.client_endpoint, token, "crm.item.update", {
            entityTypeId: 31, id: inv.id, fields: { stageId: stage },
          });
          results.push({ id: inv.id, action: "cancel", stage, ok: !r.error, error: r.error });
        } else if (toPaid.has(idStr)) {
          const stage = catBucket?.paid;
          if (!stage) { results.push({ id: inv.id, action: "paid", ok: false, error: "no paid stage" }); continue; }
          const r = await callBitrix(integration.client_endpoint, token, "crm.item.update", {
            entityTypeId: 31, id: inv.id, fields: { stageId: stage },
          });
          results.push({ id: inv.id, action: "paid", stage, ok: !r.error, error: r.error });
        }
      } catch (e) {
        results.push({ id: inv.id, ok: false, error: String(e) });
      }
    }

    // Optional: create new invoices
    const createList: any[] = body.create_invoices || [];
    for (const spec of createList) {
      try {
        const dealFetch = await callBitrix(integration.client_endpoint, token, "crm.deal.get", { ID: dealId });
        const deal = dealFetch.result || {};
        const contactId = spec.contactId || deal.CONTACT_ID;
        const r = await callBitrix(integration.client_endpoint, token, "crm.item.add", {
          entityTypeId: 31,
          fields: {
            title: spec.title,
            opportunity: spec.amount,
            currencyId: spec.currency || "EUR",
            isManualOpportunity: "Y",
            parentId2: parseInt(dealId, 10),
            categoryId: spec.categoryId || 3,
            contactId: contactId ? parseInt(String(contactId), 10) : undefined,
            begindate: new Date().toISOString().split("T")[0],
            closedate: spec.due_date,
            comments: spec.comments || "",
            UF_CRM_69B83DDB1F59D: 9391,
            UF_CRM_69B83DDB38FF9: spec.payment_url || "",
            UF_CRM_69B83DDB4C552: spec.amount,
            UF_CRM_69B83DDB525C9: spec.due_date,
          },
        });
        const newId = r.result?.item?.id ?? null;
        results.push({ action: "create", ok: !!newId, id: newId, error: r.error, spec });

        if (newId && spec.link_financial_record_id) {
          await supabase.from("financial_records")
            .update({ bitrix24_invoice_id: String(newId) })
            .eq("id", spec.link_financial_record_id);
        }
        if (newId && spec.link_transaction_id) {
          const { data: tx } = await supabase.from("payment_transactions")
            .select("metadata").eq("id", spec.link_transaction_id).maybeSingle();
          const meta = { ...(tx?.metadata || {}), bitrix_invoice_id: newId };
          await supabase.from("payment_transactions").update({ metadata: meta }).eq("id", spec.link_transaction_id);
        }
      } catch (e) {
        results.push({ action: "create", ok: false, error: String(e), spec });
      }
    }

    return new Response(JSON.stringify({ ok: true, results, stagesByCategory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[CLEANUP] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
