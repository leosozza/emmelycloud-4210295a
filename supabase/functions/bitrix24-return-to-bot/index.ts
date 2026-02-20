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

function closeSliderHtml(message: string, success: boolean): string {
  const icon = success ? "✅" : "⚠️";
  const color = success ? "#22c55e" : "#f59e0b";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { text-align: center; padding: 32px 40px; background: white; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); max-width: 360px; }
    .icon { font-size: 48px; margin-bottom: 12px; }
    .msg { color: #333; font-size: 15px; font-weight: 500; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <p class="msg" style="color: ${color}">${message}</p>
  </div>
  <script>
    try {
      BX24.init(function() {
        setTimeout(function() { BX24.closeApplication(); }, 1500);
      });
    } catch(e) {
      setTimeout(function() { window.close(); }, 1500);
    }
  </script>
</body>
</html>`;
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

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Parse body — Bitrix24 sends form-urlencoded or JSON
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    let body: Record<string, any> = {};

    if (contentType.includes("application/json")) {
      try { body = JSON.parse(bodyText); } catch {}
    } else {
      // form-urlencoded
      const params = new URLSearchParams(bodyText);
      for (const [k, v] of params.entries()) body[k] = v;
    }

    console.log("[RETURN-TO-BOT] Received body keys:", Object.keys(body));
    console.log("[RETURN-TO-BOT] Raw body (first 500):", bodyText.substring(0, 500));

    // Extract member_id and PLACEMENT_OPTIONS
    const memberId = body.member_id || body.MEMBER_ID;
    let placementOptions: Record<string, any> = {};

    if (body.PLACEMENT_OPTIONS) {
      try {
        placementOptions = typeof body.PLACEMENT_OPTIONS === "string"
          ? JSON.parse(body.PLACEMENT_OPTIONS)
          : body.PLACEMENT_OPTIONS;
      } catch {
        placementOptions = {};
      }
    }

    // CHAT_ID may come as PLACEMENT_OPTIONS.CHAT_ID or PLACEMENT_OPTIONS.ID or PLACEMENT_OPTIONS.dialogId
    const dialogId = placementOptions.dialogId || placementOptions.DIALOG_ID || "";
    const chatId = parseInt(
      placementOptions.CHAT_ID ||
      placementOptions.ID ||
      (dialogId ? dialogId.replace(/[^0-9]/g, "") : "") ||
      body.CHAT_ID || "0"
    );

    console.log("[RETURN-TO-BOT] member_id:", memberId, "chatId:", chatId, "dialogId:", dialogId, "placementOptions:", JSON.stringify(placementOptions));

    // Find integration by member_id or fall back to latest
    let integration: any = null;
    if (memberId) {
      const { data } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .eq("member_id", memberId)
        .single();
      integration = data;
    }
    if (!integration) {
      const { data } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      integration = data;
    }

    if (!integration) {
      console.error("[RETURN-TO-BOT] No integration found");
      return new Response(
        closeSliderHtml("Integração não encontrada.", false),
        { headers: htmlHeaders }
      );
    }

    const accessToken = await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint;

    if (!chatId) {
      console.error("[RETURN-TO-BOT] No CHAT_ID received");
      return new Response(
        closeSliderHtml("ID do chat não recebido. Tente novamente.", false),
        { headers: htmlHeaders }
      );
    }

    // Strategy 1: use imopenlines.session.list to get the user phone/contact from the chat
    let targetConversation: any = null;

    try {
      // Get Open Lines session info for this chat
      const sessionList = await callBitrix(endpoint, accessToken, "imopenlines.session.list", {
        FILTER: { CHAT_ID: chatId },
      });
      console.log("[RETURN-TO-BOT] Session list:", JSON.stringify(sessionList).substring(0, 500));

      const sessions = sessionList.result?.sessions || sessionList.result || [];
      const sessionArr = Array.isArray(sessions) ? sessions : Object.values(sessions);

      for (const session of sessionArr) {
        // session.USER_ID is the external user (client)
        const externalUserId = session.USER_ID || session.user_id;
        if (externalUserId) {
          // Try to get user info to find phone/instagram
          const userInfo = await callBitrix(endpoint, accessToken, "im.user.get", {
            ID: externalUserId,
          });
          console.log("[RETURN-TO-BOT] User info:", JSON.stringify(userInfo).substring(0, 300));

          const phone = userInfo.result?.PHONE_MOBILE || userInfo.result?.PERSONAL_PHONE || "";
          const name = userInfo.result?.NAME || userInfo.result?.FULL_NAME || "";

          if (phone) {
            const cleanPhone = phone.replace(/\D/g, "");
            const { data } = await supabase
              .from("conversations")
              .select("id, attendance_mode, contact_name")
              .ilike("contact_phone", `%${cleanPhone}%`)
              .neq("status", "fechada")
              .order("last_message_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data) {
              targetConversation = data;
              console.log("[RETURN-TO-BOT] Found conversation via phone:", data.id);
              break;
            }
          }
        }
      }
    } catch (sessionErr) {
      console.warn("[RETURN-TO-BOT] imopenlines.session.list failed:", sessionErr);
    }

    // Strategy 2: search bot_state json field for bitrix_chat_id
    if (!targetConversation) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, attendance_mode, contact_name, bot_state, channel")
        .neq("status", "fechada")
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (convs) {
        for (const c of convs) {
          const bs = (c.bot_state as any) || {};
          if (bs.bitrix_chat_id === chatId || bs.bitrix_chat_id === String(chatId)) {
            targetConversation = c;
            console.log("[RETURN-TO-BOT] Found conversation via bot_state.bitrix_chat_id:", c.id);
            break;
          }
        }
      }
    }

    console.log("[RETURN-TO-BOT] Found conversation:", targetConversation?.id, "mode:", targetConversation?.attendance_mode);

    if (targetConversation) {
      // Update conversation: devolver ao bot
      await supabase
        .from("conversations")
        .update({
          attendance_mode: "bot",
          bot_state: {},
        })
        .eq("id", targetConversation.id);

      console.log("[RETURN-TO-BOT] Conversation updated to bot mode:", targetConversation.id);
    }

    // Send message in the Bitrix24 chat to inform the operator and client
    const config = (integration.config as any) || {};
    const botId = config.bot_id;

    if (botId && chatId) {
      try {
        const msgResult = await callBitrix(endpoint, accessToken, "imbot.message.add", {
          BOT_ID: parseInt(botId),
          DIALOG_ID: `chat${chatId}`,
          MESSAGE: "🤖 O assistente virtual *Emmely AI* retomou o atendimento. Como posso ajudar?",
          SYSTEM: "N",
        });
        console.log("[RETURN-TO-BOT] Message sent:", JSON.stringify(msgResult).substring(0, 200));
      } catch (msgErr) {
        console.error("[RETURN-TO-BOT] Failed to send message:", msgErr);
      }
    } else {
      console.warn("[RETURN-TO-BOT] bot_id not found in config, skipping message:", config);
    }

    return new Response(
      closeSliderHtml("Emmely AI retomou o atendimento! ✨", true),
      { headers: htmlHeaders }
    );

  } catch (e) {
    console.error("[RETURN-TO-BOT] Error:", e);
    return new Response(
      closeSliderHtml("Ocorreu um erro. Tente novamente.", false),
      { headers: htmlHeaders }
    );
  }
});
