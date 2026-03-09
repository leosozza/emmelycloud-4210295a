import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callBitrix(clientEndpoint: string, accessToken: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${clientEndpoint}${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: accessToken }),
  });
  return await response.json();
}

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    return integration.access_token;
  }

  const response = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`Token refresh: ${data.error}`);

  await supabase
    .from("bitrix24_integrations")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("id", integration.id);

  return data.access_token;
}

interface FieldInfo {
  key: string;
  title: string;
  type: string;
  isRequired: boolean;
  isReadOnly: boolean;
  isMultiple: boolean;
  items?: { ID: string; VALUE: string }[];
}

function parseFields(result: Record<string, any>): FieldInfo[] {
  const fields: FieldInfo[] = [];
  for (const [key, meta] of Object.entries(result)) {
    if (!meta || typeof meta !== "object") continue;
    const m = meta as any;
    fields.push({
      key,
      title: m.formLabel || m.title || m.listLabel || key,
      type: m.type || "string",
      isRequired: m.isRequired === true || m.isRequired === "Y",
      isReadOnly: m.isReadOnly === true || m.isReadOnly === "Y",
      isMultiple: m.isMultiple === true || m.isMultiple === "Y",
      items: m.items || undefined,
    });
  }
  // Sort: required first, then alphabetical
  fields.sort((a, b) => {
    if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return fields;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const entity = url.searchParams.get("entity") || "lead"; // lead, deal, spa
    const spaEntityTypeId = url.searchParams.get("spaEntityTypeId") || "";
    const memberIdParam = url.searchParams.get("member_id") || "";

    // Get integration by member_id or first active
    let integrationQuery = supabase
      .from("bitrix24_integrations")
      .select("*");

    if (memberIdParam) {
      integrationQuery = integrationQuery.eq("member_id", memberIdParam);
    } else {
      integrationQuery = integrationQuery.eq("connector_active", true);
    }

    const { data: integration } = await integrationQuery
      .limit(1)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: "No active Bitrix24 integration", fields: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await ensureValidToken(supabase, integration);

    let apiMethod: string;
    let params: Record<string, any> = {};

    switch (entity) {
      case "deal":
        apiMethod = "crm.deal.fields";
        break;
      case "spa":
        apiMethod = "crm.item.fields";
        if (spaEntityTypeId) params.entityTypeId = parseInt(spaEntityTypeId);
        break;
      case "lead":
      default:
        apiMethod = "crm.lead.fields";
        break;
    }

    console.log(`[FIELDS] Fetching ${apiMethod} with params:`, params);

    const response = await callBitrix(integration.client_endpoint, accessToken, apiMethod, params);

    if (response.error) {
      console.error("[FIELDS] Bitrix error:", response.error, response.error_description);
      return new Response(JSON.stringify({ error: response.error_description || response.error, fields: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // crm.item.fields returns { fields: {...} }, others return { result: {...} }
    const rawFields = entity === "spa" ? (response.result?.fields || response.result || {}) : (response.result || {});
    const fields = parseFields(rawFields);

    console.log(`[FIELDS] Parsed ${fields.length} fields for ${entity}`);

    return new Response(JSON.stringify({ fields, entity }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[FIELDS] Error:", error);
    return new Response(JSON.stringify({ error: String(error), fields: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
