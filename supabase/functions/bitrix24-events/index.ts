import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse PHP-style nested form data (Bitrix24 sends data[MESSAGES][0][message][text] etc.)
// Numeric keys are correctly reconstructed as arrays (not objects with numeric string keys)
function parsePhpStyleBody(bodyText: string): Record<string, any> {
  if (!bodyText) return {};
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};

  function setNestedValue(obj: any, parts: string[], value: string) {
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const nextKey = parts[i + 1];
      const nextIsNumeric = /^\d+$/.test(nextKey);
      if (obj[key] === undefined || obj[key] === null) {
        obj[key] = nextIsNumeric ? [] : {};
      }
      obj = obj[key];
    }
    const lastKey = parts[parts.length - 1];
    if (Array.isArray(obj)) {
      obj[parseInt(lastKey, 10)] = value;
    } else {
      obj[lastKey] = value;
    }
  }

  for (const [key, value] of params.entries()) {
    const parts = key.match(/([^\[\]]+)/g);
    if (parts && parts.length > 1) {
      // Check if root key needs array (next key is numeric)
      if (/^\d+$/.test(parts[1]) && !Array.isArray(data[parts[0]])) {
        data[parts[0]] = data[parts[0]] ? Object.values(data[parts[0]]) : [];
      }
      setNestedValue(data, parts, value);
    } else {
      data[key] = value;
    }
  }
  return data;
}

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) {
    try { return JSON.parse(bodyText); } catch { return {}; }
  }
  return parsePhpStyleBody(bodyText);
}

// Extrair member_id de múltiplas localizações possíveis no payload do Bitrix24
function extractMemberId(data: Record<string, any>): string | null {
  // Ordem de prioridade baseada no thothai
  return (
    data.auth?.member_id ||
    data.auth?.MEMBER_ID ||
    data.member_id ||
    data.MEMBER_ID ||
    data.data?.auth?.member_id ||
    data.data?.PARAMS?.member_id ||
    null
  );
}

const SUPPORTED_EVENTS = [
  "ONIMCONNECTORMESSAGEADD",
  "ONIMCONNECTORDIALOGSTART",
  "ONIMCONNECTORDIALOGFINISH",
  "ONIMCONNECTORSTATUSDELETE",
  "ONIMBOTMESSAGEADD",
  "ONIMBOTJOINOPEN",
  "ONIMBOTWELCOMEMESSAGE",
  "ONIMBOTJOINCHAT",   // Open Lines join event
  "ONCRMDEALUPDATE",   // Deal update — auto-charge on close
  "ONCRMLEADADD",      // Lead created in Bitrix24
  "ONCRMLEADUPDATE",   // Lead updated in Bitrix24
  "ONCRMDYNAMICITEMUPDATE", // Smart Invoice (entityTypeId=31) status changes
  "ONAPPUNINSTALL",    // App uninstalled — cleanup fields
];

