import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshToken(supabase: any, integration: any): Promise<string> {
  console.log("[BOT] Forcing token refresh for domain:", integration.domain);
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
  if (data.error) throw new Error(`Token refresh failed: ${data.error} - ${data.error_description || ""}`);
  
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: newExpiresAt,
  }).eq("id", integration.id);
  
  // Update the integration object in memory too
  integration.access_token = data.access_token;
  integration.refresh_token = data.refresh_token;
  integration.expires_at = newExpiresAt;
  
  console.log("[BOT] Token refreshed successfully, expires at:", newExpiresAt);
  return data.access_token;
}

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}?auth=${encodeURIComponent(token)}`;
  console.log(`[BOT] Calling ${method}`, JSON.stringify(params).substring(0, 200));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  console.log(`[BOT] ${method} response:`, JSON.stringify(data).substring(0, 500));
  return data;
}

// Wrapper that retries on expired_token
async function callBitrixWithRetry(
  endpoint: string, 
  token: string, 
  method: string, 
  params: Record<string, any>,
  supabase: any,
  integration: any
): Promise<{ data: any; token: string }> {
  let currentToken = token;
  const result = await callBitrix(endpoint, currentToken, method, params);
  
  if (result.error === "expired_token") {
    console.log(`[BOT] Token expired on ${method}, refreshing...`);
    currentToken = await refreshToken(supabase, integration);
    const retryResult = await callBitrix(endpoint, currentToken, method, params);
    return { data: retryResult, token: currentToken };
  }
  
  return { data: result, token: currentToken };
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

    // Always force a fresh token refresh before starting
    let accessToken = await refreshToken(supabase, integration);
    const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;
    const endpoint = integration.client_endpoint;

    console.log("[BOT] Starting multi-bot registration for domain:", integration.domain);

    // ── Step 1: List & unregister all existing emmely bots ──
    let res = await callBitrixWithRetry(endpoint, accessToken, "imbot.bot.list", {}, supabase, integration);
    accessToken = res.token;
    const botsRaw = res.data.result || {};
    const botsArray: any[] = Array.isArray(botsRaw) ? botsRaw : Object.values(botsRaw);

    console.log("[BOT] Found bots:", botsArray.length);
    for (const bot of botsArray) {
      if (bot.CODE?.startsWith("emmely") || (bot.NAME && bot.NAME.toLowerCase().includes("emmely"))) {
        console.log(`[BOT] Unregistering bot ID:${bot.ID} CODE:${bot.CODE} NAME:${bot.NAME}`);
        const unregRes = await callBitrixWithRetry(endpoint, accessToken, "imbot.unregister", { BOT_ID: bot.ID }, supabase, integration);
        accessToken = unregRes.token;
      }
    }

    // Clear all existing bitrix_bot_id from agents
    await supabase.from("ai_agents").update({ bitrix_bot_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");

    // ── Step 2: Get all active agents ──
    const { data: activeAgents, error: agentsErr } = await supabase
      .from("ai_agents")
      .select("id, name, description, is_active")
      .eq("is_active", true)
      .order("is_default", { ascending: false });

    if (agentsErr || !activeAgents?.length) {
      return new Response(JSON.stringify({ success: false, error: "No active agents found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[BOT] Registering ${activeAgents.length} agents as bots`);

    const results: any[] = [];

    // ── Step 3: Register each agent as a bot ──
    for (const agent of activeAgents) {
      const code = `emmely_agent_${agent.id.substring(0, 8)}`;
      const registerParams: Record<string, any> = {
        CODE: code,
        TYPE: "B",
        OPENLINE: "Y",
        EVENT_MESSAGE_ADD: eventsUrl,
        EVENT_WELCOME_MESSAGE: eventsUrl,
        EVENT_JOIN_CHAT: eventsUrl,
        EVENT_BOT_DELETE: eventsUrl,
        PROPERTIES: {
          NAME: agent.name,
          WORK_POSITION: agent.description || "Assistente Virtual IA",
          COLOR: "GREEN",
        },
      };

      console.log(`[BOT] Registering agent "${agent.name}" with CODE: ${code}`);
      let regRes = await callBitrixWithRetry(endpoint, accessToken, "imbot.register", registerParams, supabase, integration);
      accessToken = regRes.token;

      let botId: string | null = null;
      if (regRes.data.result) {
        botId = String(regRes.data.result);
      } else if (regRes.data.error) {
        console.log(`[BOT] TYPE:B failed for "${agent.name}" (${regRes.data.error}), trying TYPE:O`);
        const regRes2 = await callBitrixWithRetry(endpoint, accessToken, "imbot.register", { ...registerParams, TYPE: "O" }, supabase, integration);
        accessToken = regRes2.token;
        if (regRes2.data.result) {
          botId = String(regRes2.data.result);
        } else {
          console.error(`[BOT] Failed to register "${agent.name}":`, regRes2.data.error, regRes2.data.error_description);
        }
      }

      if (botId) {
        await supabase.from("ai_agents").update({ bitrix_bot_id: botId }).eq("id", agent.id);
        console.log(`[BOT] ✅ "${agent.name}" → Bot ID: ${botId}`);
      }

      results.push({ agent_id: agent.id, agent_name: agent.name, bot_id: botId, code });
    }

    // ── Step 4: Verify ──
    const verifyRes = await callBitrixWithRetry(endpoint, accessToken, "imbot.bot.list", {}, supabase, integration);
    const verifyRaw = verifyRes.data.result || {};
    const verifyArray: any[] = Array.isArray(verifyRaw) ? verifyRaw : Object.values(verifyRaw);

    console.log(`[BOT] Verification: ${verifyArray.length} bots total after registration`);

    return new Response(JSON.stringify({
      success: true,
      registered: results,
      total_bots: verifyArray.length,
      domain: integration.domain,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[BOT] Fatal error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
