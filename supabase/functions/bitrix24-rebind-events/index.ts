import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const url = new URL(req.url);
    const memberId = url.searchParams.get("member_id");
    let body: any = {};
    try { body = await req.json(); } catch {}
    const mid = memberId || body.member_id;

    // Find integration
    let integration: any = null;
    if (mid) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").eq("member_id", mid).single();
      integration = data;
    }
    if (!integration) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").order("created_at", { ascending: false }).limit(1).single();
      integration = data;
    }

    if (!integration) {
      return new Response(JSON.stringify({ error: "No integration found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = await ensureValidToken(supabase, integration);
    const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;

    const events = [
      "OnImConnectorMessageAdd",
      "OnImConnectorDialogStart",
      "OnImConnectorDialogFinish",
      "OnImConnectorStatusDelete",
      "OnImbotMessageAdd",
      "OnImbotJoinChat",    // obrigatório para Open Lines chatbot selector
      // NOTA: OnImbotWelcomeMessage e OnImbotJoinOpen NÃO existem como event.bind — são parâmetros do imbot.register
    ];

    const results: Record<string, any> = {};

    // First unbind all to ensure clean state
    for (const event of events) {
      try {
        await callBitrix(integration.client_endpoint, accessToken, "event.unbind", {
          event,
          handler: eventsUrl,
        });
      } catch {}
    }

    // Re-bind all events
    for (const event of events) {
      const bindResult = await callBitrix(integration.client_endpoint, accessToken, "event.bind", {
        event,
        handler: eventsUrl,
      });
      results[event] = bindResult.error
        ? `ERROR: ${bindResult.error}`
        : "OK";
      console.log(`[REBIND] ${event}:`, JSON.stringify(bindResult));
    }

    // Re-bind IM_TEXTAREA placement (Devolver ao Bot button)
    const returnToBotUrl = `${supabaseUrl}/functions/v1/bitrix24-return-to-bot`;
    // Icon: use Bitrix24 CDN-compatible robot SVG as background-image
    const iconUrl = "https://cdn-icons-png.flaticon.com/32/4712/4712109.png";
    try {
      await callBitrix(integration.client_endpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_TEXTAREA",
        HANDLER: returnToBotUrl,
      });
      const placementResult = await callBitrix(integration.client_endpoint, accessToken, "placement.bind", {
        PLACEMENT: "IM_TEXTAREA",
        HANDLER: returnToBotUrl,
        TITLE: "Devolver ao Bot",
        DESCRIPTION: "Devolver conversa ao assistente IA",
        ICON: iconUrl,
        LANG_ALL: {
          pt: { TITLE: "Devolver ao Bot", DESCRIPTION: "Devolver conversa ao assistente IA" },
          en: { TITLE: "Return to Bot", DESCRIPTION: "Return conversation to AI assistant" },
          es: { TITLE: "Devolver al Bot", DESCRIPTION: "Devolver conversación al asistente IA" },
          ru: { TITLE: "Вернуть боту", DESCRIPTION: "Вернуть разговор ИИ-ассистенту" },
        },
        OPTIONS: {
          iconName: "fa-robot",
          icon: iconUrl,
          color: "GREEN",
          width: "400",
          height: "200",
        },
      });
      results["placement_IM_TEXTAREA"] = placementResult.error
        ? `ERROR: ${placementResult.error}`
        : "OK";
      console.log("[REBIND] placement.bind IM_TEXTAREA:", JSON.stringify(placementResult));
    } catch (pe) {
      results["placement_IM_TEXTAREA"] = `ERROR: ${pe}`;
      console.error("[REBIND] placement.bind error:", pe);
    }

    // --- Register CRM_LEAD_DETAIL_TAB placement (Emmely AI tab in Lead detail) ---
    const crmTabUrl = `${supabaseUrl}/functions/v1/bitrix24-crm-tab`;
    try {
      await callBitrix(integration.client_endpoint, accessToken, "placement.unbind", {
        PLACEMENT: "CRM_LEAD_DETAIL_TAB",
        HANDLER: crmTabUrl,
      });
      const crmTabResult = await callBitrix(integration.client_endpoint, accessToken, "placement.bind", {
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
      results["placement_CRM_LEAD_DETAIL_TAB"] = crmTabResult.error
        ? `ERROR: ${crmTabResult.error}`
        : "OK";
      console.log("[REBIND] placement.bind CRM_LEAD_DETAIL_TAB:", JSON.stringify(crmTabResult));
    } catch (crmTabErr) {
      results["placement_CRM_LEAD_DETAIL_TAB"] = `ERROR: ${crmTabErr}`;
      console.error("[REBIND] placement.bind CRM_LEAD_DETAIL_TAB error:", crmTabErr);
    }

    // --- Register IM_SIDEBAR placement (Emmely AI Assistant sidebar in messenger) ---
    const imSidebarUrl = `${supabaseUrl}/functions/v1/bitrix24-im-sidebar`;
    try {
      await callBitrix(integration.client_endpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_SIDEBAR",
        HANDLER: imSidebarUrl,
      });
      const sidebarResult = await callBitrix(integration.client_endpoint, accessToken, "placement.bind", {
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
      results["placement_IM_SIDEBAR"] = sidebarResult.error
        ? `ERROR: ${sidebarResult.error}`
        : "OK";
      console.log("[REBIND] placement.bind IM_SIDEBAR:", JSON.stringify(sidebarResult));
    } catch (sidebarErr) {
      results["placement_IM_SIDEBAR"] = `ERROR: ${sidebarErr}`;
      console.error("[REBIND] placement.bind IM_SIDEBAR error:", sidebarErr);
    }

    // --- Register IM_CONTEXT_MENU placement (Analyze with Emmely on messages) ---
    const imContextMenuUrl = `${supabaseUrl}/functions/v1/bitrix24-im-context-menu`;
    try {
      await callBitrix(integration.client_endpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_CONTEXT_MENU",
        HANDLER: imContextMenuUrl,
      });
      const ctxMenuResult = await callBitrix(integration.client_endpoint, accessToken, "placement.bind", {
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
      results["placement_IM_CONTEXT_MENU"] = ctxMenuResult.error
        ? `ERROR: ${ctxMenuResult.error}`
        : "OK";
      console.log("[REBIND] placement.bind IM_CONTEXT_MENU:", JSON.stringify(ctxMenuResult));
    } catch (ctxMenuErr) {
      results["placement_IM_CONTEXT_MENU"] = `ERROR: ${ctxMenuErr}`;
      console.error("[REBIND] placement.bind IM_CONTEXT_MENU error:", ctxMenuErr);
    }

    // Also verify event.get to confirm bindings
    const boundEvents = await callBitrix(integration.client_endpoint, accessToken, "event.get", {});
    console.log("[REBIND] Current bindings:", JSON.stringify(boundEvents).substring(0, 500));

    // Verify placement.get to confirm IM_TEXTAREA registration
    const placementGet = await callBitrix(integration.client_endpoint, accessToken, "placement.get", {
      PLACEMENT: "IM_TEXTAREA",
    });
    console.log("[REBIND] placement.get IM_TEXTAREA:", JSON.stringify(placementGet).substring(0, 1000));

    return new Response(JSON.stringify({
      success: true,
      results,
      bound_events: boundEvents.result || [],
      placement_im_textarea: placementGet.result || placementGet,
      integration_domain: integration.domain,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[REBIND] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
