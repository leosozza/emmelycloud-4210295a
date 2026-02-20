import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cspValue = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "connect-src *",
  "frame-ancestors *",
  "font-src * data:",
].join("; ");

const htmlHeaders = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspValue,
  "X-Frame-Options": "ALLOWALL",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const CONNECTOR_ID = "emmely_connector";

// --- Helpers ---

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText);
  }
  // Parse form-urlencoded with PHP notation: auth[access_token]
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

function cleanDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

function extractDomain(data: any, req: Request): string | null {
  // 1. client_endpoint
  if (data.auth?.client_endpoint) {
    const match = data.auth.client_endpoint.match(/https?:\/\/([^\/]+)/);
    if (match) return match[1];
  }
  // 2. auth.domain
  if (data.auth?.domain) return cleanDomain(data.auth.domain);
  // 3. DOMAIN / domain
  if (data.DOMAIN) return cleanDomain(data.DOMAIN);
  if (data.domain) return cleanDomain(data.domain);
  // 4. Referer (broader match - any domain)
  const referer = req.headers.get("referer");
  if (referer) {
    const match = referer.match(/https?:\/\/([^\/]+)/);
    if (match && !match[1].includes("supabase")) return match[1];
  }
  // 5. Origin
  const origin = req.headers.get("origin");
  if (origin && !origin.includes("supabase")) return cleanDomain(origin);
  return null;
}

async function callBitrix(
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
  const data = await response.json();
  if (data.error && data.error !== "CONNECTOR_ALREADY_EXISTS") {
    console.error(`[BITRIX API] ${method} error:`, data.error, data.error_description);
  }
  return data;
}

