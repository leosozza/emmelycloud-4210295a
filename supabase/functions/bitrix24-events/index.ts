import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const CONNECTOR_ID = "emmely_connector";

// Bot message detection patterns
const BOT_PATTERNS = [
  "[b]EmmelyAI",
  "EmmelyAI -",
  "*EmmelyAI",
  "[Assistente]",
  "[b]Emmely",
  "Emmely Cloud",
];

function isBotMessage(text: string): boolean {
  return BOT_PATTERNS.some((p) => text.includes(p) || text.startsWith(p));
}

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) return JSON.parse(bodyText);
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    const match = key.match(/^(\w+)\[(\w+)\]$/);
    if (match) {
      if (!data[match[1]]) data[match[1]] = {};
      data[match[1]][match[2]] = value;
    } else {
      data[key] = value;
    }
  }
  return data;
}

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

  console.log("[TOKEN] Refreshing access_token...");
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
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }

  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase
    .from("bitrix24_integrations")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("id", integration.id);

  return data.access_token;
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    console.log("[EVENTS] Received:", JSON.stringify(data).substring(0, 500));

    const event = data.event || "";
    const memberId = data.auth?.member_id || data.member_id;

    if (!memberId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no member_id" }), { headers: jsonHeaders });
    }

    // Find integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .eq("member_id", memberId)
      .single();

    if (!integration) {
      console.error("[EVENTS] Integration not found for member_id:", memberId);
      return new Response(JSON.stringify({ ok: true, skipped: "integration not found" }), { headers: jsonHeaders });
    }

    await debugLog(supabase, integration.id, `event_${event}`, "inbound", data);

    // Handle OnImConnectorMessageAdd - operator sends message in Bitrix24
    if (event === "OnImConnectorMessageAdd" || event === "ONIMCONNECTORMESSAGEADD") {
      const eventData = data.data || {};
      const connector = eventData.CONNECTOR || "";
      const line = eventData.LINE || 0;
      const messages = eventData.MESSAGES || [];

      if (connector !== CONNECTOR_ID) {
        return new Response(JSON.stringify({ ok: true, skipped: "wrong connector" }), { headers: jsonHeaders });
      }

      for (const msg of messages) {
        const messageText = msg.message?.text || msg.MESSAGE?.TEXT || "";
        const messageId = msg.im_id || msg.ID || "";

        if (!messageText) continue;

        // Check if bot message
        if (isBotMessage(messageText)) {
          console.log("[EVENTS] Skipping bot message:", messageText.substring(0, 50));

          // Send delivery status only
          try {
            const accessToken = await ensureValidToken(supabase, integration);
            await callBitrix(integration.client_endpoint, accessToken, "imconnector.send.status.delivery", {
              CONNECTOR: CONNECTOR_ID,
              LINE: line,
              MESSAGES: [{ im_id: messageId, date: new Date().toISOString() }],
            });
          } catch (e) {
            console.error("[EVENTS] Delivery status error:", e);
          }
          continue;
        }

        // Find channel mapping to determine which channel to send to
        const { data: mapping } = await supabase
          .from("bitrix24_channel_mappings")
          .select("*")
          .eq("integration_id", integration.id)
          .eq("line_id", line)
          .eq("is_active", true)
          .maybeSingle();

        const channel = mapping?.channel || "whatsapp";

        // Find the conversation in Emmely that corresponds to this Bitrix24 chat
        // We use the external chat user info to find the contact
        const chatUser = msg.user || msg.USER || {};
        const userId = chatUser.id || chatUser.ID || "";
        const userName = chatUser.name || chatUser.NAME || "Operador";

        // For now, log the outbound message and route to Callbell
        const callbellToken = Deno.env.get("CALLBELL_API_TOKEN");
        if (callbellToken && userId) {
          // Try to find conversation by external contact info
          // The userId from Bitrix events is the external user ID we set when sending messages
          const { data: conversation } = await supabase
            .from("conversations")
            .select("id, contact_phone, contact_instagram, channel")
            .or(`contact_phone.eq.${userId},contact_instagram.eq.${userId}`)
            .maybeSingle();

          if (conversation) {
            // Send via Callbell
            const cbBody: any = {
              to: conversation.contact_phone || conversation.contact_instagram,
              from: "whatsapp",
              type: "text",
              content: { text: messageText },
            };

            try {
              const cbResponse = await fetch("https://api.callbell.eu/v1/messages/send", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${callbellToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(cbBody),
              });
              const cbResult = await cbResponse.json();
              console.log("[EVENTS] Callbell send result:", JSON.stringify(cbResult));

              // Save outbound message in Emmely
              await supabase.from("messages").insert({
                conversation_id: conversation.id,
                direction: "outbound",
                content: messageText,
                sender_name: userName,
                external_id: `bx_${messageId}`,
              });

              // Send delivery status back to Bitrix24
              const accessToken = await ensureValidToken(supabase, integration);
              await callBitrix(integration.client_endpoint, accessToken, "imconnector.send.status.delivery", {
                CONNECTOR: CONNECTOR_ID,
                LINE: line,
                MESSAGES: [{ im_id: messageId, date: new Date().toISOString() }],
              });

              await debugLog(supabase, integration.id, "message_forwarded_to_callbell", "outbound", {
                messageText: messageText.substring(0, 100),
                conversationId: conversation.id,
                channel,
              });
            } catch (cbError) {
              console.error("[EVENTS] Callbell send error:", cbError);
              await debugLog(supabase, integration.id, "callbell_send_error", "outbound", null, String(cbError));
            }
          } else {
            console.log("[EVENTS] No matching conversation found for userId:", userId);
            await debugLog(supabase, integration.id, "no_conversation_match", "outbound", { userId, messageText: messageText.substring(0, 100) });
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    // Handle OnImConnectorStatusDelete - connector deactivated
    if (event === "OnImConnectorStatusDelete" || event === "ONIMCONNECTORSTATUSDELETE") {
      const connector = data.data?.CONNECTOR || "";
      const line = data.data?.LINE || 0;

      if (connector === CONNECTOR_ID) {
        await supabase
          .from("bitrix24_channel_mappings")
          .update({ is_active: false })
          .eq("integration_id", integration.id)
          .eq("line_id", line);

        await debugLog(supabase, integration.id, "connector_deactivated", "inbound", { line });
      }

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    // Other events - just log
    return new Response(JSON.stringify({ ok: true, event }), { headers: jsonHeaders });
  } catch (error) {
    console.error("[EVENTS] Fatal error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
