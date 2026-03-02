import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONNECTOR_ID = "emmely_connector";

const BOT_PATTERNS = [
  "[b]EmmelyAI", "EmmelyAI -", "*EmmelyAI",
  "[Assistente]", "[b]Emmely", "Emmely Cloud",
];

function isBotMessage(text: string): boolean {
  return BOT_PATTERNS.some((p) => text.includes(p) || text.startsWith(p));
}

// Strip BBCode for WhatsApp/Instagram
function stripBBCode(text: string): string {
  return text
    .replace(/\[b\](.*?)\[\/b\]/g, "*$1*")
    .replace(/\[i\](.*?)\[\/i\]/g, "_$1_")
    .replace(/\[s\](.*?)\[\/s\]/g, "~$1~")
    .replace(/\[url=(.*?)\](.*?)\[\/url\]/g, "$2 ($1)")
    .replace(/\[br\]/g, "\n")
    .replace(/\[\/?[^\]]+\]/g, "");
}

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

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

  integration.access_token = data.access_token;
  return data.access_token;
}

async function debugLog(supabase: any, integrationId: string | null, eventType: string, direction: string, payload: any, error?: string) {
  await supabase.from("bitrix24_debug_logs").insert({
    integration_id: integrationId,
    event_type: eventType,
    direction,
    payload,
    error: error || null,
  }).catch(() => {});
}

// ─── Bitrix24 Configurable Activity Badge Helper ───

interface BadgeParams {
  supabase: any;
  conversationId?: string;
  channel?: string;
  badgeCode: string;
  headerTitle: string;
  messagePreview?: string;
  instanceName?: string;
  extraBlocks?: Record<string, any>;
}

async function createBitrixBadgeActivity(params: BadgeParams): Promise<void> {
  const { supabase, conversationId, channel, badgeCode, headerTitle, messagePreview, instanceName, extraBlocks } = params;

  try {
    // Find active integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!integration || !integration.client_endpoint) {
      console.log("[BADGE] No active Bitrix24 integration found, skipping badge");
      return;
    }

    const accessToken = await ensureValidToken(supabase, integration);

    // Resolve entity (Lead/Deal) from conversation
    let ownerTypeId = 1; // Lead
    let ownerId = 0;

    if (conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("bot_state, contact_phone, contact_instagram, contact_email")
        .eq("id", conversationId)
        .single();

      if (conv) {
        const botState = (conv.bot_state as any) || {};

        // 1. Check cached entity
        if (botState.bitrix_entity_id) {
          const parts = String(botState.bitrix_entity_id).split(":");
          if (parts.length === 2) {
            ownerTypeId = parseInt(parts[0]) || 1;
            ownerId = parseInt(parts[1]) || 0;
          } else {
            ownerId = parseInt(parts[0]) || 0;
          }
        }

        // 2. Search by phone in Bitrix24
        if (!ownerId && conv.contact_phone) {
          const phone = conv.contact_phone.replace(/\D/g, "");
          if (phone.length >= 8) {
            const leadSearch = await callBitrix(integration.client_endpoint, accessToken, "crm.lead.list", {
              filter: { PHONE: phone },
              select: ["ID"],
            });
            const leads = leadSearch.result || [];
            if (leads.length > 0) {
              ownerTypeId = 1;
              ownerId = parseInt(leads[0].ID);
              // Cache for future
              await supabase.from("conversations").update({
                bot_state: { ...botState, bitrix_entity_id: `1:${ownerId}` },
              }).eq("id", conversationId);
            }
          }
        }

        // 3. Search contact by phone
        if (!ownerId && conv.contact_phone) {
          const phone = conv.contact_phone.replace(/\D/g, "");
          if (phone.length >= 8) {
            const contactSearch = await callBitrix(integration.client_endpoint, accessToken, "crm.contact.list", {
              filter: { PHONE: phone },
              select: ["ID"],
            });
            const contacts = contactSearch.result || [];
            if (contacts.length > 0) {
              ownerTypeId = 3; // Contact
              ownerId = parseInt(contacts[0].ID);
              await supabase.from("conversations").update({
                bot_state: { ...botState, bitrix_entity_id: `3:${ownerId}` },
              }).eq("id", conversationId);
            }
          }
        }
      }
    }

    if (!ownerId) {
      console.log("[BADGE] No CRM entity found for conversation, skipping badge");
      return;
    }

    // Build layout
    const bodyBlocks: Record<string, any> = {};

    if (channel) {
      bodyBlocks.channel = {
        type: "text",
        properties: { value: channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : channel },
      };
    }

    if (messagePreview) {
      bodyBlocks.message = {
        type: "largeText",
        properties: { value: messagePreview.substring(0, 200) },
      };
    }

    if (instanceName && instanceName !== "env-fallback" && instanceName !== "none") {
      bodyBlocks.instance = {
        type: "text",
        properties: { value: instanceName },
      };
    }

    if (extraBlocks) {
      Object.assign(bodyBlocks, extraBlocks);
    }

    const layout: any = {
      icon: { code: "chat" },
      header: { title: headerTitle },
      body: {
        logo: { code: "robot" },
        blocks: bodyBlocks,
      },
    };

    // Add footer with "Ver Conversa" button if we have a conversationId
    if (conversationId) {
      layout.footer = {
        buttons: {
          openConversation: {
            title: "Ver Conversa",
            action: {
              type: "openRestApp",
              actionParams: { conversationId },
            },
            type: "primary",
          },
        },
      };
    }

    const activityResult = await callBitrix(integration.client_endpoint, accessToken, "crm.activity.configurable.add", {
      ownerTypeId,
      ownerId,
      fields: {
        completed: false,
        isIncomingChannel: "N",
        responsibleId: 1,
        badgeCode,
      },
      layout,
    });

    if (activityResult.error) {
      console.error(`[BADGE] crm.activity.configurable.add error:`, activityResult.error, activityResult.error_description);
    } else {
      console.log(`[BADGE] Activity created: ${badgeCode} for ${ownerTypeId}:${ownerId}, activityId:`, activityResult.result);
    }

    await debugLog(supabase, integration.id, "badge_activity_created", "outbound", {
      badgeCode, ownerTypeId, ownerId, activityId: activityResult.result,
      error: activityResult.error || null,
    });
  } catch (e) {
    console.error("[BADGE] Error creating badge activity:", e);
  }
}

