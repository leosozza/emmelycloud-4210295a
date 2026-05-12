// deno-lint-ignore-file no-explicit-any
// For every conversation that has a linked Bitrix24 deal (bot_state.bitrix_deal_id)
// and a known contact_phone, fetch the deal's contact and add the phone if missing.
//
// POST { dry_run?: boolean, limit?: number, force?: boolean, conversation_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return integration.access_token;
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
  if (data.error) throw new Error(`Token refresh: ${data.error_description || data.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return data.access_token;
}

async function callBitrix(endpoint: string, token: string, method: string, params: any) {
  const url = endpoint.endsWith("/") ? endpoint : endpoint + "/";
  const res = await fetch(`${url}${method}.json?auth=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${method}: ${data.error_description || data.error}`);
  return data.result;
}

const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let dryRun = false;
    let limit = 1000;
    let force = false;
    let conversationId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        dryRun = body?.dry_run === true || body?.dry_run === 1;
        force = body?.force === true || body?.force === 1;
        if (body?.limit) limit = Number(body.limit);
        if (body?.conversation_id) conversationId = String(body.conversation_id);
      } catch (_) {}
    }
    const url = new URL(req.url);
    if (url.searchParams.get("dry_run") === "1") dryRun = true;
    if (url.searchParams.get("force") === "1") force = true;
    if (url.searchParams.get("limit")) limit = Number(url.searchParams.get("limit"));
    if (url.searchParams.get("conversation_id")) conversationId = url.searchParams.get("conversation_id");

    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!integration?.client_endpoint) throw new Error("No Bitrix24 integration found");
    const token = await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint;

    let q = supabase
      .from("conversations")
      .select("id, contact_phone, contact_name, bot_state")
      .not("contact_phone", "is", null);
    if (conversationId) q = q.eq("id", conversationId);
    else q = q.limit(limit);
    const { data: convs, error } = await q;
    if (error) throw error;

    const todo = (convs || []).filter((c: any) => {
      const dealId = c.bot_state?.bitrix_deal_id;
      const phone = onlyDigits(c.contact_phone);
      return dealId && phone.length >= 8;
    });

    const results: any[] = [];
    let updated = 0, skipped = 0, errors = 0;

    for (const conv of todo) {
      const dealId = conv.bot_state.bitrix_deal_id;
      const phone = String(conv.contact_phone);
      try {
        const deal: any = await callBitrix(endpoint, token, "crm.deal.get", { id: dealId });
        const contactId = deal?.CONTACT_ID;
        if (!contactId) {
          skipped++;
          results.push({ conv: conv.id, deal_id: dealId, reason: "no_contact" });
          continue;
        }
        const contact: any = await callBitrix(endpoint, token, "crm.contact.get", { id: contactId });
        const existing: any[] = Array.isArray(contact?.PHONE) ? contact.PHONE : [];
        const has = existing.some((p) => onlyDigits(p?.VALUE).endsWith(onlyDigits(phone).slice(-8)));
        if (has && !force) {
          skipped++;
          results.push({ conv: conv.id, deal_id: dealId, contact_id: contactId, reason: "already_has_phone" });
          continue;
        }
        if (!dryRun) {
          const newPhones = has
            ? existing
            : [...existing, { VALUE: phone, VALUE_TYPE: "MOBILE" }];
          await callBitrix(endpoint, token, "crm.contact.update", {
            id: contactId,
            fields: { PHONE: newPhones },
          });
        }
        updated++;
        results.push({ conv: conv.id, deal_id: dealId, contact_id: contactId, phone, action: dryRun ? "would_update" : "updated" });
      } catch (e: any) {
        errors++;
        results.push({ conv: conv.id, deal_id: dealId, error: e?.message || String(e) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        processed: todo.length,
        updated,
        skipped,
        errors,
        sample: results.slice(0, 50),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[BACKFILL-DEAL-PHONES]", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
