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

function extractPhones(entity: any): string[] {
  const phones: string[] = [];
  const phoneFields = entity?.PHONE || entity?.phone || [];
  if (Array.isArray(phoneFields)) {
    for (const p of phoneFields) {
      if (p.VALUE) {
        const clean = p.VALUE.replace(/\D/g, "");
        if (clean.length >= 8) phones.push(clean);
      }
    }
  }
  return phones;
}

function extractEmails(entity: any): string[] {
  const emails: string[] = [];
  const emailFields = entity?.EMAIL || entity?.email || [];
  if (Array.isArray(emailFields)) {
    for (const e of emailFields) {
      if (e.VALUE && e.VALUE.includes("@")) emails.push(e.VALUE.toLowerCase().trim());
    }
  }
  return emails;
}

async function findConversationByPhone(supabase: any, phones: string[]): Promise<any> {
  for (const phone of phones) {
    if (phone.length < 8) continue;
    // Try with different prefix lengths for flexibility
    const suffixes = [phone, phone.slice(-9), phone.slice(-8)].filter((s, i, arr) => arr.indexOf(s) === i);
    for (const suffix of suffixes) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, contact_name, attendance_mode, channel, status, contact_phone")
        .ilike("contact_phone", `%${suffix}%`)
        .neq("status", "fechada")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conv) return conv;
    }
  }
  return null;
}

async function findConversationByEmail(supabase: any, emails: string[]): Promise<any> {
  for (const email of emails) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone")
      .ilike("contact_email", `%${email}%`)
      .neq("status", "fechada")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conv) return conv;
  }
  return null;
}

async function findConversationByBotState(supabase: any, entityId: string): Promise<any> {
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, contact_name, attendance_mode, channel, status, contact_phone, bot_state")
    .neq("status", "fechada")
    .order("last_message_at", { ascending: false })
    .limit(300);

  if (!convs) return null;
  for (const c of convs) {
    const bs = (c.bot_state as any) || {};
    if (
      bs.bitrix_lead_id === entityId ||
      bs.bitrix_lead_id === String(entityId) ||
      bs.bitrix_entity_id === entityId ||
      bs.bitrix_entity_id === String(entityId)
    ) {
      return c;
    }
  }
  return null;
}