// ─── Event Handlers ───

async function handleConnectorMessage(supabase: any, integration: any, payload: any) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const eventData = payload.data || {};
  const connector = eventData.CONNECTOR || "";
  const line = eventData.LINE || 0;
  const messages = eventData.MESSAGES || {};

  // Aceita mensagens de qualquer conector (emmely_connector ou outros configurados no Contact Center)
  console.log("[WORKER] Processing connector message from:", connector, "line:", line);

  // Messages can be an object with numeric keys from PHP form data
  const msgArray = Array.isArray(messages) ? messages : Object.values(messages);

  for (const msg of msgArray) {
    const messageObj = msg.message || msg.MESSAGE || {};
    const messageText = messageObj.text || messageObj.TEXT || msg.message?.text || "";
    const messageId = msg.im_id || msg.ID || "";

    if (!messageText) continue;

    // Skip bot messages
    if (isBotMessage(messageText)) {
      console.log("[WORKER] Skipping bot message");
      try {
        const accessToken = await ensureValidToken(supabase, integration);
        const imData = msg.im || msg.IM || {};
        const chatData = msg.chat || msg.CHAT || {};
        await callBitrix(integration.client_endpoint, accessToken, "imconnector.send.status.delivery", {
          CONNECTOR: connector || CONNECTOR_ID,
          LINE: line,
          MESSAGES: [{
            im: imData,
            message: { id: [messageId] },
            chat: { id: chatData.id || chatData.ID || "" },
          }],
        });
      } catch {}
      continue;
    }

    // Clean BBCode for external channels
    const cleanText = stripBBCode(messageText);

    // Find channel mapping
    const { data: mapping } = await supabase
      .from("bitrix24_channel_mappings")
      .select("*")
      .eq("integration_id", integration.id)
      .eq("line_id", parseInt(line, 10))
      .eq("is_active", true)
      .maybeSingle();

    // Find conversation by user info from message
    const chatUser = msg.chat || msg.CHAT || {};
    const userList = msg.user || msg.USER || {};
    // Try to find first non-bot user
    let contactId = "";
    if (typeof userList === "object") {
      for (const u of Object.values(userList) as any[]) {
        const name = u.name || u.NAME || "";
        if (!isBotMessage(name)) {
          contactId = u.id || u.ID || "";
          break;
        }
      }
    }

    if (!contactId) {
      console.log("[WORKER] No contact ID found in message");
      await debugLog(supabase, integration.id, "no_contact_id", "outbound", { messageText: cleanText.substring(0, 100) });
      continue;
    }

    // Find conversation
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, contact_phone, contact_instagram, channel")
      .or(`contact_phone.eq.${contactId},contact_instagram.eq.${contactId}`)
      .maybeSingle();

    if (conversation) {
      try {
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            conversation_id: conversation.id,
            content: cleanText,
          }),
        });
        const sendResult = await sendRes.json();
        console.log("[WORKER] message-send result:", JSON.stringify(sendResult).substring(0, 200));

        // Delivery ACK — estrutura correta conforme documentação oficial
        const accessToken = await ensureValidToken(supabase, integration);
        const imData = msg.im || msg.IM || {};
        const chatData = msg.chat || msg.CHAT || {};
        await callBitrix(integration.client_endpoint, accessToken, "imconnector.send.status.delivery", {
          CONNECTOR: connector || CONNECTOR_ID,
          LINE: line,
          MESSAGES: [{
            im: imData,
            message: { id: [messageId] },
            chat: { id: chatData.id || chatData.ID || "" },
          }],
        });

        await debugLog(supabase, integration.id, "message_forwarded", "outbound", {
          conversationId: conversation.id, channel: conversation.channel,
          messageText: cleanText.substring(0, 100),
        });
      } catch (e) {
        console.error("[WORKER] Forward error:", e);
        await debugLog(supabase, integration.id, "forward_error", "outbound", null, String(e));
      }
    } else {
      console.log("[WORKER] No conversation for contact:", contactId);
      await debugLog(supabase, integration.id, "no_conversation", "outbound", { contactId });
    }
  }
}

