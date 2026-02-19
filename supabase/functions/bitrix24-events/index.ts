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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

        // Find channel mapping
        const { data: mapping } = await supabase
          .from("bitrix24_channel_mappings")
          .select("*")
          .eq("integration_id", integration.id)
          .eq("line_id", line)
          .eq("is_active", true)
          .maybeSingle();

        const channel = mapping?.channel || "whatsapp";

        // Find the conversation user info
        const chatUser = msg.user || msg.USER || {};
        const userId = chatUser.id || chatUser.ID || "";
        const userName = chatUser.name || chatUser.NAME || "Operador";

        if (userId) {
          // Try to find conversation by external contact info
          const { data: conversation } = await supabase
            .from("conversations")
            .select("id, contact_phone, contact_instagram, channel")
            .or(`contact_phone.eq.${userId},contact_instagram.eq.${userId}`)
            .maybeSingle();

          if (conversation) {
            // Send via unified message-send (direct Meta API)
            try {
              const sendRes = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  conversation_id: conversation.id,
                  content: messageText,
                }),
              });

              const sendResult = await sendRes.json();
              console.log("[EVENTS] message-send result:", JSON.stringify(sendResult));

              // Send delivery status back to Bitrix24
              const accessToken = await ensureValidToken(supabase, integration);
              await callBitrix(integration.client_endpoint, accessToken, "imconnector.send.status.delivery", {
                CONNECTOR: CONNECTOR_ID,
                LINE: line,
                MESSAGES: [{ im_id: messageId, date: new Date().toISOString() }],
              });

              await debugLog(supabase, integration.id, "message_forwarded_direct", "outbound", {
                messageText: messageText.substring(0, 100),
                conversationId: conversation.id,
                channel: conversation.channel,
              });
            } catch (sendError) {
              console.error("[EVENTS] message-send error:", sendError);
              await debugLog(supabase, integration.id, "message_send_error", "outbound", null, String(sendError));
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

    // Handle ONIMBOTMESSAGEADD - bot receives a message in Bitrix24
    if (event === "ONIMBOTMESSAGEADD" || event === "OnImBotMessageAdd") {
      const msgData = data.data || {};
      const messageText = msgData.PARAMS?.MESSAGE || msgData.message || "";
      const dialogId = msgData.PARAMS?.DIALOG_ID || msgData.dialog_id || "";
      const chatId = msgData.PARAMS?.CHAT_ID || msgData.chat_id || "";
      const fromUserId = msgData.PARAMS?.FROM_USER_ID || "";

      if (!messageText) {
        return new Response(JSON.stringify({ ok: true, skipped: "no message" }), { headers: jsonHeaders });
      }

      // Skip bot's own messages
      if (isBotMessage(messageText)) {
        return new Response(JSON.stringify({ ok: true, skipped: "bot_self" }), { headers: jsonHeaders });
      }

      console.log("[EVENTS] Bot message received:", messageText.substring(0, 100), "dialogId:", dialogId);

      // Find agent: prefer bitrix_agent_id from integration, fallback to default
      let agent: any = null;
      if (integration.bitrix_agent_id) {
        const { data: specificAgent } = await supabase
          .from("ai_agents")
          .select("id, welcome_message")
          .eq("id", integration.bitrix_agent_id)
          .eq("is_active", true)
          .maybeSingle();
        agent = specificAgent;
      }
      if (!agent) {
        const { data: defaultAgent } = await supabase
          .from("ai_agents")
          .select("id, welcome_message")
          .eq("is_default", true)
          .eq("is_active", true)
          .maybeSingle();
        agent = defaultAgent;
      }

      if (!agent) {
        console.log("[EVENTS] No active agent found, skipping bot reply");
        await debugLog(supabase, integration.id, "bot_no_agent", "inbound", { messageText: messageText.substring(0, 100) });
        return new Response(JSON.stringify({ ok: true, skipped: "no_agent" }), { headers: jsonHeaders });
      }

      // Call ai-process-message to generate response
      try {
        const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            conversation_id: null, // No conversation for Bitrix24 internal chat
            message_text: messageText,
            agent_id: agent.id,
            skip_send: true,
          }),
        });

        const aiResult = await aiRes.json();
        const replyText = aiResult.reply || aiResult.content || "Desculpe, não consegui processar a sua mensagem.";

        console.log("[EVENTS] AI reply generated:", replyText.substring(0, 100));

        // Send reply back to Bitrix24 chat via im.message.add
        const accessToken = await ensureValidToken(supabase, integration);
        const sendResult = await callBitrix(integration.client_endpoint, accessToken, "im.message.add", {
          DIALOG_ID: dialogId || chatId,
          MESSAGE: replyText,
        });

        console.log("[EVENTS] im.message.add result:", JSON.stringify(sendResult));

        await debugLog(supabase, integration.id, "bot_reply_sent", "outbound", {
          dialogId, chatId, fromUserId,
          messageText: messageText.substring(0, 100),
          replyText: replyText.substring(0, 100),
          agentId: agent.id,
        });
      } catch (aiError) {
        console.error("[EVENTS] Bot AI reply error:", aiError);
        await debugLog(supabase, integration.id, "bot_reply_error", "outbound", {
          dialogId, chatId, messageText: messageText.substring(0, 100),
        }, String(aiError));
      }

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    // Handle ONIMBOTWELCOMEMESSAGE - bot welcome message when user starts chat
    if (event === "ONIMBOTWELCOMEMESSAGE" || event === "OnImBotWelcomeMessage") {
      const msgData = data.data || {};
      const dialogId = msgData.PARAMS?.DIALOG_ID || msgData.dialog_id || "";
      const chatId = msgData.PARAMS?.CHAT_ID || msgData.chat_id || "";

      console.log("[EVENTS] Welcome message requested, dialogId:", dialogId);

      // Find agent: prefer bitrix_agent_id, fallback to default
      let agent: any = null;
      if (integration.bitrix_agent_id) {
        const { data: specificAgent } = await supabase
          .from("ai_agents")
          .select("welcome_message")
          .eq("id", integration.bitrix_agent_id)
          .eq("is_active", true)
          .maybeSingle();
        agent = specificAgent;
      }
      if (!agent) {
        const { data: defaultAgent } = await supabase
          .from("ai_agents")
          .select("welcome_message")
          .eq("is_default", true)
          .eq("is_active", true)
          .maybeSingle();
        agent = defaultAgent;
      }

      const welcomeText = agent?.welcome_message || "Olá! Sou a Emmely, a sua assistente virtual. Como posso ajudar?";

      try {
        const accessToken = await ensureValidToken(supabase, integration);
        const sendResult = await callBitrix(integration.client_endpoint, accessToken, "im.message.add", {
          DIALOG_ID: dialogId || chatId,
          MESSAGE: welcomeText,
        });
        console.log("[EVENTS] Welcome message sent:", JSON.stringify(sendResult));
        await debugLog(supabase, integration.id, "bot_welcome_sent", "outbound", { dialogId, chatId, welcomeText: welcomeText.substring(0, 100) });
      } catch (welcomeError) {
        console.error("[EVENTS] Welcome message error:", welcomeError);
        await debugLog(supabase, integration.id, "bot_welcome_error", "outbound", { dialogId, chatId }, String(welcomeError));
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
