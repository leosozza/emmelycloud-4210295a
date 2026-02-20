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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function renderHtml(opts: {
  entityId: string;
  entityType: string;
  contactName: string;
  attendanceMode: string;
  channel: string;
  messages: any[];
  conversationId: string | null;
  supabaseUrl: string;
  memberId: string;
  integrationId: string;
}): string {
  const { contactName, attendanceMode, channel, messages, conversationId, supabaseUrl, memberId, integrationId } = opts;
  const isBot = attendanceMode === "bot";
  const modeColor = isBot ? "#22c55e" : "#f59e0b";
  const modeLabel = isBot ? "🤖 Bot Ativo" : "👤 Atendimento Humano";
  const channelIcon = channel === "whatsapp" ? "💬" : channel === "instagram" ? "📷" : "💌";

  const messagesHtml = messages.length === 0
    ? `<p style="color:#999;text-align:center;padding:24px 0;font-size:13px">Sem mensagens registadas</p>`
    : messages.map(m => {
        const isOut = m.direction === "outbound";
        const bubbleColor = isOut ? "#722F37" : "#f0f0f0";
        const textColor = isOut ? "#fff" : "#222";
        const align = isOut ? "flex-end" : "flex-start";
        const sender = isOut ? (m.sender_name || "Emmely AI") : (contactName || "Cliente");
        return `
          <div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:10px">
            <div style="font-size:10px;color:#999;margin-bottom:2px;padding:0 4px">${sender} · ${formatTime(m.created_at)}</div>
            <div style="background:${bubbleColor};color:${textColor};padding:8px 12px;border-radius:12px;max-width:80%;font-size:13px;line-height:1.4;word-break:break-word">
              ${(m.content || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}
            </div>
          </div>`;
      }).join("");

  const returnToBotBtn = conversationId && !isBot ? `
    <button onclick="returnToBot()" style="
      background:#722F37;color:#fff;border:none;padding:10px 20px;border-radius:8px;
      cursor:pointer;font-size:13px;font-weight:600;width:100%;margin-top:8px;
      transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
      🤖 Devolver ao Bot
    </button>` : "";

  const noConvHtml = `
    <div style="text-align:center;padding:40px 24px">
      <div style="font-size:48px;margin-bottom:16px">🔍</div>
      <h3 style="color:#555;margin:0 0 8px">Nenhuma conversa encontrada</h3>
      <p style="color:#999;font-size:13px;margin:0">
        Não existe conversa ativa ligada a este Lead.<br>
        A conversa é criada automaticamente quando o cliente contacta via WhatsApp ou Instagram.
      </p>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Emmely AI</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; color: #222; }
    #app { display: flex; flex-direction: column; height: 100vh; }
    #header { background: #fff; border-bottom: 1px solid #e8e8e8; padding: 12px 16px; }
    #header-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    #avatar { width: 36px; height: 36px; border-radius: 50%; background: #722F37; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 15px; flex-shrink: 0; }
    #contact-info { flex: 1; }
    #contact-name { font-weight: 600; font-size: 15px; color: #111; }
    #contact-meta { font-size: 12px; color: #888; margin-top: 2px; }
    #mode-badge { display: inline-block; background: ${modeColor}22; color: ${modeColor}; border: 1px solid ${modeColor}44; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 600; }
    #messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; }
    #footer { background: #fff; border-top: 1px solid #e8e8e8; padding: 12px 16px; }
    #status-msg { font-size: 12px; color: #888; text-align: center; margin-top: 6px; min-height: 16px; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
  </style>
</head>
<body>
<div id="app">
  <div id="header">
    <div id="header-top">
      <div id="avatar">${(contactName || "?").charAt(0).toUpperCase()}</div>
      <div id="contact-info">
        <div id="contact-name">${(contactName || "Cliente").replace(/</g, "&lt;")}</div>
        <div id="contact-meta">${channelIcon} ${channel || "canal"}</div>
      </div>
      <span id="mode-badge">${modeLabel}</span>
    </div>
  </div>

  <div id="messages">
    ${conversationId ? messagesHtml : noConvHtml}
  </div>

  ${conversationId ? `
  <div id="footer">
    ${returnToBotBtn}
    <div id="status-msg"></div>
  </div>` : ""}
</div>

<script>
  var SUPABASE_URL = "${supabaseUrl}";
  var SUPABASE_KEY = "${Deno.env.get("SUPABASE_ANON_KEY") || ""}";
  var CONVERSATION_ID = "${conversationId || ""}";
  var MEMBER_ID = "${memberId}";
  var INTEGRATION_ID = "${integrationId}";

  // Auto-scroll to bottom of messages
  var msgBox = document.getElementById('messages');
  if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

  function setStatus(msg, color) {
    var el = document.getElementById('status-msg');
    if (el) { el.textContent = msg; el.style.color = color || '#888'; }
  }

  function returnToBot() {
    if (!CONVERSATION_ID) return;
    setStatus('A devolver ao bot...', '#888');
    fetch(SUPABASE_URL + '/functions/v1/bitrix24-return-to-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: CONVERSATION_ID, member_id: MEMBER_ID })
    })
    .then(function(r) { return r.text(); })
    .then(function() {
      setStatus('✅ Emmely AI retomou o atendimento!', '#22c55e');
      // Update badge
      var badge = document.getElementById('mode-badge');
      if (badge) { badge.textContent = '🤖 Bot Ativo'; badge.style.color = '#22c55e'; badge.style.borderColor = '#22c55e44'; badge.style.background = '#22c55e22'; }
      // Hide button
      var btn = document.querySelector('button');
      if (btn) btn.style.display = 'none';
    })
    .catch(function(e) { setStatus('❌ Erro: ' + e.message, '#ef4444'); });
  }

  // Fit iframe height via BX24
  try {
    BX24.init(function() {
      BX24.fitWindow();
    });
  } catch(e) {}
</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    // Parse body (form-urlencoded or JSON)
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    let body: Record<string, any> = {};

    if (contentType.includes("application/json")) {
      try { body = JSON.parse(bodyText); } catch {}
    } else {
      const params = new URLSearchParams(bodyText);
      for (const [k, v] of params.entries()) body[k] = v;
    }

    console.log("[CRM-TAB] Body keys:", Object.keys(body));
    console.log("[CRM-TAB] Raw (500):", bodyText.substring(0, 500));

    const memberId = body.member_id || body.MEMBER_ID || "";

    // Parse PLACEMENT_OPTIONS
    let placementOptions: Record<string, any> = {};
    if (body.PLACEMENT_OPTIONS) {
      try {
        placementOptions = typeof body.PLACEMENT_OPTIONS === "string"
          ? JSON.parse(body.PLACEMENT_OPTIONS)
          : body.PLACEMENT_OPTIONS;
      } catch { placementOptions = {}; }
    }

    const entityId = placementOptions.ENTITY_ID || placementOptions.entity_id || body.ENTITY_ID || "";
    const entityTypeId = placementOptions.ENTITY_TYPE_ID || placementOptions.entity_type_id || body.ENTITY_TYPE_ID || "1";

    console.log("[CRM-TAB] entityId:", entityId, "entityTypeId:", entityTypeId, "memberId:", memberId);

    // Find integration
    let integration: any = null;
    if (memberId) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").eq("member_id", memberId).single();
      integration = data;
    }
    if (!integration) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").order("created_at", { ascending: false }).limit(1).single();
      integration = data;
    }

    if (!integration) {
      return new Response(renderHtml({
        entityId, entityType: entityTypeId, contactName: "Desconhecido",
        attendanceMode: "bot", channel: "", messages: [], conversationId: null,
        supabaseUrl, memberId, integrationId: "",
      }), { headers: htmlHeaders });
    }

    const accessToken = await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint;

    // --- Lookup conversation ---
    let conversation: any = null;
    let contactName = "";

    if (entityId) {
      // Determine API method based on entity type
      // 1=Lead, 2=Deal, 3=Contact, 4=Company
      const entityTypeNum = parseInt(entityTypeId);
      let crmMethod = "crm.lead.get";
      if (entityTypeNum === 2) crmMethod = "crm.deal.get";
      else if (entityTypeNum === 3) crmMethod = "crm.contact.get";
      else if (entityTypeNum === 4) crmMethod = "crm.company.get";

      try {
        const crmData = await callBitrix(endpoint, accessToken, crmMethod, { ID: entityId });
        const entity = crmData.result;

        console.log("[CRM-TAB] CRM entity:", JSON.stringify(entity || {}).substring(0, 400));

        // Extract name and phone
        if (entityTypeNum === 3) {
          contactName = [entity?.NAME, entity?.LAST_NAME].filter(Boolean).join(" ");
        } else {
          contactName = entity?.NAME || entity?.TITLE || "";
        }

        const phones: string[] = [];
        const phoneFields = entity?.PHONE || entity?.phone || [];
        if (Array.isArray(phoneFields)) {
          for (const p of phoneFields) {
            if (p.VALUE) phones.push(p.VALUE.replace(/\D/g, ""));
          }
        }

        // Strategy 1: lookup by phone
        for (const cleanPhone of phones) {
          if (cleanPhone.length < 8) continue;
          const { data: conv } = await supabase
            .from("conversations")
            .select("id, contact_name, attendance_mode, channel, status")
            .ilike("contact_phone", `%${cleanPhone}%`)
            .neq("status", "fechada")
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (conv) {
            conversation = conv;
            if (!contactName) contactName = conv.contact_name;
            console.log("[CRM-TAB] Found conv via phone:", conv.id);
            break;
          }
        }

        // Strategy 2: lookup by bot_state.bitrix_lead_id
        if (!conversation) {
          const { data: convs } = await supabase
            .from("conversations")
            .select("id, contact_name, attendance_mode, channel, status, bot_state")
            .neq("status", "fechada")
            .order("last_message_at", { ascending: false })
            .limit(200);

          if (convs) {
            for (const c of convs) {
              const bs = (c.bot_state as any) || {};
              if (
                bs.bitrix_lead_id === entityId ||
                bs.bitrix_lead_id === String(entityId) ||
                bs.bitrix_entity_id === entityId ||
                bs.bitrix_entity_id === String(entityId)
              ) {
                conversation = c;
                if (!contactName) contactName = c.contact_name;
                console.log("[CRM-TAB] Found conv via bot_state:", c.id);
                break;
              }
            }
          }
        }
      } catch (crmErr) {
        console.error("[CRM-TAB] CRM lookup error:", crmErr);
      }
    }

    // Fetch messages if conversation found
    let messages: any[] = [];
    if (conversation) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, direction, created_at, sender_name")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(30);
      messages = msgs || [];
      if (!contactName) contactName = conversation.contact_name;
    }

    return new Response(renderHtml({
      entityId,
      entityType: entityTypeId,
      contactName: contactName || "Cliente",
      attendanceMode: conversation?.attendance_mode || "bot",
      channel: conversation?.channel || "",
      messages,
      conversationId: conversation?.id || null,
      supabaseUrl,
      memberId: memberId || integration.member_id,
      integrationId: integration.id,
    }), { headers: htmlHeaders });

  } catch (e) {
    console.error("[CRM-TAB] Error:", e);
    return new Response(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#ef4444">
      <h3>Erro ao carregar</h3><p>${String(e)}</p>
    </body></html>`, { headers: htmlHeaders });
  }
});