// Helper to call Bitrix24 REST API
async function callBitrixApi(
  clientEndpoint: string,
  accessToken: string,
  method: string,
  params: Record<string, any> = {}
): Promise<any> {
  const url = `${clientEndpoint}${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: accessToken }),
  });
  return response.json();
}

// Cleanup all UF_CRM_EMMELY_* fields from Deal and Lead
async function cleanupEmmelyFields(clientEndpoint: string, accessToken: string): Promise<{ deleted: string[] }> {
  const deleted: string[] = [];
  const apis = [
    { name: "Deal", listMethod: "crm.deal.userfield.list", deleteMethod: "crm.deal.userfield.delete" },
    { name: "Lead", listMethod: "crm.lead.userfield.list", deleteMethod: "crm.lead.userfield.delete" },
  ];

  for (const api of apis) {
    try {
      const result = await callBitrixApi(clientEndpoint, accessToken, api.listMethod, {});
      const emmelyFields = (result.result || []).filter(
        (f: any) => f.FIELD_NAME && f.FIELD_NAME.startsWith("UF_CRM_EMMELY_")
      );
      for (const f of emmelyFields) {
        await callBitrixApi(clientEndpoint, accessToken, api.deleteMethod, { id: f.ID });
        deleted.push(`${api.name}:${f.FIELD_NAME}`);
        console.log(`[UNINSTALL] Deleted ${api.name} field ${f.FIELD_NAME}`);
      }
    } catch (err) {
      console.error(`[UNINSTALL] Error cleaning ${api.name} fields:`, err);
    }
  }
  return { deleted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    const event = (data.event || data.EVENT || "").toUpperCase();
    const memberId = extractMemberId(data);

    // Log completo para debugging
    console.log("[EVENTS] Event:", event, "| member_id:", memberId);
    console.log("[EVENTS] Full payload:", JSON.stringify(data).substring(0, 1000));

    // Sempre responder "successfully" imediatamente (< 200ms)
    if (!event) {
      console.log("[EVENTS] No event in payload, ignoring");
      return new Response("successfully", {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (!memberId) {
      console.error("[EVENTS] No member_id found! payload keys:", Object.keys(data).join(", "));
      // Mesmo sem member_id, enfileirar — o worker irá tentar encontrar a integração pelo payload
    }

    // Handle ONAPPUNINSTALL directly (don't queue — cleanup immediately)
    if (event === "ONAPPUNINSTALL" && memberId) {
      console.log("[EVENTS] App uninstall detected for member:", memberId);

      // Find integration to get tokens
      const { data: integration } = await supabase
        .from("bitrix24_integrations")
        .select("id, client_endpoint, access_token")
        .eq("member_id", memberId)
        .maybeSingle();

      if (integration?.client_endpoint && integration?.access_token) {
        const cleanupResult = await cleanupEmmelyFields(integration.client_endpoint, integration.access_token);
        console.log("[UNINSTALL] Cleanup result:", JSON.stringify(cleanupResult));

        // Mark integration as inactive
        await supabase
          .from("bitrix24_integrations")
          .update({ connector_active: false, connector_registered: false })
          .eq("id", integration.id);

        console.log("[UNINSTALL] Integration marked as inactive:", integration.id);
      } else {
        console.error("[UNINSTALL] No integration found for member:", memberId);
      }

      return new Response("successfully", {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Enfileirar eventos suportados
    if (SUPPORTED_EVENTS.includes(event)) {
      // Dedup: check if this exact event was recently processed
      const eventEntityId = data.data?.FIELDS?.ID || data.data?.PARAMS?.ID || "";
      if (eventEntityId && memberId) {
        const dedupKey = `${event}_${memberId}_${eventEntityId}`;
        const { data: dedupHit } = await supabase
          .from("sync_dedup_cache")
          .select("id")
          .eq("entity_type", "crm_event")
          .eq("external_id", dedupKey)
          .eq("source", "bitrix24")
          .maybeSingle();
        if (dedupHit) {
          console.log("[EVENTS] Dedup: skipping duplicate event:", dedupKey);
          return new Response("successfully", {
            headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        // Register event in dedup cache
        await supabase.from("sync_dedup_cache").upsert({
          entity_type: "crm_event",
          entity_id: String(eventEntityId),
          external_id: dedupKey,
          source: "bitrix24",
        }, { onConflict: "entity_type,external_id,source" }).then(() => {});
      }

      const { error: insertError } = await supabase.from("bitrix_event_queue").insert({
        event_type: event,
        member_id: memberId,  // pode ser null — o worker também tenta pelo domain/payload
        payload: data,
        status: "pending",
      });

      if (insertError) {
        console.error("[EVENTS] Queue insert error:", insertError);
      } else {
        console.log("[EVENTS] Queued:", event, "member:", memberId);

        // Fire-and-forget: trigger worker
        fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ trigger: "event", event_type: event }),
        }).catch((e) => console.error("[EVENTS] Worker trigger error:", e));
      }
    } else {
      console.log("[EVENTS] Unsupported event, ignoring:", event);
    }

    return new Response("successfully", {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("[EVENTS] Error:", error);
    return new Response("successfully", {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
