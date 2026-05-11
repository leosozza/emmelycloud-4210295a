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

async function activateSilentMode(
  clientEndpoint: string,
  accessToken: string,
  chatId: string,
  activate: boolean
): Promise<void> {
  const result = await callBitrix(clientEndpoint, accessToken, "imopenlines.session.mode.silent", {
    CHAT_ID: chatId,
    ACTIVATE: activate ? "Y" : "N",
  });
  console.log(`[SEND] Silent mode ${activate ? "ON" : "OFF"} for chat ${chatId}:`, JSON.stringify(result).substring(0, 300));
}

async function getDialogChatId(
  clientEndpoint: string,
  accessToken: string,
  contactId: string,
  connectorId: string,
  lineId: number
): Promise<string | null> {
  // Try imopenlines.dialog.get with USER_ID derived from contactId
  const result = await callBitrix(clientEndpoint, accessToken, "imopenlines.dialog.get", {
    CHAT_ID: contactId,
    CONNECTOR: connectorId,
    LINE: lineId,
  });
  console.log("[SEND] imopenlines.dialog.get:", JSON.stringify(result).substring(0, 500));
  return result?.result?.CHAT_ID || result?.result?.chat_id || null;
}

async function setChatName(
  clientEndpoint: string,
  accessToken: string,
  lineId: number,
  contactId: string,
  agentName: string,
  connectorId: string = DEFAULT_CONNECTOR_ID
): Promise<void> {
  const result = await callBitrix(clientEndpoint, accessToken, "imconnector.chat.name.set", {
    CONNECTOR: connectorId,
    LINE: lineId,
    CHAT_ID: contactId,
    NAME: agentName,
  });
  console.log(`[SEND] imconnector.chat.name.set to "${agentName}":`, JSON.stringify(result).substring(0, 300));
}

