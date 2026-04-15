import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const DEFAULT_CONNECTOR_ID = "emmely_connector";

async function callBitrix(clientEndpoint: string, accessToken: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${clientEndpoint}${method}?auth=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
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

  console.log("[TOKEN] Refreshing...");
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

async function ensureConnectorActive(
  clientEndpoint: string,
  accessToken: string,
  lineId: number,
  connectorId: string = DEFAULT_CONNECTOR_ID
): Promise<void> {
  const status = await callBitrix(clientEndpoint, accessToken, "imconnector.status", {
    CONNECTOR: connectorId,
    LINE: lineId,
  });
  console.log("[SEND] imconnector.status for LINE", lineId, "connector", connectorId, ":", JSON.stringify(status).substring(0, 500));

  if (status.error || !status.result?.active_status) {
    console.log("[SEND] Connector not active on LINE", lineId, "- activating...");
    const activateResult = await callBitrix(clientEndpoint, accessToken, "imconnector.activate", {
      CONNECTOR: connectorId,
      LINE: lineId,
      ACTIVE: 1,
    });
    console.log("[SEND] imconnector.activate result:", JSON.stringify(activateResult).substring(0, 500));
  }
}

async function sendWithFallbacks(
  clientEndpoint: string,
  accessToken: string,
  lineId: number,
  contactId: string,
  contactName: string,
  message: string,
  channel: string,
  connectorId: string = DEFAULT_CONNECTOR_ID
): Promise<boolean> {
  // 0. Ensure connector is active on this line
  try {
    await ensureConnectorActive(clientEndpoint, accessToken, lineId, connectorId);
  } catch (e) {
    console.warn("[SEND] ensureConnectorActive failed:", e);
  }

  // 1. Primary: imconnector.send.messages
  const primary = await callBitrix(clientEndpoint, accessToken, "imconnector.send.messages", {
    CONNECTOR: connectorId,
    LINE: lineId,
    MESSAGES: [
      {
        im_id: Date.now().toString(),
        user: {
          id: contactId,
          name: contactName,
        },
        message: {
          text: message,
        },
        chat: {
          id: contactId,
        },
        date: new Date().toISOString(),
      },
    ],
  });

  console.log("[SEND] imconnector.send.messages full response:", JSON.stringify(primary).substring(0, 1000));

  if (!primary.error) {
    console.log("[SEND] imconnector.send.messages success via connector:", connectorId);
    return true;
  }

  console.warn("[SEND] Primary failed:", primary.error, primary.error_description || "", "- trying fallbacks");

  // 2. Fallback: notification
  try {
    await callBitrix(clientEndpoint, accessToken, "im.notify.system.add", {
      USER_ID: 1,
      MESSAGE: `📱 ${channel === "instagram" ? "Instagram" : "WhatsApp"} de ${contactName}: ${message.substring(0, 200)}`,
    });
    console.log("[SEND] Fallback notification sent");
    return true;
  } catch (e) {
    console.error("[SEND] All fallbacks failed:", e);
    return false;
  }
}

async function debugLog(supabase: any, integrationId: string | null, eventType: string, direction: string, payload: any, error?: string) {
  try {
    await supabase.from("bitrix24_debug_logs").insert({
      integration_id: integrationId,
      event_type: eventType,
      direction,
      payload,
      error: error || null,
    });
  } catch (_e) { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { message, contactName, contactId, channel, conversationId, connectorId: reqConnectorId, lineId: reqLineId } = body;

    if (!message || !contactId) {
      return new Response(JSON.stringify({ error: "Missing message or contactId" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    console.log(`[SEND] Sending to Bitrix24: ${channel} / ${contactName} / ${message.substring(0, 50)} connector:${reqConnectorId || "default"}`);

    // Get all active integrations (could be multi-portal in future)
    const { data: integrations } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .eq("connector_active", true);

    if (!integrations || integrations.length === 0) {
      console.log("[SEND] No active Bitrix24 integrations");
      return new Response(JSON.stringify({ ok: true, skipped: "no active integrations" }), {
        headers: jsonHeaders,
      });
    }

    let sentCount = 0;
    const effectiveConnectorId = reqConnectorId || DEFAULT_CONNECTOR_ID;

    for (const integration of integrations) {
      try {
        // If lineId was explicitly provided (from flow connector selector), use it directly
        if (reqLineId) {
          const accessToken = await ensureValidToken(supabase, integration);
          const sent = await sendWithFallbacks(
            integration.client_endpoint,
            accessToken,
            reqLineId,
            contactId,
            contactName || "Cliente",
            message,
            channel || "whatsapp",
            effectiveConnectorId
          );
          if (sent) sentCount++;
          await debugLog(supabase, integration.id, "message_sent_direct_line", "outbound", { lineId: reqLineId, connectorId: effectiveConnectorId, contactId, sent });
          continue;
        }

        // Find channel mapping
        const { data: mapping } = await supabase
          .from("bitrix24_channel_mappings")
          .select("*")
          .eq("integration_id", integration.id)
          .eq("channel", channel || "whatsapp")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!mapping) {
          // Try any active mapping
          const { data: anyMapping } = await supabase
            .from("bitrix24_channel_mappings")
            .select("*")
            .eq("integration_id", integration.id)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!anyMapping) {
            console.log(`[SEND] No mapping for integration ${integration.id}`);
            await debugLog(supabase, integration.id, "no_channel_mapping", "outbound", { channel, contactId });
            continue;
          }

          const accessToken = await ensureValidToken(supabase, integration);
          const mappingConnectorId = anyMapping.connector_id || effectiveConnectorId;
          const sent = await sendWithFallbacks(
            integration.client_endpoint,
            accessToken,
            anyMapping.line_id,
            contactId,
            contactName || "Cliente",
            message,
            channel || "whatsapp",
            mappingConnectorId
          );

          if (sent) sentCount++;
          await debugLog(supabase, integration.id, "message_sent_fallback_mapping", "outbound", { lineId: anyMapping.line_id, connectorId: mappingConnectorId, contactId, sent });
        } else {
          const accessToken = await ensureValidToken(supabase, integration);
          const mappingConnectorId = mapping.connector_id || effectiveConnectorId;
          const sent = await sendWithFallbacks(
            integration.client_endpoint,
            accessToken,
            mapping.line_id,
            contactId,
            contactName || "Cliente",
            message,
            channel || "whatsapp",
            mappingConnectorId
          );

          if (sent) sentCount++;
          await debugLog(supabase, integration.id, "message_sent", "outbound", { lineId: mapping.line_id, connectorId: mappingConnectorId, contactId, sent });
        }
      } catch (intError) {
        console.error(`[SEND] Error for integration ${integration.id}:`, intError);
        await debugLog(supabase, integration.id, "send_error", "outbound", null, String(intError));
      }
    }

    // Register sent message in dedup cache to prevent echo
    const messageImId = Date.now().toString();
    await supabase.from("sync_dedup_cache").upsert({
      entity_type: "message",
      entity_id: conversationId || "unknown",
      external_id: messageImId,
      source: "emmely",
    }, { onConflict: "entity_type,external_id,source" }).then(() => {});

    return new Response(JSON.stringify({ ok: true, sentCount }), { headers: jsonHeaders });
  } catch (error) {
    console.error("[SEND] Fatal error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