async function debugLog(
  supabase: any,
  integrationId: string | null,
  eventType: string,
  direction: string,
  payload: any,
  error?: string
) {
  try {
    await supabase.from("bitrix24_debug_logs").insert({
      integration_id: integrationId,
      event_type: eventType,
      direction,
      payload,
      error: error || null,
    });
  } catch (e) {
    console.error("[DEBUG LOG] Failed to write:", e);
  }
}

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    console.log("[INSTALL] Received payload:", JSON.stringify(data).substring(0, 500));
    console.log("[INSTALL] Referer:", req.headers.get("referer"), "Origin:", req.headers.get("origin"));
    const auth = data.auth || {};
    // Bitrix24 sends flat uppercase keys (AUTH_ID, REFRESH_ID) or nested auth object
    const memberId = auth.member_id || data.member_id;
    const accessToken = auth.access_token || data.AUTH_ID;
    const refreshToken = auth.refresh_token || data.REFRESH_ID;
    const applicationToken = auth.application_token || data.application_token || data.APP_TOKEN;
    const domain = extractDomain(data, req);
    const expiresIn = parseInt(auth.expires_in || data.AUTH_EXPIRES || "3600");

    // For flat keys, build client_endpoint from SERVER_ENDPOINT or domain
    // Bitrix24 local apps use SERVER_ENDPOINT for REST calls
    const serverEndpoint = data.SERVER_ENDPOINT;

    if (!memberId || !accessToken) {
      await debugLog(supabase, null, "install_error", "inbound", data, "Missing member_id or access_token");
      return new Response(
        JSON.stringify({ error: "Missing member_id or access_token" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Build client_endpoint - priority: auth.client_endpoint > domain-based
    // NOTE: SERVER_ENDPOINT (oauth.bitrix.info) is the OAuth server, NOT the portal REST API
    let clientEndpoint = auth.client_endpoint;
    if (!clientEndpoint && domain) {
      clientEndpoint = `https://${domain}/rest/`;
    }
    if (!clientEndpoint) {
      await debugLog(supabase, null, "install_error", "inbound", data, "Cannot determine client_endpoint");
      return new Response(
        JSON.stringify({ error: "Cannot determine client_endpoint" }),
        { status: 400, headers: jsonHeaders }
      );
    }
    // Ensure trailing slash
    if (!clientEndpoint.endsWith("/")) clientEndpoint += "/";

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert integration
    const { data: integration, error: upsertError } = await supabase
      .from("bitrix24_integrations")
      .upsert(
        {
          member_id: memberId,
          domain: domain || "",
          client_endpoint: clientEndpoint,
          access_token: accessToken,
          refresh_token: refreshToken || "",
          expires_at: expiresAt,
          application_token: applicationToken || "",
          config: {
            installed_at: new Date().toISOString(),
            auth_payload: auth,
          },
        },
        { onConflict: "member_id" }
      )
      .select("id")
      .single();

    if (upsertError) {
      console.error("[INSTALL] Upsert error:", upsertError);
      await debugLog(supabase, null, "install_upsert_error", "inbound", data, upsertError.message);
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const integrationId = integration.id;
    await debugLog(supabase, integrationId, "install_success", "inbound", { memberId, domain });

    // --- Register Connector ---
    try {
      // 1. Register connector
      const regResult = await callBitrix(clientEndpoint, accessToken, "imconnector.register", {
        ID: CONNECTOR_ID,
        NAME: "Emmely Messages",
        ICON: {
          DATA_IMAGE: "data:image/svg+xml;base64," + btoa('<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#722F37"/><text x="24" y="31" font-size="22" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial">E</text></svg>'),
          COLOR: { BACKGROUND: "#722F37", BORDER: "#5A252C" },
          SIZE: { WIDTH: 48, HEIGHT: 48 },
          POSITION: { TOP: 0, LEFT: 0 },
        },
        ICON_DISABLED: {
          DATA_IMAGE: "data:image/svg+xml;base64," + btoa('<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#999"/><text x="24" y="31" font-size="22" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial">E</text></svg>'),
          COLOR: { BACKGROUND: "#999", BORDER: "#666" },
          SIZE: { WIDTH: 48, HEIGHT: 48 },
          POSITION: { TOP: 0, LEFT: 0 },
        },
        PLACEMENT_HANDLER: `${supabaseUrl}/functions/v1/bitrix24-connector-settings`,
      });

      console.log("[INSTALL] Register connector result:", JSON.stringify(regResult));

      const connectorRegistered = !regResult.error || regResult.error === "CONNECTOR_ALREADY_EXISTS";

      // 2. Do NOT auto-activate on lines — user must manually enable in Contact Center
      const connectorActive = false;

      // 3. Bind events (connector + bot)
      const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;
      const events = [
        "OnImConnectorMessageAdd",
        "OnImConnectorDialogStart",
        "OnImConnectorDialogFinish",
        "OnImConnectorStatusDelete",
        "OnImbotMessageAdd",       // eventos do IM Bot
        "OnImbotWelcomeMessage",   // boas-vindas do IM Bot
        "OnImbotJoinOpen",         // bot adicionado a open line
        "OnImbotJoinChat",         // NOVO — bot adicionado via Open Lines (Contact Center)
      ];

      for (const event of events) {
        const bindResult = await callBitrix(clientEndpoint, accessToken, "event.bind", {
          event,
          handler: eventsUrl,
        });
        // "Handler already binded" is NOT an error - check both error and error_description
        const errStr = String(bindResult.error || "") + " " + String(bindResult.error_description || "");
        if (bindResult.error && !errStr.toLowerCase().includes("already")) {
          console.error(`[INSTALL] Bind ${event} failed:`, bindResult.error, bindResult.error_description);
        } else {
          console.log(`[INSTALL] Bind ${event}: OK (or already bound)`);
        }
      }

      // Update integration status
      await supabase
        .from("bitrix24_integrations")
        .update({
          connector_registered: connectorRegistered,
          connector_active: connectorActive,
        })
        .eq("id", integrationId);

      await debugLog(supabase, integrationId, "connector_setup", "outbound", {
        registered: connectorRegistered,
        active: connectorActive,
        eventsBound: events.length,
      });

      // Register IM Bot for Contact Center chatbot
      try {
        const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;

        // 1. List existing bots and unregister old ones
        // NOTE: imbot.bot.list returns an OBJECT with numeric keys, NOT an array
        const botListResult = await callBitrix(clientEndpoint, accessToken, "imbot.bot.list", {});
        console.log("[INSTALL] imbot.bot.list result:", JSON.stringify(botListResult).substring(0, 500));

        // Convert object ({"3": {...}, "10265": {...}}) or array to array of bots
        const botsRaw = botListResult.result || {};
        const botsArray: any[] = Array.isArray(botsRaw)
          ? botsRaw
          : Object.values(botsRaw);

        for (const bot of botsArray) {
          if (bot.CODE === "emmely_ai_bot" || (bot.NAME && bot.NAME.toLowerCase().includes("emmely"))) {
            console.log(`[INSTALL] Unregistering existing bot ID ${bot.ID} (${bot.NAME})`);
            const unregRes = await callBitrix(clientEndpoint, accessToken, "imbot.unregister", { BOT_ID: bot.ID });
            console.log(`[INSTALL] Unregister bot ${bot.ID} result:`, JSON.stringify(unregRes).substring(0, 200));
          }
        }

        // 2. Register fresh bot
        // TYPE: "B" + OPENLINE: "Y" (root level) = hybrid mode — appears in Contact Center Open Lines chatbot selector
        const botResult = await callBitrix(clientEndpoint, accessToken, "imbot.register", {
          CODE: "emmely_ai_bot",
          TYPE: "B",
          OPENLINE: "Y",              // RAIZ — obrigatório para aparecer no selector de chatbot das Open Lines
          EVENT_MESSAGE_ADD: eventsUrl,
          EVENT_WELCOME_MESSAGE: eventsUrl,
          EVENT_JOIN_CHAT: eventsUrl,  // OBRIGATÓRIO para Open Lines chatbot selector
          EVENT_BOT_DELETE: eventsUrl,
          PROPERTIES: {
            NAME: "Emmely AI",
            WORK_POSITION: "Assistente Virtual IA",
            COLOR: "GREEN",           // Nome de cor válido (não hex)
          },
        });

        const botErr = String(botResult.error || "") + " " + String(botResult.error_description || "");
        let finalBotId: string | null = null;

        if (botResult.result) {
          finalBotId = String(botResult.result);
          console.log("[INSTALL] Bot Emmely AI registered OK, ID:", finalBotId);
        } else if (botErr.includes("ALREADY")) {
          // Already registered — try to get its ID from list
          // NOTE: imbot.bot.list returns an OBJECT with numeric keys, NOT an array
          const listAgain = await callBitrix(clientEndpoint, accessToken, "imbot.bot.list", {});
          const listRaw = listAgain.result || {};
          const listArray: any[] = Array.isArray(listRaw) ? listRaw : Object.values(listRaw);
          const existing = listArray.find((b: any) => b.CODE === "emmely_ai_bot");
          if (existing) finalBotId = String(existing.ID);
          console.log("[INSTALL] Bot already exists, ID:", finalBotId);
        } else {
          console.error("[INSTALL] Bot registration failed:", botResult.error, botResult.error_description);
          // Fallback: register without EVENT_WELCOME_MESSAGE
          const botResult2 = await callBitrix(clientEndpoint, accessToken, "imbot.register", {
            CODE: "emmely_ai_bot",
            TYPE: "B",
            OPENLINE: "Y",            // RAIZ — obrigatório para Open Lines
            EVENT_MESSAGE_ADD: eventsUrl,
            EVENT_WELCOME_MESSAGE: eventsUrl,
            EVENT_JOIN_CHAT: eventsUrl,
            EVENT_BOT_DELETE: eventsUrl,
            PROPERTIES: {
              NAME: "Emmely AI",
              WORK_POSITION: "Assistente Virtual IA",
              COLOR: "GREEN",
            },
          });
          if (botResult2.result) {
            finalBotId = String(botResult2.result);
            console.log("[INSTALL] Bot registered (fallback, no welcome event), ID:", finalBotId);
          } else {
            console.error("[INSTALL] Fallback bot registration also failed:", botResult2.error);
          }
        }

        if (finalBotId) {
          // IMPORTANTE: bitrix_agent_id é UUID — NÃO podemos guardar o bot_id numérico lá.
          // Guardamos o bot_id APENAS no campo config (JSONB aceita qualquer valor).
          // Fazemos merge com o config existente para não perder auth_payload, etc.
          const { data: currentIntData } = await supabase
            .from("bitrix24_integrations")
            .select("config")
            .eq("id", integrationId)
            .single();

          const existingConfig = (currentIntData?.config as any) || {};

          await supabase
            .from("bitrix24_integrations")
            .update({
              config: {
                ...existingConfig,            // preservar installed_at, auth_payload, etc.
                bot_id: finalBotId,           // string numérica ex: "10265"
                bot_registered_at: new Date().toISOString(),
              },
            })
            .eq("id", integrationId);

          console.log("[INSTALL] bot_id saved in config:", finalBotId);
        }

        await debugLog(supabase, integrationId, "bot_registered", "outbound", { botResult, finalBotId });
      } catch (botError) {
        console.error("[INSTALL] Bot registration error:", botError);
        await debugLog(supabase, integrationId, "bot_register_error", "outbound", null, String(botError));
      }

      // --- Create default AI agent if none exists ---
      try {
        const { count } = await supabase
          .from("ai_agents")
          .select("id", { count: "exact", head: true });

        if (count === 0) {
          const { error: agentErr } = await supabase.from("ai_agents").insert({
            name: "Emmely AI",
            description: "Assistente virtual padrão criado automaticamente na instalação.",
            is_default: true,
            is_active: true,
            ai_provider: "lovable",
            ai_model: "google/gemini-3-flash-preview",
            agent_type: "text",
            temperature: 0.7,
            system_prompt: "Você é a Emmely, uma assistente virtual inteligente e simpática. Responda de forma clara, objetiva e profissional. Ajude os utilizadores com as suas questões da melhor forma possível.",
            fallback_message: "Desculpe, não consegui processar a sua mensagem. Tente novamente.",
            welcome_message: "Olá! Sou a Emmely, a sua assistente virtual. Como posso ajudar?",
          });

          if (agentErr) {
            console.error("[INSTALL] Default agent creation error:", agentErr);
          } else {
            console.log("[INSTALL] Default agent 'Emmely AI' created successfully");
          }
          await debugLog(supabase, integrationId, "default_agent_created", "outbound", { error: agentErr?.message || null });
        } else {
          console.log("[INSTALL] Agents already exist, skipping default creation");
        }
      } catch (agentSetupError) {
        console.error("[INSTALL] Agent setup error:", agentSetupError);
      }
    } catch (connectorError) {
      console.error("[INSTALL] Connector setup error:", connectorError);
      await debugLog(supabase, integrationId, "connector_setup_error", "outbound", null, String(connectorError));
    }

    // --- Register Configurable Activity Badges ---
    try {
      const badges = [
        { code: "emmely_bot_replied", title: "Emmely AI", value: "Bot respondeu", type: "success" },
        { code: "emmely_msg_sent", title: "Mensagem Enviada", value: "Enviada", type: "primary" },
        { code: "emmely_msg_delivered", title: "Entregue", value: "Entregue", type: "success" },
        { code: "emmely_msg_failed", title: "Erro de Envio", value: "Falhou", type: "failure" },
        { code: "emmely_human_takeover", title: "Atendimento Humano", value: "Humano", type: "warning" },
        { code: "emmely_payment_created", title: "Cobrança Criada", value: "Cobrança", type: "primary" },
        { code: "emmely_payment_confirmed", title: "Pagamento Confirmado", value: "Pago", type: "success" },
      ];

      for (const badge of badges) {
        const badgeResult = await callBitrix(clientEndpoint, accessToken, "crm.activity.badge.add", badge);
        const badgeErr = String(badgeResult.error || "");
        if (badgeResult.error && !badgeErr.includes("ALREADY") && !badgeErr.includes("DUPLICATE")) {
          console.error(`[INSTALL] Badge ${badge.code} registration failed:`, badgeResult.error, badgeResult.error_description);
        } else {
          console.log(`[INSTALL] Badge ${badge.code}: registered OK`);
        }
      }

      await debugLog(supabase, integrationId, "badges_registered", "outbound", {
        badges: badges.map(b => b.code),
      });
    } catch (badgeError) {
      console.error("[INSTALL] Badge registration error:", badgeError);
      await debugLog(supabase, integrationId, "badges_error", "outbound", null, String(badgeError));
    }

    // --- Register BizProc Robots ---
    try {
      const robotHandlerUrl = `${supabaseUrl}/functions/v1/bitrix24-robot-handler`;

      const robots = [
        {
          CODE: "emmely_send_whatsapp",
          NAME: "Emmely: Enviar WhatsApp",
          PROPERTIES: {
            phone: { Name: "Telefone", Type: "string", Required: "Y", Description: "Número de telefone com código do país" },
            message: { Name: "Mensagem", Type: "text", Required: "Y", Description: "Texto da mensagem" },
          },
          RETURN_PROPERTIES: {
            message_id: { Name: "ID da Mensagem", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_send_instagram",
          NAME: "Emmely: Enviar Instagram",
          PROPERTIES: {
            instagram_user: { Name: "Utilizador Instagram", Type: "string", Required: "Y", Description: "Username ou ID do Instagram" },
            message: { Name: "Mensagem", Type: "text", Required: "Y", Description: "Texto da mensagem" },
          },
          RETURN_PROPERTIES: {
            message_id: { Name: "ID da Mensagem", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_create_charge",
          NAME: "Emmely: Criar Cobrança",
          PROPERTIES: {
            amount: { Name: "Valor", Type: "double", Required: "Y", Description: "Valor da cobrança" },
            currency: { Name: "Moeda", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL" }, Default: "EUR" },
            payment_method: { Name: "Método de Pagamento", Type: "select", Options: { card: "Cartão", pix: "PIX", boleto: "Boleto" }, Default: "card" },
            customer_name: { Name: "Nome do Cliente", Type: "string" },
            customer_email: { Name: "Email do Cliente", Type: "string" },
            description: { Name: "Descrição", Type: "string" },
          },
          RETURN_PROPERTIES: {
            charge_id: { Name: "ID da Cobrança", Type: "string" },
            charge_status: { Name: "Status", Type: "string" },
            payment_url: { Name: "URL de Pagamento", Type: "string" },
            pix_code: { Name: "Código PIX", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_check_payment",
          NAME: "Emmely: Verificar Pagamento",
          PROPERTIES: {
            charge_id: { Name: "ID da Cobrança", Type: "string", Required: "Y", Description: "ID retornado ao criar a cobrança" },
          },
          RETURN_PROPERTIES: {
            status: { Name: "Status", Type: "string" },
            paid_at: { Name: "Data de Pagamento", Type: "string" },
            paid_value: { Name: "Valor Pago", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
      ];

      for (const robot of robots) {
        // Delete existing robot first (safe for reinstall)
        await callBitrix(clientEndpoint, accessToken, "bizproc.robot.delete", { CODE: robot.CODE });

        // Register robot
        const addResult = await callBitrix(clientEndpoint, accessToken, "bizproc.robot.add", {
          CODE: robot.CODE,
          HANDLER: robotHandlerUrl,
          AUTH_USER_ID: 1,
          NAME: robot.NAME,
          USE_SUBSCRIPTION: "Y",
          PROPERTIES: robot.PROPERTIES,
          RETURN_PROPERTIES: robot.RETURN_PROPERTIES,
        });

        const errStr = String(addResult.error || "");
        if (addResult.error && !errStr.includes("ALREADY")) {
          console.error(`[INSTALL] Robot ${robot.CODE} registration failed:`, addResult.error, addResult.error_description);
        } else {
          console.log(`[INSTALL] Robot ${robot.CODE}: registered OK`);
        }
      }

      await debugLog(supabase, integrationId, "robots_setup", "outbound", {
        robotsRegistered: robots.map(r => r.CODE),
      });
    } catch (robotError) {
      console.error("[INSTALL] Robot setup error:", robotError);
      await debugLog(supabase, integrationId, "robots_setup_error", "outbound", null, String(robotError));
    }

    // --- Register IM_TEXTAREA placement (Devolver ao Bot button) ---
    try {
      const returnToBotUrl = `${supabaseUrl}/functions/v1/bitrix24-return-to-bot`;

      // Unbind first to avoid duplicates
      await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_TEXTAREA",
        HANDLER: returnToBotUrl,
      });

      const placementResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
        PLACEMENT: "IM_TEXTAREA",
        HANDLER: returnToBotUrl,
        TITLE: "Devolver ao Bot",
        LANG_ALL: {
          pt: { TITLE: "Devolver ao Bot" },
          en: { TITLE: "Return to Bot" },
          es: { TITLE: "Devolver al Bot" },
          ru: { TITLE: "Вернуть боту" },
        },
        OPTIONS: {
          iconName: "fa-robot",   // OBRIGATÓRIO — Font Awesome icon name
          context: "LINES",       // apenas em Open Lines
          color: "GREEN",
          role: "USER",
          width: "400",
          height: "200",
          extranet: "N",
        },
      });

      const plErr = placementResult.error || "";
      if (plErr && !String(plErr).toLowerCase().includes("already")) {
        console.error("[INSTALL] placement.bind IM_TEXTAREA error:", plErr, placementResult.error_description);
      } else {
        console.log("[INSTALL] placement.bind IM_TEXTAREA: OK");
      }

      await debugLog(supabase, integrationId, "placement_bind", "outbound", { result: placementResult });
    } catch (placementError) {
      console.error("[INSTALL] placement.bind error:", placementError);
      await debugLog(supabase, integrationId, "placement_bind_error", "outbound", null, String(placementError));
    }

    // --- Register CRM_LEAD_DETAIL_TAB placement (Emmely AI tab in Lead detail) ---
    try {
      const crmTabUrl = `${supabaseUrl}/functions/v1/bitrix24-crm-tab`;

      await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
        PLACEMENT: "CRM_LEAD_DETAIL_TAB",
        HANDLER: crmTabUrl,
      });

      const crmTabResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
        PLACEMENT: "CRM_LEAD_DETAIL_TAB",
        HANDLER: crmTabUrl,
        TITLE: "Emmely AI",
        DESCRIPTION: "Conversa e histórico do cliente",
        LANG_ALL: {
          pt: { TITLE: "Emmely AI", DESCRIPTION: "Conversa e histórico do cliente" },
          en: { TITLE: "Emmely AI", DESCRIPTION: "Conversation and client history" },
          es: { TITLE: "Emmely AI", DESCRIPTION: "Conversación e historial del cliente" },
          ru: { TITLE: "Emmely AI", DESCRIPTION: "Переписка и история клиента" },
        },
      });

      const crmTabErr = crmTabResult.error || "";
      if (crmTabErr && !String(crmTabErr).toLowerCase().includes("already")) {
        console.error("[INSTALL] placement.bind CRM_LEAD_DETAIL_TAB error:", crmTabErr);
      } else {
        console.log("[INSTALL] placement.bind CRM_LEAD_DETAIL_TAB: OK");
      }

      await debugLog(supabase, integrationId, "crm_tab_placement_bind", "outbound", { result: crmTabResult });
    } catch (crmTabError) {
      console.error("[INSTALL] CRM tab placement error:", crmTabError);
      await debugLog(supabase, integrationId, "crm_tab_placement_error", "outbound", null, String(crmTabError));
    }

    // If called via JSON (from frontend fetch), return JSON
    if (contentType.includes("application/json")) {
      return new Response(
        JSON.stringify({ success: true, integrationId, domain }),
        { headers: jsonHeaders }
      );
    }

    // If called via form POST (legacy Bitrix24 direct), return HTML
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><script src="https://api.bitrix24.com/api/v1/"></script></head>
<body style="font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5">
<div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.1);max-width:400px">
<div style="font-size:48px;margin-bottom:16px">✅</div>
<h2 style="color:#333;margin-bottom:8px">Emmely Cloud Instalado!</h2>
<p style="color:#666;font-size:14px">Conector configurado com sucesso.</p>
</div>
<script>try{BX24.init(function(){BX24.installFinish()});}catch(e){}</script>
</body></html>`;
    return new Response(html, { headers: htmlHeaders });
  } catch (error) {
    console.error("[INSTALL] Fatal error:", error);
    await debugLog(supabase, null, "install_fatal", "inbound", null, String(error));
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