async function findConversationByName(supabase: any, name: string): Promise<any> {
  if (!name || name.length < 5) return null;
  // Use first significant word (skip common words)
  const words = name.split(/[\s:,]+/).filter(w => w.length > 4);
  for (const word of words.slice(0, 3)) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone")
      .ilike("contact_name", `%${word}%`)
      .neq("status", "fechada")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conv) return conv;
  }
  return null;
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
  phones: string[];
  emails: string[];
  whatsappEnabled: boolean;
  instagramEnabled: boolean;
}): string {
  const {
    contactName, attendanceMode, channel, messages, conversationId,
    supabaseUrl, memberId, integrationId, phones, emails,
    whatsappEnabled, instagramEnabled,
  } = opts;

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

  // Build "Start Conversation" UI when no conversation found
  const primaryPhone = phones[0] || "";
  const canStartWhatsApp = whatsappEnabled && primaryPhone.length >= 8;
  const canStartInstagram = instagramEnabled;

  const startBtns = !conversationId ? (() => {
    let btns = "";
    if (canStartWhatsApp) {
      btns += `
        <button onclick="startConversation('whatsapp','${primaryPhone}')" style="
          background:#25D366;color:#fff;border:none;padding:10px 16px;border-radius:8px;
          cursor:pointer;font-size:13px;font-weight:600;width:100%;margin-top:8px;
          transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          💬 Iniciar Conversa no WhatsApp${primaryPhone ? " (" + primaryPhone.slice(-9) + ")" : ""}
        </button>`;
    }
    if (canStartInstagram) {
      btns += `
        <button onclick="startConversation('instagram','')" style="
          background:#E1306C;color:#fff;border:none;padding:10px 16px;border-radius:8px;
          cursor:pointer;font-size:13px;font-weight:600;width:100%;margin-top:8px;
          transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          📷 Iniciar Conversa no Instagram
        </button>`;
    }
    return btns;
  })() : "";

  const noConvHtml = `
    <div style="text-align:center;padding:32px 16px">
      <div style="font-size:40px;margin-bottom:12px">🔍</div>
      <h3 style="color:#555;margin:0 0 6px;font-size:14px">Nenhuma conversa ativa encontrada</h3>
      <p style="color:#999;font-size:12px;margin:0 0 12px">
        Pesquisa por telefone, email e nome não encontrou resultados.
      </p>
      ${phones.length ? `<p style="color:#666;font-size:12px;margin:0 0 4px">📞 ${phones.map(p => "+" + p).join(", ")}</p>` : ""}
      ${emails.length ? `<p style="color:#666;font-size:12px;margin:0">✉️ ${emails.join(", ")}</p>` : ""}
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
        <div id="contact-meta">${conversationId ? (channelIcon + " " + (channel || "canal")) : (phones.length ? "📞 " + phones[0] : "sem contacto")}</div>
      </div>
      ${conversationId ? `<span id="mode-badge">${modeLabel}</span>` : ""}
    </div>
  </div>

  <div id="messages">
    ${conversationId ? messagesHtml : noConvHtml}
  </div>

  <div id="footer">
    ${conversationId ? returnToBotBtn : startBtns}
    <div id="status-msg"></div>
  </div>
</div>

<script>
  var SUPABASE_URL = "${supabaseUrl}";
  var SUPABASE_KEY = "${Deno.env.get("SUPABASE_ANON_KEY") || ""}";
  var CONVERSATION_ID = "${conversationId || ""}";
  var MEMBER_ID = "${memberId}";
  var INTEGRATION_ID = "${integrationId}";

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
      var badge = document.getElementById('mode-badge');
      if (badge) { badge.textContent = '🤖 Bot Ativo'; badge.style.color = '#22c55e'; badge.style.borderColor = '#22c55e44'; badge.style.background = '#22c55e22'; }
      var btn = document.querySelector('#footer button');
      if (btn) btn.style.display = 'none';
    })
    .catch(function(e) { setStatus('❌ Erro: ' + e.message, '#ef4444'); });
  }

  function startConversation(channel, phone) {
    setStatus('A iniciar conversa...', '#888');
    var payload = {
      channel: channel,
      contact_phone: phone || undefined,
      message: 'Olá! Em que posso ajudar?'
    };
    fetch(SUPABASE_URL + '/functions/v1/message-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) throw new Error(d.error);
      setStatus('✅ Conversa iniciada com sucesso! Recarregue a aba.', '#22c55e');
      var btns = document.querySelectorAll('#footer button');
      btns.forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });
    })
    .catch(function(e) { setStatus('❌ Erro: ' + e.message, '#ef4444'); });
  }

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
    console.log("[CRM-TAB] Raw (600):", bodyText.substring(0, 600));

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

    // FIX 1: Bitrix24 sends "ID" not "ENTITY_ID" in PLACEMENT_OPTIONS
    const entityId =
      placementOptions.ID ||
      placementOptions.ENTITY_ID ||
      placementOptions.entity_id ||
      body.ENTITY_ID || "";

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
        phones: [], emails: [], whatsappEnabled: false, instagramEnabled: false,
      }), { headers: htmlHeaders });
    }

    // FIX 2: Use AUTH_ID from body as direct token (valid 1h, faster)
    const bodyAuthToken = body.AUTH_ID || body.auth_id || "";
    const bodyServerEndpoint = body.SERVER_ENDPOINT
      ? decodeURIComponent(body.SERVER_ENDPOINT)
      : (body.server_endpoint ? decodeURIComponent(body.server_endpoint) : "");

    let accessToken = bodyAuthToken;
    let endpoint = bodyServerEndpoint || integration.client_endpoint;

    if (!accessToken) {
      accessToken = await ensureValidToken(supabase, integration);
    }

    console.log("[CRM-TAB] Using token source:", bodyAuthToken ? "AUTH_ID from body" : "integration DB");
    console.log("[CRM-TAB] Endpoint:", endpoint);

    // Get active channel settings in parallel
    const { data: channelSettings } = await supabase
      .from("chatbot_channel_settings")
      .select("channel, enabled")
      .eq("enabled", true);

    const whatsappEnabled = (channelSettings || []).some((s: any) => s.channel === "whatsapp");
    const instagramEnabled = (channelSettings || []).some((s: any) => s.channel === "instagram");

    // --- Lookup conversation ---
    let conversation: any = null;
    let contactName = "";
    let allPhones: string[] = [];
    let allEmails: string[] = [];

    if (entityId) {
      const entityTypeNum = parseInt(entityTypeId);
      let crmMethod = "crm.lead.get";
      if (entityTypeNum === 2) crmMethod = "crm.deal.get";
      else if (entityTypeNum === 3) crmMethod = "crm.contact.get";
      else if (entityTypeNum === 4) crmMethod = "crm.company.get";

      try {
        const crmData = await callBitrix(endpoint, accessToken, crmMethod, { ID: entityId });
        const entity = crmData.result;

        console.log("[CRM-TAB] CRM entity keys:", Object.keys(entity || {}).join(","));

        // Extract name
        if (entityTypeNum === 3) {
          contactName = [entity?.NAME, entity?.LAST_NAME].filter(Boolean).join(" ");
        } else {
          contactName = entity?.NAME || entity?.TITLE || "";
        }

        // Extract phones & emails from primary entity
        allPhones = extractPhones(entity);
        allEmails = extractEmails(entity);

        console.log("[CRM-TAB] Phones:", allPhones, "Emails:", allEmails, "Name:", contactName);

        // For Deal: also fetch linked Contact's phones/emails
        if (entityTypeNum === 2 && entity?.CONTACT_ID) {
          try {
            const contactData = await callBitrix(endpoint, accessToken, "crm.contact.get", { ID: entity.CONTACT_ID });
            const contact = contactData.result;
            if (contact) {
              const contactPhones = extractPhones(contact);
              const contactEmails = extractEmails(contact);
              const contactFullName = [contact.NAME, contact.LAST_NAME].filter(Boolean).join(" ");
              if (!contactName && contactFullName) contactName = contactFullName;
              allPhones = [...new Set([...allPhones, ...contactPhones])];
              allEmails = [...new Set([...allEmails, ...contactEmails])];
              console.log("[CRM-TAB] Deal linked contact phones:", contactPhones, "emails:", contactEmails);
            }
          } catch (e) {
            console.warn("[CRM-TAB] Failed to fetch linked contact:", e);
          }
        }

        // FIX 3: Exhaustive sequential lookup
        // Strategy 1: by phone
        if (!conversation && allPhones.length > 0) {
          conversation = await findConversationByPhone(supabase, allPhones);
          if (conversation) console.log("[CRM-TAB] Found via phone:", conversation.id);
        }

        // Strategy 2: by email
        if (!conversation && allEmails.length > 0) {
          conversation = await findConversationByEmail(supabase, allEmails);
          if (conversation) console.log("[CRM-TAB] Found via email:", conversation.id);
        }

        // Strategy 3: by bot_state bitrix entity id
        if (!conversation) {
          conversation = await findConversationByBotState(supabase, entityId);
          if (conversation) console.log("[CRM-TAB] Found via bot_state:", conversation.id);
        }

        // Strategy 4: by name (last resort)
        if (!conversation && contactName) {
          conversation = await findConversationByName(supabase, contactName);
          if (conversation) console.log("[CRM-TAB] Found via name:", conversation.id);
        }

        if (conversation && !contactName) contactName = conversation.contact_name;

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
      phones: allPhones,
      emails: allEmails,
      whatsappEnabled,
      instagramEnabled,
    }), { headers: htmlHeaders });

  } catch (e) {
    console.error("[CRM-TAB] Error:", e);
    return new Response(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#ef4444">
      <h3>Erro ao carregar</h3><p>${String(e)}</p>
    </body></html>`, { headers: htmlHeaders });
  }
});
