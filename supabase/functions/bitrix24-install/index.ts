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

  // --- repair_fields action: delete and recreate all UF_CRM_EMMELY_* fields ---
  const reqUrl = new URL(req.url);
  if (reqUrl.searchParams.get("action") === "repair_fields") {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    try {
      // Get integration
      const { data: integration } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!integration?.client_endpoint || !integration?.access_token) {
        return new Response(JSON.stringify({ error: "No integration found" }), { status: 400, headers: jsonHeaders });
      }

      const ep = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
      const token = integration.access_token;
      const report: any = { deleted_deal: [], deleted_lead: [], created_deal: [], created_lead: [], errors: [] };

      // 1. List and delete existing EMMELY fields for Deal
      const dealFieldsList = await callBitrix(ep, token, "crm.deal.userfield.list", { filter: {} });
      const dealFields = Array.isArray(dealFieldsList.result) ? dealFieldsList.result : [];
      for (const f of dealFields) {
        if (f.FIELD_NAME && f.FIELD_NAME.startsWith("UF_CRM_EMMELY_")) {
          const delRes = await callBitrix(ep, token, "crm.deal.userfield.delete", { id: f.ID });
          if (delRes.result) { report.deleted_deal.push(f.FIELD_NAME); }
          else { report.errors.push(`delete deal ${f.FIELD_NAME}: ${delRes.error || 'unknown'}`); }
        }
      }

      // 2. List and delete existing EMMELY fields for Lead
      const leadFieldsList = await callBitrix(ep, token, "crm.lead.userfield.list", { filter: {} });
      const leadFields = Array.isArray(leadFieldsList.result) ? leadFieldsList.result : [];
      for (const f of leadFields) {
        if (f.FIELD_NAME && f.FIELD_NAME.startsWith("UF_CRM_EMMELY_")) {
          const delRes = await callBitrix(ep, token, "crm.lead.userfield.delete", { id: f.ID });
          if (delRes.result) { report.deleted_lead.push(f.FIELD_NAME); }
          else { report.errors.push(`delete lead ${f.FIELD_NAME}: ${delRes.error || 'unknown'}`); }
        }
      }

      // 3. Recreate all fields
      const emmelyUserFields = [
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Status de Pagamento", en: "Payment Status" },
          LIST_COLUMN_LABEL: { pt: "Status Pagamento", en: "Payment Status" },
          LIST: [
            { VALUE: "Pendente", SORT: 100, DEF: "Y" },
            { VALUE: "Parcial", SORT: 200 },
            { VALUE: "Pago", SORT: 300 },
            { VALUE: "Cancelado", SORT: 400 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_GROUP",
          USER_TYPE_ID: "string",
          EDIT_FORM_LABEL: { pt: "Grupo de Parcelas", en: "Installment Group" },
          LIST_COLUMN_LABEL: { pt: "Grupo Parcelas", en: "Installment Group" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_GATEWAY",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Gateway de Pagamento", en: "Payment Gateway" },
          LIST_COLUMN_LABEL: { pt: "Gateway", en: "Gateway" },
          LIST: [
            { VALUE: "Stripe Portugal", SORT: 100, DEF: "Y" },
            { VALUE: "Stripe Brasil", SORT: 200 },
            { VALUE: "Asaas", SORT: 300 },
            { VALUE: "Direto", SORT: 400 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_PAID",
          USER_TYPE_ID: "double",
          EDIT_FORM_LABEL: { pt: "Total Pago", en: "Total Paid" },
          LIST_COLUMN_LABEL: { pt: "Total Pago", en: "Total Paid" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_URL",
          USER_TYPE_ID: "url",
          EDIT_FORM_LABEL: { pt: "Link de Pagamento", en: "Payment Link" },
          LIST_COLUMN_LABEL: { pt: "Link Pagamento", en: "Payment Link" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_INSTALLMENTS",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Nº de Parcelas", en: "Installments" },
          LIST_COLUMN_LABEL: { pt: "Nº Parcelas", en: "Installments" },
          LIST: [
            { VALUE: "1 Parcela", SORT: 100, DEF: "Y" },
            { VALUE: "2 Parcelas", SORT: 200 },
            { VALUE: "3 Parcelas", SORT: 300 },
            { VALUE: "4 Parcelas", SORT: 400 },
            { VALUE: "5 Parcelas", SORT: 500 },
            { VALUE: "6 Parcelas", SORT: 600 },
            { VALUE: "7 Parcelas", SORT: 700 },
            { VALUE: "8 Parcelas", SORT: 800 },
            { VALUE: "9 Parcelas", SORT: 900 },
            { VALUE: "10 Parcelas", SORT: 1000 },
            { VALUE: "11 Parcelas", SORT: 1100 },
            { VALUE: "12 Parcelas", SORT: 1200 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAID_INSTALLMENTS",
          USER_TYPE_ID: "integer",
          EDIT_FORM_LABEL: { pt: "Parcelas Pagas", en: "Paid Installments" },
          LIST_COLUMN_LABEL: { pt: "Parcelas Pagas", en: "Paid Installments" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_VALUE",
          USER_TYPE_ID: "double",
          EDIT_FORM_LABEL: { pt: "Valor da Parcela", en: "Installment Value" },
          LIST_COLUMN_LABEL: { pt: "Valor Parcela", en: "Installment Value" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_NEXT_DUE_DATE",
          USER_TYPE_ID: "date",
          EDIT_FORM_LABEL: { pt: "Próximo Vencimento", en: "Next Due Date" },
          LIST_COLUMN_LABEL: { pt: "Próx. Vencimento", en: "Next Due Date" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_METHOD",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Método de Pagamento", en: "Payment Method" },
          LIST_COLUMN_LABEL: { pt: "Método Pagamento", en: "Payment Method" },
          LIST: [
            { VALUE: "Cartão", SORT: 100, DEF: "Y" },
            { VALUE: "PIX", SORT: 200 },
            { VALUE: "Boleto", SORT: 300 },
            { VALUE: "MB Way", SORT: 400 },
            { VALUE: "Multibanco", SORT: 500 },
            { VALUE: "Débito SEPA", SORT: 600 },
            { VALUE: "Direto", SORT: 700 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_NOTES",
          USER_TYPE_ID: "string",
          EDIT_FORM_LABEL: { pt: "Notas de Pagamento", en: "Payment Notes" },
          LIST_COLUMN_LABEL: { pt: "Notas Pagamento", en: "Payment Notes" },
        },
      ];

      const entityApis = [
        { name: "Deal", add: "crm.deal.userfield.add" },
        { name: "Lead", add: "crm.lead.userfield.add" },
      ];

      for (const entity of entityApis) {
        for (const field of emmelyUserFields) {
          const result = await callBitrix(ep, token, entity.add, { fields: field });
          const errStr = String(result.error || "") + " " + String(result.error_description || "");
          if (result.error && !errStr.includes("ALREADY") && !errStr.includes("DUPLICATE") && !errStr.includes("FIELD_NAME_DUPLICATED")) {
            report.errors.push(`create ${entity.name} ${field.FIELD_NAME}: ${result.error}`);
          } else {
            (entity.name === "Deal" ? report.created_deal : report.created_lead).push(field.FIELD_NAME);
          }
        }
      }

      await debugLog(supabase, integration.id, "repair_fields", "outbound", report);
      return new Response(JSON.stringify({ ok: true, report }), { headers: jsonHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
    }
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

    // --- Install summary tracker ---
    const installSummary: any = {
      connector_registered: false,
      bot_id: null,
      robots_registered: [],
      placements_registered: [],
      badges_registered: [],
      userfields_registered: [],
      paysystem_handler_registered: false,
      installed_modules: [],
      available_scopes: [],
      missing_scopes: [],
    };

    // --- Verify scopes via app.info ---
    try {
      const appInfo = await callBitrix(clientEndpoint, accessToken, "app.info", {});
      const scopeList = appInfo.result?.SCOPE || appInfo.result?.scope || [];
      installSummary.available_scopes = scopeList;
      const requiredScopes = ["crm", "imopenlines", "imconnector", "im", "imbot", "event", "user", "bizproc", "pay_system", "placement"];
      installSummary.missing_scopes = requiredScopes.filter(function(s) { return scopeList.indexOf(s) === -1; });
      if (installSummary.missing_scopes.length > 0) {
        console.warn("[INSTALL] Missing scopes:", installSummary.missing_scopes.join(", "));
      } else {
        console.log("[INSTALL] All required scopes available");
      }
      await debugLog(supabase, integrationId, "scope_check", "outbound", {
        available: scopeList,
        missing: installSummary.missing_scopes,
      });
    } catch (scopeErr) {
      console.error("[INSTALL] Scope check failed (continuing):", scopeErr);
    }

    // --- Register Connector ---
    try {
      // 1. Register connector
      const regResult = await callBitrix(clientEndpoint, accessToken, "imconnector.register", {
        ID: CONNECTOR_ID,
        NAME: "Emmely Messages",
        ICON: {
          DATA_IMAGE: "data:image/svg+xml;base64," + btoa('<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#2067b0"/><text x="24" y="31" font-size="22" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial">E</text></svg>'),
          COLOR: { BACKGROUND: "#2067b0", BORDER: "#1a5690" },
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
      installSummary.connector_registered = connectorRegistered;
      if (connectorRegistered) installSummary.installed_modules.push("connector");

      // 2. Do NOT auto-activate on lines — user must manually enable in Contact Center
      const connectorActive = false;

      // 3. Bind events (connector + bot + uninstall)
      const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;
      const events = [
        "OnImConnectorMessageAdd",
        "OnImConnectorDialogStart",
        "OnImConnectorDialogFinish",
        "OnImConnectorStatusDelete",
        "OnImbotMessageAdd",       // eventos do IM Bot
        "OnImbotWelcomeMessage",   // boas-vindas do IM Bot
        "OnImbotJoinOpen",         // bot adicionado a open line
        "OnImbotJoinChat",         // bot adicionado via Open Lines (Contact Center)
        "OnAppUninstall",          // limpeza de campos na desinstalação
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
          installSummary.bot_id = finalBotId;
          installSummary.installed_modules.push("bot");
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
        { code: "emmely_contract_signed", title: "Contrato Assinado", value: "Assinado", type: "success" },
        { code: "emmely_payment_failed", title: "Pagamento Falhado", value: "Falhou", type: "failure" },
        { code: "emmely_payment_refunded", title: "Reembolso", value: "Reembolsado", type: "warning" },
        { code: "emmely_deal_payment_updated", title: "Parcelas Atualizadas", value: "Atualizado", type: "primary" },
        { code: "emmely_baixa_imported", title: "Baixa Importada", value: "Importado", type: "primary" },
      ];

      for (const badge of badges) {
        const badgeResult = await callBitrix(clientEndpoint, accessToken, "crm.activity.badge.add", badge);
        const badgeErr = String(badgeResult.error || "");
        if (badgeResult.error && !badgeErr.includes("ALREADY") && !badgeErr.includes("DUPLICATE")) {
          console.error(`[INSTALL] Badge ${badge.code} registration failed:`, badgeResult.error, badgeResult.error_description);
        } else {
          console.log(`[INSTALL] Badge ${badge.code}: registered OK`);
          installSummary.badges_registered.push(badge.code);
        }
      }

      installSummary.installed_modules.push("badges");

      await debugLog(supabase, integrationId, "badges_registered", "outbound", {
        badges: badges.map(b => b.code),
      });
    } catch (badgeError) {
      console.error("[INSTALL] Badge registration error:", badgeError);
      await debugLog(supabase, integrationId, "badges_error", "outbound", null, String(badgeError));
    }

    // --- Create Custom User Fields (Deal + Lead) ---
    try {
      const emmelyUserFields = [
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Status de Pagamento", en: "Payment Status" },
          LIST_COLUMN_LABEL: { pt: "Status Pagamento", en: "Payment Status" },
          LIST: [
            { VALUE: "Pendente", SORT: 100, DEF: "Y" },
            { VALUE: "Parcial", SORT: 200 },
            { VALUE: "Pago", SORT: 300 },
            { VALUE: "Cancelado", SORT: 400 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_GROUP",
          USER_TYPE_ID: "string",
          EDIT_FORM_LABEL: { pt: "Grupo de Parcelas", en: "Installment Group" },
          LIST_COLUMN_LABEL: { pt: "Grupo Parcelas", en: "Installment Group" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_GATEWAY",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Gateway de Pagamento", en: "Payment Gateway" },
          LIST_COLUMN_LABEL: { pt: "Gateway", en: "Gateway" },
          LIST: [
            { VALUE: "Stripe Portugal", SORT: 100, DEF: "Y" },
            { VALUE: "Stripe Brasil", SORT: 200 },
            { VALUE: "Asaas", SORT: 300 },
            { VALUE: "Direto", SORT: 400 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_PAID",
          USER_TYPE_ID: "double",
          EDIT_FORM_LABEL: { pt: "Total Pago", en: "Total Paid" },
          LIST_COLUMN_LABEL: { pt: "Total Pago", en: "Total Paid" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_URL",
          USER_TYPE_ID: "url",
          EDIT_FORM_LABEL: { pt: "Link de Pagamento", en: "Payment Link" },
          LIST_COLUMN_LABEL: { pt: "Link Pagamento", en: "Payment Link" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_INSTALLMENTS",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Nº de Parcelas", en: "Installments" },
          LIST_COLUMN_LABEL: { pt: "Nº Parcelas", en: "Installments" },
          LIST: [
            { VALUE: "1 Parcela", SORT: 100, DEF: "Y" },
            { VALUE: "2 Parcelas", SORT: 200 },
            { VALUE: "3 Parcelas", SORT: 300 },
            { VALUE: "4 Parcelas", SORT: 400 },
            { VALUE: "5 Parcelas", SORT: 500 },
            { VALUE: "6 Parcelas", SORT: 600 },
            { VALUE: "7 Parcelas", SORT: 700 },
            { VALUE: "8 Parcelas", SORT: 800 },
            { VALUE: "9 Parcelas", SORT: 900 },
            { VALUE: "10 Parcelas", SORT: 1000 },
            { VALUE: "11 Parcelas", SORT: 1100 },
            { VALUE: "12 Parcelas", SORT: 1200 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAID_INSTALLMENTS",
          USER_TYPE_ID: "integer",
          EDIT_FORM_LABEL: { pt: "Parcelas Pagas", en: "Paid Installments" },
          LIST_COLUMN_LABEL: { pt: "Parcelas Pagas", en: "Paid Installments" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_VALUE",
          USER_TYPE_ID: "double",
          EDIT_FORM_LABEL: { pt: "Valor da Parcela", en: "Installment Value" },
          LIST_COLUMN_LABEL: { pt: "Valor Parcela", en: "Installment Value" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_NEXT_DUE_DATE",
          USER_TYPE_ID: "date",
          EDIT_FORM_LABEL: { pt: "Próximo Vencimento", en: "Next Due Date" },
          LIST_COLUMN_LABEL: { pt: "Próx. Vencimento", en: "Next Due Date" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_METHOD",
          USER_TYPE_ID: "enumeration",
          EDIT_FORM_LABEL: { pt: "Método de Pagamento", en: "Payment Method" },
          LIST_COLUMN_LABEL: { pt: "Método Pagamento", en: "Payment Method" },
          LIST: [
            { VALUE: "Cartão", SORT: 100, DEF: "Y" },
            { VALUE: "PIX", SORT: 200 },
            { VALUE: "Boleto", SORT: 300 },
            { VALUE: "MB Way", SORT: 400 },
            { VALUE: "Multibanco", SORT: 500 },
            { VALUE: "Débito SEPA", SORT: 600 },
            { VALUE: "Direto", SORT: 700 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_NOTES",
          USER_TYPE_ID: "string",
          EDIT_FORM_LABEL: { pt: "Notas de Pagamento", en: "Payment Notes" },
          LIST_COLUMN_LABEL: { pt: "Notas Pagamento", en: "Payment Notes" },
        },
      ];

      // Create fields for both Deal and Lead entities
      const entityApis = [
        { name: "Deal", method: "crm.deal.userfield.add" },
        { name: "Lead", method: "crm.lead.userfield.add" },
      ];

      for (const entity of entityApis) {
        for (const field of emmelyUserFields) {
          const result = await callBitrix(clientEndpoint, accessToken, entity.method, { fields: field });
          const errStr = String(result.error || "") + " " + String(result.error_description || "");
          if (result.error && !errStr.includes("ALREADY") && !errStr.includes("DUPLICATE") && !errStr.includes("FIELD_NAME_DUPLICATED")) {
            console.error(`[INSTALL] ${entity.name} UserField ${field.FIELD_NAME} failed:`, result.error, result.error_description);
          } else {
            console.log(`[INSTALL] ${entity.name} UserField ${field.FIELD_NAME}: OK`);
            installSummary.userfields_registered.push(`${entity.name}:${field.FIELD_NAME}`);
          }
        }
      }

      if (installSummary.userfields_registered.length > 0) {
        installSummary.installed_modules.push("userfields");
      }

      await debugLog(supabase, integrationId, "userfields_registered", "outbound", {
        fields: installSummary.userfields_registered,
      });
    } catch (ufError) {
      console.error("[INSTALL] UserField creation error:", ufError);
      await debugLog(supabase, integrationId, "userfields_error", "outbound", null, String(ufError));
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
            amount: { Name: "Valor Total", Type: "double", Required: "Y", Description: "Valor total da cobrança" },
            currency: { Name: "Moeda", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL" }, Default: "EUR" },
            gateway: { 
              Name: "Gateway", 
              Type: "select", 
              Options: { 
                auto: "Automático", 
                stripe_pt: "Stripe Portugal (EUR)", 
                stripe_br: "Stripe Brasil (BRL)", 
                asaas: "Asaas (Brasil)", 
                direto: "Crediário Próprio" 
              }, 
              Default: "auto", 
              Description: "Automático: EUR→Stripe PT, BRL→Stripe BR ou Asaas" 
            },
            payment_method: { 
              Name: "Método de Pagamento", 
              Type: "select", 
              Options: { 
                card: "Cartão", 
                multibanco: "Multibanco (PT)", 
                mb_way: "MB WAY (PT)", 
                sepa_debit: "Débito SEPA (PT)", 
                pix: "PIX (BR)", 
                boleto: "Boleto (BR)", 
                link: "Link de Pagamento",
                direto: "Recebimento Direto" 
              }, 
              Default: "card" 
            },
            customer_name: { Name: "Nome do Cliente", Type: "string" },
            customer_email: { Name: "Email do Cliente", Type: "string" },
            customer_cpf: { Name: "CPF/CNPJ", Type: "string", Description: "Obrigatório para Asaas" },
            description: { Name: "Descrição", Type: "string" },
            installments: { Name: "Número de Parcelas", Type: "int", Default: "1", Description: "Quantidade de parcelas mensais" },
            down_payment: { Name: "Valor de Entrada", Type: "double", Default: "0", Description: "Valor de entrada (opcional)" },
            first_due_date: { Name: "Data 1º Vencimento", Type: "date", Description: "Data da primeira parcela (YYYY-MM-DD)" },
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "ID do Deal para vincular faturas" },
            contact_id: { Name: "ID do Contacto", Type: "string", Description: "ID do Contacto para vincular faturas" },
            company_id: { Name: "ID da Empresa", Type: "string", Description: "UUID da empresa/filial em Emmely" },
          },
          RETURN_PROPERTIES: {
            charge_id: { Name: "ID da Cobrança", Type: "string" },
            charge_status: { Name: "Status", Type: "string" },
            payment_url: { Name: "URL de Pagamento", Type: "string" },
            pix_code: { Name: "Código PIX", Type: "string" },
            gateway_used: { Name: "Gateway Utilizado", Type: "string" },
            invoices_created: { Name: "Faturas Criadas", Type: "string" },
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
        {
          CODE: "emmely_execute_flow",
          NAME: "Emmely: Executar Flow",
          PROPERTIES: {
            flow_id: { Name: "ID do Flow", Type: "string", Required: "Y", Description: "UUID do flow a executar" },
            phone: { Name: "Telefone", Type: "string", Required: "Y", Description: "Número de telefone com código do país" },
            trigger_message: { Name: "Mensagem Trigger", Type: "string", Description: "Mensagem para iniciar o flow", Default: "iniciar" },
          },
          RETURN_PROPERTIES: {
            status: { Name: "Status", Type: "string" },
            conversation_id: { Name: "ID da Conversa", Type: "string" },
            flow_name: { Name: "Nome do Flow", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_generate_proposal",
          NAME: "Emmely: Gerar Proposta",
          PROPERTIES: {
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "ID do Deal no Bitrix24" },
            lead_id: { Name: "ID do Lead", Type: "string", Description: "ID do Lead no Bitrix24" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead" }, Default: "deal" },
            title: { Name: "Título da Proposta", Type: "string", Description: "Opcional — usa título do negócio se vazio" },
            service_name: { Name: "Nome do Serviço", Type: "string", Description: "Busca valor/descrição na tabela de serviços" },
            payment_type: { Name: "Tipo de Pagamento", Type: "select", Options: { fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado" }, Default: "fixo" },
            installments: { Name: "Parcelas", Type: "int", Default: "1" },
            value: { Name: "Valor", Type: "double", Description: "Valor manual (senão usa serviço ou OPPORTUNITY)" },
            description: { Name: "Descrição", Type: "text", Description: "Descrição manual da proposta" },
            conditions: { Name: "Condições", Type: "text" },
            valid_days: { Name: "Dias de Validade", Type: "int", Default: "30" },
          },
          RETURN_PROPERTIES: {
            proposal_url: { Name: "URL da Proposta", Type: "string" },
            pdf_url: { Name: "URL do PDF", Type: "string" },
            proposal_id: { Name: "ID da Proposta", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_convert_currency",
          NAME: "Emmely: Converter Moeda",
          PROPERTIES: {
            source_value: { Name: "Valor Original", Type: "double", Required: "Y", Description: "Campo com o valor a converter" },
            source_currency: { Name: "Moeda Origem", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL", USD: "USD", GBP: "GBP", CHF: "CHF", CAD: "CAD" }, Default: "EUR" },
            target_currency: { Name: "Moeda Destino", Type: "select", Required: "Y", Options: { BRL: "BRL", EUR: "EUR", USD: "USD", GBP: "GBP", CHF: "CHF", CAD: "CAD" }, Default: "BRL" },
            spread_percent: { Name: "Spread (%)", Type: "double", Default: "0", Description: "Margem adicional sobre a cotação (ex: 2 = +2%)" },
          },
          RETURN_PROPERTIES: {
            converted_value: { Name: "Valor Convertido", Type: "double" },
            exchange_rate: { Name: "Taxa de Câmbio", Type: "double" },
            rate_date: { Name: "Data da Cotação", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_create_badge",
          NAME: "Emmely: Criar Badge",
          PROPERTIES: {
            badge_code: { Name: "Código da Badge", Type: "string", Required: "Y", Description: "Código da badge (ex: emmely_payment_confirmed ou custom)" },
            header_title: { Name: "Título", Type: "string", Required: "Y", Description: "Título exibido na timeline" },
            message_preview: { Name: "Preview", Type: "string", Description: "Texto de preview na timeline" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead", contact: "Contacto" }, Default: "deal" },
            entity_id: { Name: "ID da Entidade", Type: "string", Required: "Y", Description: "ID do deal/lead/contact" },
            badge_type: { Name: "Tipo Visual", Type: "select", Options: { success: "Sucesso (verde)", primary: "Primário (azul)", warning: "Alerta (amarelo)", failure: "Erro (vermelho)", secondary: "Secundário (cinza)" }, Default: "success" },
          },
          RETURN_PROPERTIES: {
            badge_status: { Name: "Status", Type: "string" },
            activity_id: { Name: "ID da Atividade", Type: "string" },
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
          installSummary.robots_registered.push(robot.CODE);
        }
      }

      installSummary.installed_modules.push("robots");

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
        installSummary.placements_registered.push("IM_TEXTAREA");
      }

      await debugLog(supabase, integrationId, "placement_bind", "outbound", { result: placementResult });
    } catch (placementError) {
      console.error("[INSTALL] placement.bind error:", placementError);
      await debugLog(supabase, integrationId, "placement_bind_error", "outbound", null, String(placementError));
    }

    // --- Register IM_SIDEBAR placement (Emmely AI Assistant sidebar in messenger) ---
    try {
      const imSidebarUrl = `${supabaseUrl}/functions/v1/bitrix24-im-sidebar`;

      await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_SIDEBAR",
        HANDLER: imSidebarUrl,
      });

      const sidebarResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
        PLACEMENT: "IM_SIDEBAR",
        HANDLER: imSidebarUrl,
        TITLE: "Emmely AI Assistant",
        DESCRIPTION: "Consultar a IA antes de responder ao cliente",
        LANG_ALL: {
          pt: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Consultar a IA antes de responder" },
          en: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Consult AI before replying" },
          es: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Consultar la IA antes de responder" },
          ru: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Консультация ИИ перед ответом" },
        },
        OPTIONS: {
          iconName: "fa-robot",
          context: "ALL",
          role: "USER",
          extranet: "N",
        },
      });

      const sidebarErr = sidebarResult.error || "";
      if (sidebarErr && !String(sidebarErr).toLowerCase().includes("already")) {
        console.error("[INSTALL] placement.bind IM_SIDEBAR error:", sidebarErr);
      } else {
        console.log("[INSTALL] placement.bind IM_SIDEBAR: OK");
        installSummary.placements_registered.push("IM_SIDEBAR");
      }
    } catch (sidebarError) {
      console.error("[INSTALL] IM_SIDEBAR placement error:", sidebarError);
    }

    // --- Register IM_CONTEXT_MENU placement (Analyze with Emmely on messages) ---
    try {
      const imContextMenuUrl = `${supabaseUrl}/functions/v1/bitrix24-im-context-menu`;

      await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_CONTEXT_MENU",
        HANDLER: imContextMenuUrl,
      });

      const ctxMenuResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
        PLACEMENT: "IM_CONTEXT_MENU",
        HANDLER: imContextMenuUrl,
        TITLE: "Analisar com Emmely",
        DESCRIPTION: "Resumir, traduzir ou sugerir resposta",
        LANG_ALL: {
          pt: { TITLE: "Analisar com Emmely", DESCRIPTION: "Resumir, traduzir ou sugerir resposta" },
          en: { TITLE: "Analyze with Emmely", DESCRIPTION: "Summarize, translate or suggest reply" },
          es: { TITLE: "Analizar con Emmely", DESCRIPTION: "Resumir, traducir o sugerir respuesta" },
          ru: { TITLE: "Анализ с Emmely", DESCRIPTION: "Резюме, перевод или предложение ответа" },
        },
      });

      const ctxMenuErr = ctxMenuResult.error || "";
      if (ctxMenuErr && !String(ctxMenuErr).toLowerCase().includes("already")) {
        console.error("[INSTALL] placement.bind IM_CONTEXT_MENU error:", ctxMenuErr);
      } else {
        console.log("[INSTALL] placement.bind IM_CONTEXT_MENU: OK");
        installSummary.placements_registered.push("IM_CONTEXT_MENU");
      }
    } catch (ctxMenuError) {
      console.error("[INSTALL] IM_CONTEXT_MENU placement error:", ctxMenuError);
    }

    // --- Register CRM Detail Tab placements (Lead, Contact, Deal, SPA) ---
    try {
      const crmTabUrl = `${supabaseUrl}/functions/v1/bitrix24-crm-tab`;
      const paymentTabUrl = `${supabaseUrl}/functions/v1/bitrix24-payment-tab`;
      const crmPlacements = [
        "CRM_LEAD_DETAIL_TAB",
        "CRM_CONTACT_DETAIL_TAB",
        "CRM_DEAL_DETAIL_TAB",
        "CRM_DYNAMIC_DETAIL_TAB",
      ];

      for (const placement of crmPlacements) {
        await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
          PLACEMENT: placement,
          HANDLER: crmTabUrl,
        });

        const crmTabResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
          PLACEMENT: placement,
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
          console.error(`[INSTALL] placement.bind ${placement} error:`, crmTabErr);
        } else {
          console.log(`[INSTALL] placement.bind ${placement}: OK`);
          installSummary.placements_registered.push(placement);
        }
      }

      // --- Register Emmely Pay tab on CRM_DEAL_DETAIL_TAB ---
      try {
        await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
          PLACEMENT: "CRM_DEAL_DETAIL_TAB",
          HANDLER: paymentTabUrl,
        });

        const payTabResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
          PLACEMENT: "CRM_DEAL_DETAIL_TAB",
          HANDLER: paymentTabUrl,
          TITLE: "Emmely Pay",
          DESCRIPTION: "Controlo de pagamentos do negócio",
          LANG_ALL: {
            pt: { TITLE: "Emmely Pay", DESCRIPTION: "Controlo de pagamentos do negócio" },
            en: { TITLE: "Emmely Pay", DESCRIPTION: "Deal payment control" },
            es: { TITLE: "Emmely Pay", DESCRIPTION: "Control de pagos del negocio" },
          },
        });

        const payTabErr = payTabResult.error || "";
        if (payTabErr && !String(payTabErr).toLowerCase().includes("already")) {
          console.error("[INSTALL] placement.bind CRM_DEAL_DETAIL_TAB (pay) error:", payTabErr);
        } else {
          console.log("[INSTALL] placement.bind CRM_DEAL_DETAIL_TAB (Emmely Pay): OK");
          installSummary.placements_registered.push("CRM_DEAL_DETAIL_TAB_PAY");
        }
      } catch (payTabErr) {
        console.error("[INSTALL] Payment tab placement error:", payTabErr);
      }

      installSummary.installed_modules.push("crm_tabs");
      await debugLog(supabase, integrationId, "crm_tab_placements_bind", "outbound", {
        placements: crmPlacements,
        registered: installSummary.placements_registered,
      });
    } catch (crmTabError) {
      console.error("[INSTALL] CRM tab placement error:", crmTabError);
      await debugLog(supabase, integrationId, "crm_tab_placement_error", "outbound", null, String(crmTabError));
    }

    // --- Register Emmely Pay as Bitrix24 Payment System (CHECKOUT mode) ---
    try {
      const paymentHandlerUrl = `${supabaseUrl}/functions/v1/bitrix24-payment-handler`;

      // 1. Delete existing handler (safe for reinstall)
      await callBitrix(clientEndpoint, accessToken, "sale.paysystem.handler.delete", {
        ID: "emmely_pay",
      });

      // 2. Register payment handler with CHECKOUT mode
      const handlerResult = await callBitrix(clientEndpoint, accessToken, "sale.paysystem.handler.add", {
        NAME: "Emmely Pay",
        CODE: "emmely_pay",
        SORT: 100,
        SETTINGS: {
          CURRENCY: ["BRL", "EUR", "USD"],
          CLIENT_TYPE: "b2c",
          CHECKOUT_DATA: {
            ACTION_URI: paymentHandlerUrl,
          },
          CODES: {
            PAYMENT_ID: {
              NAME: "Número do Pagamento",
              SORT: "100",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "PAYMENT",
                PROVIDER_VALUE: "ACCOUNT_NUMBER",
              },
            },
            PAYMENT_SHOULD_PAY: {
              NAME: "Valor do Pagamento",
              SORT: "200",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "PAYMENT",
                PROVIDER_VALUE: "SUM",
              },
            },
            PAYMENT_CURRENCY: {
              NAME: "Moeda",
              SORT: "300",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "PAYMENT",
                PROVIDER_VALUE: "CURRENCY",
              },
            },
            CUSTOMER_NAME: {
              NAME: "Nome do Cliente",
              SORT: "400",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "USER",
                PROVIDER_VALUE: "NAME",
              },
            },
            CUSTOMER_EMAIL: {
              NAME: "Email do Cliente",
              SORT: "500",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "USER",
                PROVIDER_VALUE: "EMAIL",
              },
            },
            CUSTOMER_CPF_CNPJ: {
              NAME: "CPF/CNPJ do Cliente",
              SORT: "600",
              DESCRIPTION: "Obrigatório para pagamentos em BRL (PIX/Boleto)",
            },
            PS_CHANGE_STATUS_PAY: {
              NAME: "Mudança automática de status",
              SORT: "700",
              INPUT: { TYPE: "Y/N" },
            },
          },
        },
      });

      const handlerErr = String(handlerResult.error || "");
      if (handlerResult.error && !handlerErr.includes("ALREADY")) {
        console.error("[INSTALL] Payment handler registration failed:", handlerResult.error, handlerResult.error_description);
      } else {
        console.log("[INSTALL] Payment handler 'emmely_pay': registered OK");
      }

      // 3. Create the actual payment system for CRM invoices
      // We try both ORDER and CRM_INVOICE bindings
      for (const entityType of ["ORDER", "CRM_INVOICE"]) {
        const psResult = await callBitrix(clientEndpoint, accessToken, "sale.paysystem.add", {
          NAME: entityType === "CRM_INVOICE" ? "Emmely Pay (Fatura)" : "Emmely Pay",
          DESCRIPTION: "Pagamento via PIX, Boleto ou Cartão através do Emmely Cloud",
          XML_ID: `emmely_pay_${entityType.toLowerCase()}`,
          PERSON_TYPE_ID: 1,
          BX_REST_HANDLER: "emmely_pay",
          ACTIVE: "Y",
          ENTITY_REGISTRY_TYPE: entityType,
          NEW_WINDOW: "Y",
          SETTINGS: {
            PAYMENT_ID: { TYPE: "PAYMENT", VALUE: "ACCOUNT_NUMBER" },
            PAYMENT_SHOULD_PAY: { TYPE: "PAYMENT", VALUE: "SUM" },
            PAYMENT_CURRENCY: { TYPE: "PAYMENT", VALUE: "CURRENCY" },
            CUSTOMER_NAME: { TYPE: "USER", VALUE: "NAME" },
            CUSTOMER_EMAIL: { TYPE: "USER", VALUE: "EMAIL" },
            PS_CHANGE_STATUS_PAY: { TYPE: "Y\\N", VALUE: "Y" },
          },
        });

        const psErr = String(psResult.error || "");
        if (psResult.error && !psErr.includes("ALREADY") && !psErr.includes("DUPLICATE")) {
          console.error(`[INSTALL] PaySystem ${entityType} creation failed:`, psResult.error, psResult.error_description);
        } else {
          console.log(`[INSTALL] PaySystem ${entityType}: created OK, ID:`, psResult.result);
        }
      }

      installSummary.paysystem_handler_registered = true;
      installSummary.installed_modules.push("paysystem");

      await debugLog(supabase, integrationId, "paysystem_setup", "outbound", {
        handler: "emmely_pay",
        url: paymentHandlerUrl,
      });
    } catch (paySystemError) {
      console.error("[INSTALL] PaySystem setup error:", paySystemError);
      await debugLog(supabase, integrationId, "paysystem_setup_error", "outbound", null, String(paySystemError));
    }

    // --- Final config merge with install summary ---
    try {
      const { data: currentConfig } = await supabase
        .from("bitrix24_integrations")
        .select("config")
        .eq("id", integrationId)
        .single();

      const existingConfig = currentConfig?.config || {};

      await supabase
        .from("bitrix24_integrations")
        .update({
          config: {
            ...existingConfig,
            ...installSummary,
            install_completed_at: new Date().toISOString(),
          },
        })
        .eq("id", integrationId);

      console.log("[INSTALL] Final config merge complete:", JSON.stringify(installSummary).substring(0, 500));
      await debugLog(supabase, integrationId, "install_summary", "outbound", installSummary);
    } catch (configErr) {
      console.error("[INSTALL] Config merge error:", configErr);
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
