import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}`;
  console.log(`[BOT] Calling ${method}`, JSON.stringify(params).substring(0, 200));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  const data = await res.json();
  console.log(`[BOT] ${method} response:`, JSON.stringify(data).substring(0, 500));
  return data;
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
    const endpoint = integration.client_endpoint;

    console.log("[BOT] Starting bot re-registration for domain:", integration.domain);

    // ── Step 1: List all current bots ──
    const listResult = await callBitrix(endpoint, accessToken, "imbot.bot.list", {});
    const botsRaw = listResult.result || {};
    const botsArray: any[] = Array.isArray(botsRaw) ? botsRaw : Object.values(botsRaw);
    
    console.log("[BOT] Found bots:", botsArray.length, "total");
    botsArray.forEach((b: any) => {
      console.log(`[BOT]  - ID:${b.ID} CODE:${b.CODE} NAME:${b.NAME} TYPE:${b.TYPE} OPENLINE:${b.OPENLINE}`);
    });

    // ── Step 2: Unregister any Emmely bot ──
    for (const bot of botsArray) {
      if (
        bot.CODE === "emmely_ai_bot" ||
        (bot.NAME && bot.NAME.toLowerCase().includes("emmely"))
      ) {
        console.log(`[BOT] Unregistering bot ID:${bot.ID} (${bot.NAME})`);
        const unregRes = await callBitrix(endpoint, accessToken, "imbot.unregister", { BOT_ID: bot.ID });
        console.log(`[BOT] Unregister result:`, JSON.stringify(unregRes));
      }
    }

    // ── Step 3: Register fresh with correct params ──
    // According to Bitrix24 official docs:
    // - TYPE: "B" = standard bot (can be used in open lines when OPENLINE: "Y")
    // - TYPE: "O" = open line bot only
    // - OPENLINE: "Y" must be at ROOT level, NOT inside PROPERTIES
    // - EVENT_JOIN_CHAT is required to appear in the chatbot selector
    // - EVENT_WELCOME_MESSAGE fires when user opens the conversation
    // - EVENT_MESSAGE_ADD fires on every message
    const registerParams: Record<string, any> = {
      CODE: "emmely_ai_bot",
      TYPE: "B",
      OPENLINE: "Y",                   // ROOT level — CRITICAL for Contact Center visibility
      EVENT_MESSAGE_ADD: eventsUrl,     // Required: handles incoming messages
      EVENT_WELCOME_MESSAGE: eventsUrl, // Required: fires when chat opens
      EVENT_JOIN_CHAT: eventsUrl,       // Required: bot assigned to open line
      EVENT_BOT_DELETE: eventsUrl,      // Cleanup handler
      PROPERTIES: {
        NAME: "Emmely AI",
        WORK_POSITION: "Assistente Virtual IA",
        COLOR: "GREEN",                 // Valid color name (not hex)
      },
    };

    console.log("[BOT] Registering bot with params:", JSON.stringify(registerParams));
    const regResult = await callBitrix(endpoint, accessToken, "imbot.register", registerParams);
    
    let botId: string | null = null;

    if (regResult.result) {
      botId = String(regResult.result);
      console.log("[BOT] ✅ Bot registered successfully! ID:", botId);
    } else if (regResult.error) {
      const errStr = `${regResult.error}: ${regResult.error_description || ""}`;
      console.error("[BOT] ❌ Registration failed:", errStr);

      // Try TYPE: "O" as fallback — Open Lines dedicated bot
      console.log("[BOT] Trying fallback with TYPE: O (Open Lines bot)");
      const regResult2 = await callBitrix(endpoint, accessToken, "imbot.register", {
        ...registerParams,
        TYPE: "O",   // Open Lines dedicated bot type
      });
      
      if (regResult2.result) {
        botId = String(regResult2.result);
        console.log("[BOT] ✅ Bot registered with TYPE:O, ID:", botId);
      } else {
        console.error("[BOT] ❌ Fallback also failed:", regResult2.error, regResult2.error_description);
        return new Response(JSON.stringify({
          success: false,
          error: errStr,
          fallback_error: `${regResult2.error}: ${regResult2.error_description}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Step 4: Save bot_id in config ──
    if (botId) {
      const { data: currentIntData } = await supabase
        .from("bitrix24_integrations")
        .select("config")
        .eq("id", integration.id)
        .single();

      const existingConfig = (currentIntData?.config as any) || {};

      await supabase
        .from("bitrix24_integrations")
        .update({
          config: {
            ...existingConfig,
            bot_id: botId,
            bot_registered_at: new Date().toISOString(),
          },
        })
        .eq("id", integration.id);

      console.log("[BOT] bot_id saved:", botId);
    }

    // ── Step 5: Verify bot now appears in list ──
    const verifyList = await callBitrix(endpoint, accessToken, "imbot.bot.list", {});
    const verifyRaw = verifyList.result || {};
    const verifyArray: any[] = Array.isArray(verifyRaw) ? verifyRaw : Object.values(verifyRaw);
    const registeredBot = verifyArray.find((b: any) => b.CODE === "emmely_ai_bot" || String(b.ID) === botId);
    
    console.log("[BOT] Verification — bot in list:", JSON.stringify(registeredBot));
    console.log("[BOT] All bots after registration:", verifyArray.map((b: any) => `ID:${b.ID} CODE:${b.CODE} NAME:${b.NAME} TYPE:${b.TYPE} OPENLINE:${b.OPENLINE}`).join(", "));

    // ── Step 6: Register/update robots with new payment fields ──
    console.log("[BOT] Updating robot emmely_create_charge with installment fields...");
    try {
      // First try to update existing robot, then register if not found
      const robotUpdateResult = await callBitrix(endpoint, accessToken, "bizproc.robot.update", {
        CODE: "emmely_create_charge",
        HANDLER: `${supabaseUrl}/functions/v1/bitrix24-robot-handler`,
        AUTH_USER_ID: 1,
        NAME: "Emmely: Criar Cobrança",
        PROPERTIES: {
          amount: { Name: "Valor Total", Type: "double", Required: "Y", Default: "0" },
          currency: { Name: "Moeda", Type: "select", Required: "N", Default: "EUR", Options: { EUR: "EUR (Euro)", BRL: "BRL (Real)" } },
          gateway: { Name: "Gateway de Pagamento", Type: "select", Required: "Y", Default: "auto", Options: { auto: "Automático", stripe_pt: "Stripe Portugal (EUR)", stripe_br: "Stripe Brasil (BRL)", asaas: "Asaas Brasil (BRL)", direto: "Crediário Próprio" } },
          payment_method: { Name: "Método de Pagamento", Type: "select", Required: "N", Default: "card", Options: { card: "Cartão", pix: "PIX", boleto: "Boleto", direto: "Direto" } },
          installments: { Name: "Nº de Parcelas", Type: "int", Required: "Y", Default: "1" },
          first_due_date: { Name: "Data 1º Vencimento (DD/MM/AAAA)", Type: "date", Required: "Y" },
          down_payment: { Name: "Valor de Entrada (0 se não houver)", Type: "double", Required: "N", Default: "0" },
          deal_id: { Name: "ID do Negócio", Type: "int", Required: "N" },
          contact_id: { Name: "ID do Contacto", Type: "int", Required: "N" },
          company_id: { Name: "Empresa (UUID)", Type: "string", Required: "N" },
          customer_name: { Name: "Nome do Cliente", Type: "string", Required: "N" },
          customer_email: { Name: "Email do Cliente", Type: "string", Required: "N" },
          customer_cpf: { Name: "CPF/CNPJ", Type: "string", Required: "N" },
          description: { Name: "Descrição", Type: "string", Required: "N", Default: "Cobrança Emmely" },
        },
        RETURN_PROPERTIES: {
          charge_id: { Name: "ID da Cobrança", Type: "string" },
          charge_status: { Name: "Status", Type: "string" },
          gateway_used: { Name: "Gateway Utilizado", Type: "string" },
          invoices_created: { Name: "Faturas Criadas", Type: "int" },
          payment_url: { Name: "URL de Pagamento", Type: "string" },
          error: { Name: "Erro", Type: "string" },
        },
        USE_SUBSCRIPTION: "Y",
      });
      console.log("[BOT] Robot update result:", JSON.stringify(robotUpdateResult).substring(0, 300));
    } catch (robotErr) {
      console.error("[BOT] Robot update error:", robotErr);
    }

    return new Response(JSON.stringify({
      success: true,
      bot_id: botId,
      bot_details: registeredBot || null,
      all_bots: verifyArray.map((b: any) => ({ id: b.ID, code: b.CODE, name: b.NAME, type: b.TYPE, openline: b.OPENLINE })),
      domain: integration.domain,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[BOT] Fatal error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