async function handleBotMessage(supabase: any, integration: any, payload: any) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // O payload guardado na queue tem estrutura: { event, data: { PARAMS: {...} }, auth: {...} }
  const msgData = payload.data || {};
  const params = msgData.PARAMS || msgData;
  const messageText = params.MESSAGE || params.message || "";
  const dialogId = params.DIALOG_ID || params.dialog_id || "";
  // bot_id do payload (Bitrix24 envia o BOT_ID no evento)
  const botIdFromPayload = params.BOT_ID || params.bot_id || "";

  if (!messageText || isBotMessage(messageText)) return;

  console.log("[WORKER] Bot message:", messageText.substring(0, 100), "dialogId:", dialogId);

  // Obter bot_id: prioridade config.bot_id > payload BOT_ID
  const configData = integration.config as any || {};
  const botId = configData.bot_id || botIdFromPayload;

  if (!botId) {
    console.error("[WORKER] No bot_id found! Cannot reply as bot. config:", JSON.stringify(configData).substring(0, 200));
    await debugLog(supabase, integration.id, "bot_reply_error", "outbound", { dialogId }, "No bot_id available");
    return;
  }

  // Find AI agent (default)
  let agent: any = null;
  const { data: defaultAgent } = await supabase.from("ai_agents").select("id, welcome_message")
    .eq("is_default", true).eq("is_active", true).maybeSingle();
  agent = defaultAgent;

  if (!agent) {
    const { data: anyAgent } = await supabase.from("ai_agents").select("id, welcome_message")
      .eq("is_active", true).maybeSingle();
    agent = anyAgent;
  }

  if (!agent) {
    console.log("[WORKER] No active agent found");
    return;
  }

  // Call AI via ai-playground (aceita sem conversation_id)
  try {
    const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-playground`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        agent_id: agent.id,
        messages: [{ role: "user", content: messageText }],
      }),
    });

    const aiResult = await aiRes.json();
    console.log("[WORKER] ai-playground result:", JSON.stringify(aiResult).substring(0, 200));
    const replyText = aiResult.content || aiResult.reply || "Desculpe, não consegui processar a sua mensagem.";

    const accessToken = await ensureValidToken(supabase, integration);

    // CORRECTO: imbot.message.add com BOT_ID obrigatório
    const botReplyResult = await callBitrix(integration.client_endpoint, accessToken, "imbot.message.add", {
      BOT_ID: botId,
      DIALOG_ID: dialogId,
      MESSAGE: replyText,
    });

    console.log("[WORKER] imbot.message.add result:", JSON.stringify(botReplyResult).substring(0, 200));

    await debugLog(supabase, integration.id, "bot_reply_sent", "outbound", {
      botId, dialogId,
      messageText: messageText.substring(0, 100),
      replyText: replyText.substring(0, 100),
      agentId: agent.id,
      bitrixResult: botReplyResult,
    });
  } catch (e) {
    console.error("[WORKER] AI error:", e);
    await debugLog(supabase, integration.id, "bot_reply_error", "outbound", { dialogId, botId }, String(e));
  }
}

async function handleWelcome(supabase: any, integration: any, payload: any) {
  const msgData = payload.data || {};
  const params = msgData.PARAMS || msgData;
  const dialogId = params.DIALOG_ID || params.dialog_id || "";

  // Obter bot_id da config
  const configData = integration.config as any || {};
  const botId = configData.bot_id || params.BOT_ID || params.bot_id || "";

  let agent: any = null;
  const { data: defaultAgent } = await supabase.from("ai_agents").select("welcome_message")
    .eq("is_default", true).eq("is_active", true).maybeSingle();
  agent = defaultAgent;

  if (!agent) {
    const { data: anyAgent } = await supabase.from("ai_agents").select("welcome_message")
      .eq("is_active", true).maybeSingle();
    agent = anyAgent;
  }

  const welcomeText = agent?.welcome_message || "Olá! Sou a Emmely, a sua assistente virtual. Como posso ajudar?";

  try {
    const accessToken = await ensureValidToken(supabase, integration);

    if (botId) {
      // CORRECTO: imbot.message.add com BOT_ID obrigatório
      const result = await callBitrix(integration.client_endpoint, accessToken, "imbot.message.add", {
        BOT_ID: botId,
        DIALOG_ID: dialogId,
        MESSAGE: welcomeText,
      });
      console.log("[WORKER] Welcome imbot.message.add result:", JSON.stringify(result).substring(0, 200));
    } else {
      console.error("[WORKER] No bot_id for welcome message");
    }

    await debugLog(supabase, integration.id, "welcome_sent", "outbound", { botId, dialogId, welcomeText: welcomeText.substring(0, 100) });
  } catch (e) {
    console.error("[WORKER] Welcome error:", e);
    await debugLog(supabase, integration.id, "welcome_error", "outbound", { dialogId }, String(e));
  }
}

async function handleStatusDelete(supabase: any, integration: any, payload: any) {
  const eventData = payload.data || {};
  const connector = eventData.CONNECTOR || "";
  const line = eventData.LINE || 0;

  // Desativar o mapeamento do canal desta linha (qualquer conector)
  await supabase.from("bitrix24_channel_mappings").update({ is_active: false })
    .eq("integration_id", integration.id).eq("line_id", parseInt(line, 10));
  await debugLog(supabase, integration.id, "connector_deactivated", "inbound", { line, connector });
}

// ONIMBOTJOINCHAT — bot foi adicionado a uma Open Line via Contact Center
async function handleBotJoinChat(supabase: any, integration: any, payload: any) {
  const params = payload.data?.PARAMS || payload.data || {};
  const chatEntityType = params.CHAT_ENTITY_TYPE || params.chat_entity_type || "";
  const dialogId = params.DIALOG_ID || params.dialog_id || "";

  console.log("[WORKER] ONIMBOTJOINCHAT — CHAT_ENTITY_TYPE:", chatEntityType, "dialogId:", dialogId);

  // Se for uma Open Line (LINES), envia a mensagem de boas-vindas
  if (chatEntityType === "LINES" || !chatEntityType) {
    // Reutiliza o handler de welcome para enviar a mensagem de boas-vindas
    await handleWelcome(supabase, integration, payload);
  }

  await debugLog(supabase, integration.id, "bot_join_chat", "inbound", {
    chatEntityType, dialogId
  });
}

// ─── Deal Update Handler (auto-charge on close) ───

async function handleDealUpdate(supabase: any, integration: any, payload: any) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const eventData = payload.data || {};
  const params = eventData.FIELDS || eventData.PARAMS || eventData;
  const dealId = params.ID || params.id || "";

  if (!dealId) {
    console.log("[WORKER] ONCRMDEALUPDATE: No deal ID in payload");
    return;
  }

  // Read config from integration
  const config = (integration.config as any) || {};
  if (!config.auto_charge_on_close) {
    console.log("[WORKER] auto_charge_on_close disabled, skipping");
    return;
  }

  const wonStage = config.deal_won_stage || "WON";

  try {
    const accessToken = await ensureValidToken(supabase, integration);

    // Fetch full deal data
    const dealResult = await callBitrix(integration.client_endpoint, accessToken, "crm.deal.get", { ID: dealId });
    const deal = dealResult.result;

    if (!deal) {
      console.log("[WORKER] Deal not found:", dealId);
      return;
    }

    // Check if deal is in WON stage
    const currentStage = deal.STAGE_ID || "";
    if (currentStage !== wonStage) {
      console.log("[WORKER] Deal not in WON stage:", currentStage, "expected:", wonStage);
      return;
    }

    console.log("[WORKER] Deal is WON, delegating to bitrix24-payment-webhook for deal:", dealId);

    // Delegate to the payment webhook which handles all installment logic
    const webhookRes = await fetch(`${supabaseUrl}/functions/v1/bitrix24-payment-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ deal_id: dealId }),
    });

    const webhookResult = await webhookRes.json();
    console.log("[WORKER] Payment webhook result:", JSON.stringify(webhookResult).substring(0, 300));

    await debugLog(supabase, integration.id, "deal_payment_created", "outbound", {
      dealId,
      transactionsCreated: webhookResult.transactions_created || 0,
      groupId: webhookResult.group_id,
      errors: webhookResult.errors,
    });
  } catch (e) {
    console.error("[WORKER] Deal update error:", e);
    await debugLog(supabase, integration.id, "deal_payment_error", "outbound", { dealId }, String(e));
  }
}