async function sendWithFallbacks(
  clientEndpoint: string,
  accessToken: string,
  lineId: number,
  contactId: string,
  contactName: string,
  message: string,
  channel: string,
  connectorId: string = DEFAULT_CONNECTOR_ID,
  options: {
    silent?: boolean;
    agentName?: string;
    contactPhone?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaFilename?: string;
    mediaMime?: string;
  } = {}
): Promise<boolean> {
  // 0. Ensure connector is active on this line
  try {
    await ensureConnectorActive(clientEndpoint, accessToken, lineId, connectorId);
  } catch (e) {
    console.warn("[SEND] ensureConnectorActive failed:", e);
  }

  // 0.5. Set chat name if agentName provided
  if (options.agentName) {
    try {
      await setChatName(clientEndpoint, accessToken, lineId, contactId, options.agentName, connectorId);
    } catch (e) {
      console.warn("[SEND] setChatName failed:", e);
    }
  }

  // 0.6. Activate silent mode if requested
  let chatIdForSilent: string | null = null;
  if (options.silent) {
    try {
      chatIdForSilent = await getDialogChatId(clientEndpoint, accessToken, contactId, connectorId, lineId);
      if (chatIdForSilent) {
        await activateSilentMode(clientEndpoint, accessToken, chatIdForSilent, true);
      } else {
        console.warn("[SEND] Could not get CHAT_ID for silent mode, sending normally");
      }
    } catch (e) {
      console.warn("[SEND] Silent mode activation failed:", e);
    }
  }

  // Build user object — include phone (E.164) when available so Bitrix24 can match
  // existing CRM Contact + Deal automatically (skip_phone_validate avoids format errors).
  const userObj: Record<string, any> = {
    id: contactId,
    name: contactName,
  };
  if (options.contactPhone) {
    const digits = options.contactPhone.replace(/[^0-9]/g, "");
    if (digits) {
      userObj.phone = `+${digits}`;
      userObj.skip_phone_validate = "Y";
    }
  }

  // Build message object — attach files when media URL is present.
  // Bitrix imconnector expects { url, name } per file (NOT link/type/mime),
  // otherwise the file is silently dropped and the message renders as
  // "[Mensagem não suportada]" in the Open Channel.
  const messageObj: Record<string, any> = {
    id: `ext-${Date.now()}`,
    date: Math.floor(Date.now() / 1000),
    text: message || "",
  };
  if (options.mediaUrl && /^https?:\/\//i.test(options.mediaUrl)) {
    // Default filename based on media type/mime so audio/image render correctly
    let defaultName = "arquivo";
    if (options.mediaType === "audio") defaultName = "audio.ogg";
    else if (options.mediaType === "image") defaultName = "imagem.jpg";
    else if (options.mediaType === "video") defaultName = "video.mp4";
    else if (options.mediaType === "document") defaultName = "documento";
    messageObj.files = [{
      url: options.mediaUrl,
      name: options.mediaFilename || defaultName,
    }];
  }

  // 1. Primary: imconnector.send.messages
  const primary = await callBitrix(clientEndpoint, accessToken, "imconnector.send.messages", {
    CONNECTOR: connectorId,
    LINE: lineId,
    MESSAGES: [
      {
        im_id: Date.now().toString(),
        user: userObj,
        message: messageObj,
        chat: {
          id: contactId,
        },
        date: new Date().toISOString(),
      },
    ],
  });

  console.log("[SEND] imconnector.send.messages full response:", JSON.stringify(primary).substring(0, 1000));

  // Deactivate silent mode after sending
  if (options.silent && chatIdForSilent) {
    try {
      await activateSilentMode(clientEndpoint, accessToken, chatIdForSilent, false);
    } catch (e) {
      console.warn("[SEND] Silent mode deactivation failed:", e);
    }
  }

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
    const { message, contactName, contactId, contactPhone, channel, conversationId, connectorId: reqConnectorId, lineId: reqLineId, silent, agentName, instanceId, mediaUrl, mediaType, mediaFilename, mediaMime } = body;

    // Resolve mapping_id from instance (1:1 instance ↔ Open Line)
    let resolvedMappingId: string | null = null;
    let resolvedLineId: number | null = reqLineId || null;
    if (instanceId && !reqLineId) {
      const { data: inst } = await supabase
        .from("channel_instances")
        .select("config")
        .eq("id", instanceId)
        .maybeSingle();
      const cfg = (inst?.config || {}) as Record<string, any>;
      resolvedMappingId = cfg.bitrix24_mapping_id || null;
      if (resolvedMappingId) {
        const { data: mp } = await supabase
          .from("bitrix24_channel_mappings")
          .select("line_id, connector_id, is_active")
          .eq("id", resolvedMappingId)
          .maybeSingle();
        if (mp?.is_active && mp.line_id) {
          resolvedLineId = mp.line_id;
        } else {
          resolvedMappingId = null;
        }
      }
      if (!resolvedLineId) {
        console.log(`[SEND] Instance ${instanceId} has no active Bitrix24 mapping — skipping`);
        return new Response(JSON.stringify({ ok: true, skipped: "instance_not_linked_to_open_line", instanceId }), {
          headers: jsonHeaders,
        });
      }
    }

    // Allow media-only messages (no text) when a mediaUrl is provided
    if ((!message && !mediaUrl) || !contactId) {
      return new Response(JSON.stringify({ error: "Missing message/media or contactId" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    console.log(`[SEND] Sending to Bitrix24: ${channel} / ${contactName} / ${message.substring(0, 50)} connector:${reqConnectorId || "default"} silent:${!!silent} agent:${agentName || "none"}`);

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
    const sendOptions = {
      silent: !!silent,
      agentName: agentName || undefined,
      contactPhone: contactPhone || undefined,
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaType || undefined,
      mediaFilename: mediaFilename || undefined,
      mediaMime: mediaMime || undefined,
    };

    for (const integration of integrations) {
      try {
        // 1. lineId explícito (selector de fluxo) ou já resolvido via instanceId
        if (resolvedLineId) {
          const accessToken = await ensureValidToken(supabase, integration);
          const sent = await sendWithFallbacks(
            integration.client_endpoint,
            accessToken,
            resolvedLineId,
            contactId,
            contactName || "Cliente",
            message,
            channel || "whatsapp",
            effectiveConnectorId,
            sendOptions
          );
          if (sent) sentCount++;
          await debugLog(supabase, integration.id, "message_sent_resolved_line", "outbound", {
            lineId: resolvedLineId,
            connectorId: effectiveConnectorId,
            contactId,
            instanceId: instanceId || null,
            mappingId: resolvedMappingId,
            sent,
          });
          continue;
        }

        // 2. Sem instanceId nem lineId — procurar mapeamento exato pelo canal
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
          console.log(`[SEND] No active mapping for integration ${integration.id} channel ${channel}`);
          await debugLog(supabase, integration.id, "no_channel_mapping", "outbound", { channel, contactId, instanceId: instanceId || null });
          continue;
        }

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
          mappingConnectorId,
          sendOptions
        );

        if (sent) sentCount++;
        await debugLog(supabase, integration.id, "message_sent", "outbound", { lineId: mapping.line_id, connectorId: mappingConnectorId, contactId, sent });
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
