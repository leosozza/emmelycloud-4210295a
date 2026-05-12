// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    // Verify user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, entity_type, spa_entity_type_id, deal_category_id } = await req.json();
    if (!conversation_id || !entity_type) {
      return new Response(JSON.stringify({ error: "conversation_id and entity_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["lead", "deal", "spa"].includes(entity_type)) {
      return new Response(JSON.stringify({ error: "entity_type must be lead, deal or spa" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load conversation
    const { data: conv, error: cErr } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_phone, contact_lid, contact_email, contact_instagram, channel, bot_state, last_message_preview")
      .eq("id", conversation_id)
      .maybeSingle();
    if (cErr || !conv) throw new Error("Conversation not found");

    // Load active Bitrix24 integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!integration?.client_endpoint) throw new Error("No Bitrix24 integration found");

    const token = await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint;

    let entityId: string | number | null = null;
    let entityLabel = "";
    let deepLinkPath = "";

    if (entity_type === "lead") {
      const fields: any = {
        TITLE: conv.contact_name || "Lead via Atendimento",
        SOURCE_ID: conv.channel === "whatsapp" ? "WHATSAPP" : "OTHER",
        COMMENTS: [conv.last_message_preview || "", conv.contact_lid ? `WhatsApp LID: ${conv.contact_lid}` : ""].filter(Boolean).join("\n"),
      };
      if (conv.contact_phone) fields.PHONE = [{ VALUE: conv.contact_phone, VALUE_TYPE: "WORK" }];
      if (conv.contact_email) fields.EMAIL = [{ VALUE: conv.contact_email, VALUE_TYPE: "WORK" }];
      entityId = await callBitrix(endpoint, token, "crm.lead.add", { fields });
      entityLabel = `Lead #${entityId}`;
      deepLinkPath = `crm/lead/details/${entityId}/`;
    } else if (entity_type === "deal") {
      const fields: any = {
        TITLE: conv.contact_name || "Negócio via Atendimento",
        COMMENTS: conv.last_message_preview || "",
        SOURCE_ID: conv.channel === "whatsapp" ? "WHATSAPP" : "OTHER",
      };
      if (deal_category_id !== undefined && deal_category_id !== null) {
        fields.CATEGORY_ID = deal_category_id;
      }
      entityId = await callBitrix(endpoint, token, "crm.deal.add", { fields });
      entityLabel = `Negócio #${entityId}`;
      deepLinkPath = `crm/deal/details/${entityId}/`;
    } else if (entity_type === "spa") {
      const entityTypeId = spa_entity_type_id || 131; // default SPA
      const fields: any = {
        title: conv.contact_name || "SPA via Atendimento",
      };
      const result: any = await callBitrix(endpoint, token, "crm.item.add", {
        entityTypeId,
        fields,
      });
      entityId = result?.item?.id ?? null;
      entityLabel = `SPA #${entityId}`;
      deepLinkPath = `crm/type/${entityTypeId}/details/${entityId}/`;
    }

    // Update conversation bot_state
    const newBotState = { ...(conv.bot_state as any || {}) };
    if (entity_type === "lead") newBotState.bitrix_lead_id = String(entityId);
    if (entity_type === "deal") newBotState.bitrix_deal_id = String(entityId);
    if (entity_type === "spa") newBotState.bitrix_entity_id = `${spa_entity_type_id || 131}:${entityId}`;

    await supabase
      .from("conversations")
      .update({ bot_state: newBotState })
      .eq("id", conversation_id);

    const portalUrl = endpoint.replace(/\/rest\/.*$/, "");
    const deepLink = `${portalUrl}/${deepLinkPath}`;

    return new Response(
      JSON.stringify({ ok: true, entity_id: entityId, entity_label: entityLabel, deep_link: deepLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[crm-save-from-conversation]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