// ─── Main Worker ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Check if this is a badge creation request (from chatbot-reply, message-send, etc.)
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const bodyText = await req.clone().text();
        const body = JSON.parse(bodyText);
        if (body._badgeRequest) {
          console.log("[WORKER] Processing badge request:", body.badgeCode);
          await createBitrixBadgeActivity({
            supabase,
            conversationId: body.conversationId,
            channel: body.channel,
            badgeCode: body.badgeCode,
            headerTitle: body.headerTitle,
            messagePreview: body.messagePreview,
            instanceName: body.instanceName,
            extraBlocks: body.extraBlocks,
          });
          return new Response(JSON.stringify({ ok: true, type: "badge" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {}
    }

    // Fetch pending events (batch of 10)
    const { data: events, error } = await supabase
      .from("bitrix_event_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[WORKER] Queue fetch error:", error);
      return new Response(JSON.stringify({ error: "queue fetch failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[WORKER] Processing", events.length, "events");

    let processed = 0;

    for (const event of events) {
      // Mark as processing
      await supabase.from("bitrix_event_queue").update({
        status: "processing",
        attempts: event.attempts + 1,
      }).eq("id", event.id);

      try {
        // Find integration by member_id (primary) or fallback to domain from payload
        let integration: any = null;

        if (event.member_id) {
          const { data } = await supabase
            .from("bitrix24_integrations")
            .select("*")
            .eq("member_id", event.member_id)
            .single();
          integration = data;
        }

        // Fallback: if member_id is null, try to find by domain from auth payload
        if (!integration) {
          const payloadAuth = (event.payload as any)?.auth || {};
          const payloadDomain = payloadAuth.domain || (event.payload as any)?.domain || null;
          if (payloadDomain) {
            const cleanDom = payloadDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
            const { data } = await supabase
              .from("bitrix24_integrations")
              .select("*")
              .ilike("domain", `%${cleanDom}%`)
              .single();
            integration = data;
            if (integration) console.log("[WORKER] Found integration via domain fallback:", cleanDom);
          }
        }

        // Second fallback: get first active integration (single-tenant)
        if (!integration) {
          const { data } = await supabase
            .from("bitrix24_integrations")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          integration = data;
          if (integration) console.log("[WORKER] Found integration via single-tenant fallback");
        }

        if (!integration) {
          throw new Error(`Integration not found for member: ${event.member_id}`);
        }

        const eventType = event.event_type.toUpperCase();

        switch (eventType) {
          case "ONIMCONNECTORMESSAGEADD":
            await handleConnectorMessage(supabase, integration, event.payload);
            break;
          case "ONIMBOTMESSAGEADD":
            await handleBotMessage(supabase, integration, event.payload);
            break;
          case "ONIMBOTWELCOMEMESSAGE":
          case "ONIMBOTJOINOPEN":
            await handleWelcome(supabase, integration, event.payload);
            break;
          case "ONIMCONNECTORSTATUSDELETE":
            await handleStatusDelete(supabase, integration, event.payload);
            break;
          case "ONIMBOTJOINCHAT":
            await handleBotJoinChat(supabase, integration, event.payload);
            break;
          case "ONCRMDEALUPDATE":
            await handleDealUpdate(supabase, integration, event.payload);
            break;
          default:
            console.log("[WORKER] Unknown event type:", eventType);
        }

        // Mark as done
        await supabase.from("bitrix_event_queue").update({
          status: "done",
          processed_at: new Date().toISOString(),
        }).eq("id", event.id);

        processed++;
      } catch (e) {
        console.error("[WORKER] Event processing error:", e);
        const newStatus = event.attempts + 1 >= event.max_attempts ? "failed" : "pending";
        await supabase.from("bitrix_event_queue").update({
          status: newStatus,
          last_error: String(e).substring(0, 500),
          processed_at: newStatus === "failed" ? new Date().toISOString() : null,
        }).eq("id", event.id);
      }
    }

    console.log("[WORKER] Done. Processed:", processed, "/", events.length);

    return new Response(JSON.stringify({ processed, total: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[WORKER] Fatal error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
