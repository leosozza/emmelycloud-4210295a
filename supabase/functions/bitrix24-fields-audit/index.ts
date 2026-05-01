// Auditoria de campos Bitrix24 — extrai metadados completos (multi-idioma) e amostras.
// Endpoint único: GET /bitrix24-fields-audit?action=meta|sample|usage&entity=lead|deal
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callBitrix(endpoint: string, token: string, method: string, params: any = {}): Promise<any> {
  const r = await fetch(`${endpoint}${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await r.json();
}

async function ensureToken(supabase: any, integ: any): Promise<string> {
  const exp = new Date(integ.expires_at).getTime();
  if (exp - Date.now() > 5 * 60 * 1000) return integ.access_token;
  console.log("[AUDIT] refreshing token");
  const r = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integ.refresh_token,
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`refresh: ${d.error_description || d.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
  }).eq("id", integ.id);
  return d.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "meta";
    const entity = url.searchParams.get("entity") || "lead"; // lead | deal
    const start = parseInt(url.searchParams.get("start") || "0");
    const fieldsParam = url.searchParams.get("fields") || ""; // csv

    const { data: integ } = await supabase.from("bitrix24_integrations")
      .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!integ) throw new Error("no integration");
    const token = await ensureToken(supabase, integ);
    const ep = integ.client_endpoint;

    if (action === "meta") {
      // Combinar crm.*.fields + userfield.list (paginar userfield.list)
      const crmMethod = entity === "deal" ? "crm.deal.fields" : "crm.lead.fields";
      const entityId = entity === "deal" ? "CRM_DEAL" : "CRM_LEAD";
      const crmRes = await callBitrix(ep, token, crmMethod);
      // userfield.list paginado
      const userfields: any[] = [];
      let s = 0;
      while (true) {
        const r = await callBitrix(ep, token, "userfield.list", {
          ORDER: { ID: "ASC" },
          FILTER: { ENTITY_ID: entityId },
          start: s,
        });
        if (r.error) throw new Error(`userfield.list: ${r.error_description || r.error}`);
        const batch = r.result || [];
        userfields.push(...batch);
        if (!r.next || batch.length === 0) break;
        s = r.next;
      }
      return new Response(JSON.stringify({ crm: crmRes.result || {}, userfields }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sample") {
      // Fetch chunk: 50 records starting from `start`, only requested fields
      const method = entity === "deal" ? "crm.deal.list" : "crm.lead.list";
      const select = ["ID", "DATE_CREATE", ...fieldsParam.split(",").filter(Boolean)];
      const r = await callBitrix(ep, token, method, {
        order: { ID: "DESC" },
        filter: {},
        select,
        start,
      });
      if (r.error) throw new Error(`${method}: ${r.error_description || r.error}`);
      return new Response(JSON.stringify({ result: r.result || [], next: r.next ?? null, total: r.total ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[AUDIT] err", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
