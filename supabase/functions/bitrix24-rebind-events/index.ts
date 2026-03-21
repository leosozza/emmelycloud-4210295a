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

    // ── Re-bind IM_TEXTAREA placement (Devolver ao Bot button) ──
    const returnToBotUrl = `${supabaseUrl}/functions/v1/bitrix24-return-to-bot`;
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
        LANG_ALL: {
          pt: { TITLE: "Devolver ao Bot", DESCRIPTION: "Devolver conversa ao assistente IA" },
          en: { TITLE: "Return to Bot", DESCRIPTION: "Return conversation to AI assistant" },
          es: { TITLE: "Devolver al Bot", DESCRIPTION: "Devolver conversación al asistente IA" },
          ru: { TITLE: "Вернуть боту", DESCRIPTION: "Вернуть разговор ИИ-ассистенту" },
        },
        OPTIONS: {
          iconName: "fa-robot",
          context: "LINES",
          color: "GREEN",
          role: "USER",
          width: "400",
          height: "200",
          extranet: "N",
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

    // ── CRM Detail Tabs — Emmely AI (crm-tab) ──
    const crmTabUrl = `${supabaseUrl}/functions/v1/bitrix24-crm-tab`;
    const crmAiPlacements = [
      "CRM_LEAD_DETAIL_TAB",
      "CRM_CONTACT_DETAIL_TAB",
      "CRM_DEAL_DETAIL_TAB",
      "CRM_DYNAMIC_DETAIL_TAB",
    ];
    for (const placement of crmAiPlacements) {
      try {
        await callBitrix(integration.client_endpoint, accessToken, "placement.unbind", {
          PLACEMENT: placement,
          HANDLER: crmTabUrl,
        });
        const r = await callBitrix(integration.client_endpoint, accessToken, "placement.bind", {
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
        results[`placement_${placement}_AI`] = r.error ? `ERROR: ${r.error}` : "OK";
        console.log(`[REBIND] placement.bind ${placement} (AI):`, JSON.stringify(r));
      } catch (e) {
        results[`placement_${placement}_AI`] = `ERROR: ${e}`;
        console.error(`[REBIND] placement.bind ${placement} (AI) error:`, e);
      }
    }

    // ── CRM Detail Tabs — Emmely Pay (payment-tab) ──
    const paymentTabUrl = `${supabaseUrl}/functions/v1/bitrix24-payment-tab`;
    const crmPayPlacements = [
      "CRM_DEAL_DETAIL_TAB",
      "CRM_CONTACT_DETAIL_TAB",
    ];
    for (const placement of crmPayPlacements) {
      try {
        await callBitrix(integration.client_endpoint, accessToken, "placement.unbind", {
          PLACEMENT: placement,
          HANDLER: paymentTabUrl,
        });
        const r = await callBitrix(integration.client_endpoint, accessToken, "placement.bind", {
          PLACEMENT: placement,
          HANDLER: paymentTabUrl,
          TITLE: "Emmely Pay",
          DESCRIPTION: "Controle financeiro e parcelas",
          LANG_ALL: {
            pt: { TITLE: "Emmely Pay", DESCRIPTION: "Controle financeiro e parcelas" },
            en: { TITLE: "Emmely Pay", DESCRIPTION: "Financial control and installments" },
            es: { TITLE: "Emmely Pay", DESCRIPTION: "Control financiero y cuotas" },
            ru: { TITLE: "Emmely Pay", DESCRIPTION: "Финансовый контроль и платежи" },
          },
        });
        results[`placement_${placement}_PAY`] = r.error ? `ERROR: ${r.error}` : "OK";
        console.log(`[REBIND] placement.bind ${placement} (Pay):`, JSON.stringify(r));
      } catch (e) {
        results[`placement_${placement}_PAY`] = `ERROR: ${e}`;
        console.error(`[REBIND] placement.bind ${placement} (Pay) error:`, e);
      }
    }

    // ── IM_SIDEBAR placement ──
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

    // ── IM_CONTEXT_MENU placement ──
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

    // Verify bindings
    const boundEvents = await callBitrix(integration.client_endpoint, accessToken, "event.get", {});
    console.log("[REBIND] Current bindings:", JSON.stringify(boundEvents).substring(0, 500));

    return new Response(JSON.stringify({
      success: true,
      results,
      bound_events: boundEvents.result || [],
      integration_domain: integration.domain,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[REBIND] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
