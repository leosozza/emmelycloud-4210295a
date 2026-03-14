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

const B24_ICONS = {
  message: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  robot: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="1" y1="16" x2="3" y2="16"/><line x1="21" y1="16" x2="23" y2="16"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/></svg>`,
  clipboard: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  list: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  lightbulb: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>`,
  smile: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  search: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  phone: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  mail: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  botBadge: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/></svg>`,
  user: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  notepad: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  use: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  at: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>`,
};

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
  quickReplies: any[];
  agents: any[];
}): string {
  const {
    contactName, attendanceMode, channel, messages, conversationId,
    supabaseUrl, memberId, integrationId, phones, emails,
    whatsappEnabled, instagramEnabled, quickReplies, agents,
  } = opts;

  const isBot = attendanceMode === "bot";
  const modeColor = isBot ? "#22c55e" : "#f59e0b";
  const modeIcon = isBot ? B24_ICONS.botBadge : B24_ICONS.user;
  const modeLabel = isBot ? "Bot Ativo" : "Atendimento Humano";
  const channelLabel = channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : channel || "canal";

  const messagesHtml = messages.length === 0
    ? `<p style="color:#959ca4;text-align:center;padding:24px 0;font-size:13px">Sem mensagens registadas</p>`
    : messages.map(m => {
        const isOut = m.direction === "outbound";
        const bubbleColor = isOut ? "#2283d8" : "#ffffff";
        const textColor = isOut ? "#fff" : "#333840";
        const align = isOut ? "flex-end" : "flex-start";
        const border = isOut ? "" : "border: 1px solid #dfe0e3;";
        const sender = isOut ? (m.sender_name || "Emmely AI") : (contactName || "Cliente");
        return `
          <div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:10px">
            <div style="font-size:10px;color:#959ca4;margin-bottom:2px;padding:0 4px">${sender} · ${formatTime(m.created_at)}</div>
            <div style="background:${bubbleColor};color:${textColor};${border}padding:8px 12px;border-radius:12px;max-width:80%;font-size:13px;line-height:1.4;word-break:break-word">
              ${(m.content || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}
            </div>
          </div>`;
      }).join("");

  const returnToBotBtn = conversationId && !isBot ? `
    <button onclick="returnToBot()" style="
      background:#2283d8;color:#fff;border:none;padding:8px 16px;border-radius:8px;
      cursor:pointer;font-size:12px;font-weight:600;width:100%;
      display:flex;align-items:center;justify-content:center;gap:6px;
      transition:background 0.15s" onmouseover="this.style.background='#1b6cb8'" onmouseout="this.style.background='#2283d8'">
      ${B24_ICONS.botBadge} Devolver ao Bot
    </button>` : "";

  // Build quick reply template options
  const templateOptionsHtml = quickReplies.map((qr: any) =>
    `<option value="${(qr.content || "").replace(/"/g, "&quot;")}">${(qr.title || "").replace(/</g, "&lt;")}</option>`
  ).join("");

  // Build "Start Conversation" UI with template selector
  const primaryPhone = phones[0] || "";
  const canStartWhatsApp = whatsappEnabled && primaryPhone.length >= 8;
  const canStartInstagram = instagramEnabled;

  const startConvHtml = !conversationId ? `
    <div style="text-align:center;padding:24px 16px">
      <div style="margin-bottom:12px;color:#c4cdd5">${B24_ICONS.search}</div>
      <h3 style="color:#333840;margin:0 0 6px;font-size:14px">Nenhuma conversa ativa encontrada</h3>
      <p style="color:#959ca4;font-size:12px;margin:0 0 12px">
        Inicie uma conversa com o cliente.
      </p>
      ${phones.length ? `<p style="color:#333840;font-size:12px;margin:0 0 4px;display:flex;align-items:center;justify-content:center;gap:4px">${B24_ICONS.phone} ${phones.map(p => "+" + p).join(", ")}</p>` : ""}
      ${emails.length ? `<p style="color:#333840;font-size:12px;margin:0 0 12px;display:flex;align-items:center;justify-content:center;gap:4px">${B24_ICONS.mail} ${emails.join(", ")}</p>` : ""}
      
      ${templateOptionsHtml ? `
        <div style="margin:12px 0;text-align:left">
          <label style="font-size:11px;color:#959ca4;display:block;margin-bottom:4px">Template de mensagem</label>
          <select id="template-select" style="width:100%;padding:8px 10px;border:1px solid #dfe0e3;border-radius:8px;font-size:13px;color:#333840;background:#fff;outline:none;cursor:pointer">
            <option value="">Mensagem personalizada...</option>
            ${templateOptionsHtml}
          </select>
        </div>
      ` : ""}
      
      <div style="margin:8px 0">
        <textarea id="start-msg-input" placeholder="Escreva a mensagem inicial..." style="width:100%;padding:8px 12px;border:1px solid #dfe0e3;border-radius:8px;font-size:13px;color:#333840;resize:none;height:60px;outline:none;font-family:inherit">Olá! Em que posso ajudar?</textarea>
      </div>

      ${canStartWhatsApp ? `
        <button onclick="startConversation('whatsapp','${primaryPhone}')" style="
          background:#25D366;color:#fff;border:none;padding:10px 16px;border-radius:8px;
          cursor:pointer;font-size:13px;font-weight:600;width:100%;margin-top:4px;
          transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          ${B24_ICONS.message} Iniciar no WhatsApp${primaryPhone ? " (" + primaryPhone.slice(-9) + ")" : ""}
        </button>` : ""}
      ${canStartInstagram ? `
        <button onclick="startConversation('instagram','')" style="
          background:#E1306C;color:#fff;border:none;padding:10px 16px;border-radius:8px;
          cursor:pointer;font-size:13px;font-weight:600;width:100%;margin-top:4px;
          transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          ${B24_ICONS.message} Iniciar no Instagram
        </button>` : ""}
    </div>` : "";

  // Build conversation history summary for AI context
  const convSummary = messages.slice(-10).map(m => {
    const role = m.direction === "inbound" ? "Cliente" : "Bot";
    return `${role}: ${(m.content || "").substring(0, 150)}`;
  }).join("\\n");

  // Agents JSON for JS
  const agentsJson = JSON.stringify(agents.map((a: any) => ({ id: a.id, name: a.name })));

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Emmely AI</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: #f5f7fa; color: #333840; }
    #app { display: flex; flex-direction: column; height: 100vh; }

    /* Header */
    #header { background: #fff; border-bottom: 1px solid #dfe0e3; padding: 10px 16px; }
    #header-top { display: flex; align-items: center; gap: 10px; }
    #avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #2283d8, #7b5ea7); display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 14px; flex-shrink: 0; }
    #contact-info { flex: 1; }
    #contact-name { font-weight: 600; font-size: 14px; color: #333840; }
    #contact-meta { font-size: 11px; color: #959ca4; margin-top: 1px; display: flex; align-items: center; gap: 4px; }
    #mode-badge { display: inline-flex; align-items: center; gap: 4px; background: ${modeColor}15; color: ${modeColor}; border: 1px solid ${modeColor}33; border-radius: 20px; padding: 2px 8px; font-size: 10px; font-weight: 600; }

    /* Conversation area */
    #conv-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
    #messages { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; }

    /* Client send bar */
    #client-send-bar { background: #fff; border-top: 1px solid #dfe0e3; padding: 8px 12px; display: flex; gap: 8px; align-items: flex-end; }
    #client-send-bar textarea { flex: 1; border: 1px solid #dfe0e3; border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; color: #333840; font-family: inherit; resize: none; min-height: 36px; max-height: 80px; }
    #client-send-bar textarea:focus { border-color: #2283d8; }
    #client-send-bar button { background: #2283d8; color: #fff; border: none; border-radius: 8px; padding: 8px 12px; cursor: pointer; transition: background .15s; display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    #client-send-bar button:hover { background: #1b6cb8; }
    #client-send-bar button:disabled { opacity: .5; cursor: not-allowed; }
    #status-msg { font-size: 11px; color: #959ca4; text-align: center; padding: 2px 16px; min-height: 14px; }

    /* AI Panel (bottom collapsible) */
    #ai-panel { background: #fff; border-top: 2px solid #2283d8; display: flex; flex-direction: column; max-height: 45vh; min-height: 40px; transition: max-height .3s; }
    #ai-panel.collapsed { max-height: 40px; overflow: hidden; }
    #ai-header { display: flex; align-items: center; gap: 6px; padding: 8px 16px; cursor: pointer; user-select: none; font-size: 13px; font-weight: 600; color: #2283d8; }
    #ai-header:hover { background: #f0f7ff; }
    #ai-toggle { margin-left: auto; font-size: 16px; transition: transform .2s; }
    #ai-panel.collapsed #ai-toggle { transform: rotate(180deg); }
    .ai-suggestions { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 16px 8px; }
    .ai-suggestions button { background: #f5f7fa; color: #333840; border: 1px solid #dfe0e3; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap; display: flex; align-items: center; gap: 3px; }
    .ai-suggestions button:hover { background: #e8f4fd; color: #2283d8; border-color: #2283d8; }
    #ai-messages { flex: 1; overflow-y: auto; padding: 8px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
    .ai-msg { max-width: 90%; padding: 8px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; word-break: break-word; white-space: pre-wrap; }
    .ai-msg.user { align-self: flex-end; background: #2283d8; color: #fff; }
    .ai-msg.assistant { align-self: flex-start; background: #f5f7fa; color: #333840; border: 1px solid #dfe0e3; }
    .ai-msg .typing-dots::after { content: '...'; animation: dots 1.2s steps(4,end) infinite; }
    @keyframes dots { 0%,20%{content:'.'} 40%{content:'..'} 60%,100%{content:'...'} }
    .use-response-btn { display: inline-flex; align-items: center; gap: 4px; background: #e8f4fd; color: #2283d8; border: 1px solid #c4dff0; border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; margin-top: 6px; transition: all .15s; }
    .use-response-btn:hover { background: #2283d8; color: #fff; }

    /* AI input with @mention */
    #ai-input-area { display: flex; gap: 6px; padding: 8px 12px; background: #fff; border-top: 1px solid #eee; align-items: flex-end; position: relative; }
    #ai-input { flex: 1; border: 1px solid #dfe0e3; border-radius: 8px; padding: 8px 12px; font-size: 12px; outline: none; color: #333840; font-family: inherit; }
    #ai-input:focus { border-color: #2283d8; }
    #ai-send-btn { background: #2283d8; color: #fff; border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
    #ai-send-btn:hover { background: #1b6cb8; }
    #ai-send-btn:disabled { opacity: .5; cursor: not-allowed; }

    /* Agent dropdown */
    #agent-dropdown { position: absolute; bottom: 100%; left: 12px; right: 60px; background: #fff; border: 1px solid #dfe0e3; border-radius: 8px; box-shadow: 0 -4px 16px rgba(0,0,0,.12); display: none; max-height: 180px; overflow-y: auto; z-index: 100; }
    #agent-dropdown.visible { display: block; }
    .agent-option { padding: 8px 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #333840; }
    .agent-option:hover { background: #e8f4fd; color: #2283d8; }
    .agent-option .agent-icon { width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #7b5ea7, #2283d8); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 700; flex-shrink: 0; }

    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #dfe0e3; border-radius: 4px; }
  </style>
</head>
<body>
<div id="app">
  <!-- Header -->
  <div id="header">
    <div id="header-top">
      <div id="avatar">${(contactName || "?").charAt(0).toUpperCase()}</div>
      <div id="contact-info">
        <div id="contact-name">${(contactName || "Cliente").replace(/</g, "&lt;")}</div>
        <div id="contact-meta">${conversationId ? channelLabel : (phones.length ? phones[0] : "sem contacto")}</div>
      </div>
      ${conversationId ? `<span id="mode-badge">${modeIcon} ${modeLabel}</span>` : ""}
    </div>
  </div>

  <!-- Conversation Area -->
  <div id="conv-area">
    <div id="messages">
      ${conversationId ? messagesHtml : startConvHtml}
    </div>
    
    ${conversationId ? `
    <!-- Client Send Bar -->
    <div id="client-send-bar">
      <textarea id="client-input" rows="1" placeholder="Escreva ao cliente..." oninput="autoResize(this)"></textarea>
      <button onclick="sendClientMessage()" id="send-client-btn">${B24_ICONS.send} Enviar</button>
    </div>
    <div style="background:#fff;padding:0 12px 4px;display:flex;gap:6px;align-items:center">
      ${returnToBotBtn}
    </div>
    ` : ""}
    <div id="status-msg"></div>
  </div>

  <!-- AI Panel -->
  <div id="ai-panel">
    <div id="ai-header" onclick="toggleAiPanel()">
      ${B24_ICONS.robot} Emmely AI
      <span style="font-weight:400;font-size:11px;color:#959ca4;margin-left:4px">${messages.length ? messages.length + " msgs contexto" : ""}</span>
      <span id="ai-toggle">▼</span>
    </div>
    <div class="ai-suggestions">
      <button onclick="quickAsk('Faz um resumo desta conversa com o cliente')">${B24_ICONS.clipboard} Resumir</button>
      <button onclick="quickAsk('Sugere uma resposta profissional para enviar ao cliente')">${B24_ICONS.lightbulb} Sugerir</button>
      <button onclick="quickAsk('Analisa o sentimento do cliente nesta conversa')">${B24_ICONS.smile} Sentimento</button>
      <button onclick="quickAsk('Qual é o procedimento recomendado para este caso?')">${B24_ICONS.list} Procedimento</button>
    </div>
    <div id="ai-messages"></div>
    <div id="ai-input-area">
      <div id="agent-dropdown"></div>
      <input type="text" id="ai-input" placeholder="@agente pergunta... ou escreva directamente" oninput="handleAiInput(event)" onkeydown="if(event.key==='Enter')sendAiMessage()">
      <button id="ai-send-btn" onclick="sendAiMessage()">${B24_ICONS.send}</button>
    </div>
  </div>
</div>

<script>
  var SUPABASE_URL = "${supabaseUrl}";
  var SUPABASE_KEY = "${Deno.env.get("SUPABASE_ANON_KEY") || ""}";
  var CONVERSATION_ID = "${conversationId || ""}";
  var MEMBER_ID = "${memberId}";
  var INTEGRATION_ID = "${integrationId}";
  var CONTACT_NAME = "${(contactName || "Cliente").replace(/'/g, "\\'")}";
  var CHANNEL = "${channel || ""}";
  var CONV_SUMMARY = ${JSON.stringify(convSummary)};
  var AGENTS = ${agentsJson};
  var selectedAgentId = null;
  var selectedAgentName = '';

  // Scroll messages to bottom
  var msgBox = document.getElementById('messages');
  if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

  // Template select → populate textarea
  var tplSelect = document.getElementById('template-select');
  if (tplSelect) {
    tplSelect.addEventListener('change', function() {
      var ta = document.getElementById('start-msg-input');
      if (this.value && ta) ta.value = this.value;
    });
  }

  // Auto-resize textarea
  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }

  // ── AI Panel toggle ──
  function toggleAiPanel() {
    document.getElementById('ai-panel').classList.toggle('collapsed');
  }

  // ── Send message to client ──
  function sendClientMessage() {
    var input = document.getElementById('client-input');
    var text = (input.value || '').trim();
    if (!text || !CONVERSATION_ID) return;

    var btn = document.getElementById('send-client-btn');
    btn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    // Optimistic: add message to chat
    var msgContainer = document.getElementById('messages');
    var div = document.createElement('div');
    div.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;margin-bottom:10px';
    div.innerHTML = '<div style="font-size:10px;color:#959ca4;margin-bottom:2px;padding:0 4px">Eu · agora</div>' +
      '<div style="background:#2283d8;color:#fff;padding:8px 12px;border-radius:12px;max-width:80%;font-size:13px;line-height:1.4;word-break:break-word">' +
      text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>') + '</div>';
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    fetch(SUPABASE_URL + '/functions/v1/message-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ conversation_id: CONVERSATION_ID, content: text, direction: 'outbound', sender_name: 'Operador Bitrix24' })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) setStatus('❌ ' + d.error, '#ef4444');
      else setStatus('✅ Enviada', '#22c55e');
    })
    .catch(function(e) { setStatus('❌ ' + e.message, '#ef4444'); })
    .finally(function() { btn.disabled = false; input.focus(); });
  }

  // ── AI Chat with @agent support ──
  var aiHistory = [];
  var aiSending = false;

  function handleAiInput(e) {
    var val = e.target.value;
    var atIdx = val.lastIndexOf('@');
    var dropdown = document.getElementById('agent-dropdown');
    
    if (atIdx >= 0) {
      var query = val.substring(atIdx + 1).toLowerCase();
      var filtered = AGENTS.filter(function(a) { return a.name.toLowerCase().indexOf(query) >= 0; });
      
      if (filtered.length > 0 && !selectedAgentId) {
        dropdown.innerHTML = filtered.map(function(a) {
          return '<div class="agent-option" onclick="selectAgent(\\'' + a.id + '\\',\\'' + a.name.replace(/'/g,"\\\\'") + '\\')">' +
            '<span class="agent-icon">' + a.name.charAt(0).toUpperCase() + '</span>' + a.name + '</div>';
        }).join('');
        dropdown.classList.add('visible');
      } else {
        dropdown.classList.remove('visible');
      }
    } else {
      dropdown.classList.remove('visible');
    }
  }

  function selectAgent(id, name) {
    selectedAgentId = id;
    selectedAgentName = name;
    var input = document.getElementById('ai-input');
    var val = input.value;
    var atIdx = val.lastIndexOf('@');
    input.value = val.substring(0, atIdx) + '@' + name + ' ';
    document.getElementById('agent-dropdown').classList.remove('visible');
    input.focus();
  }

  function appendAiMsg(role, text, showUseBtn) {
    var container = document.getElementById('ai-messages');
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;' + (role === 'user' ? 'align-items:flex-end' : 'align-items:flex-start');
    
    var div = document.createElement('div');
    div.className = 'ai-msg ' + role;
    div.textContent = text;
    wrapper.appendChild(div);

    if (showUseBtn && role === 'assistant' && text) {
      var btn = document.createElement('button');
      btn.className = 'use-response-btn';
      btn.innerHTML = '${B24_ICONS.use} Usar resposta';
      btn.onclick = function() { useResponse(text); };
      wrapper.appendChild(btn);
    }

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function useResponse(text) {
    var clientInput = document.getElementById('client-input');
    if (clientInput) {
      clientInput.value = text;
      autoResize(clientInput);
      clientInput.focus();
      // Scroll to make sure client input is visible
      clientInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setStatus('Resposta copiada para o campo de envio', '#2283d8');
    } else {
      setStatus('Sem campo de envio disponível (inicie uma conversa primeiro)', '#f59e0b');
    }
  }

  function quickAsk(text) {
    document.getElementById('ai-input').value = text;
    // Expand AI panel if collapsed
    var panel = document.getElementById('ai-panel');
    if (panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
    sendAiMessage();
  }

  function sendAiMessage() {
    if (aiSending) return;
    var input = document.getElementById('ai-input');
    var rawText = (input.value || '').trim();
    if (!rawText) return;

    // Extract question text (remove @AgentName prefix)
    var questionText = rawText;
    if (selectedAgentId && rawText.indexOf('@' + selectedAgentName) === 0) {
      questionText = rawText.substring(('@' + selectedAgentName).length).trim();
    }
    if (!questionText) { setStatus('Escreva uma pergunta após @' + selectedAgentName, '#f59e0b'); return; }

    input.value = '';
    aiSending = true;
    document.getElementById('ai-send-btn').disabled = true;

    var displayText = selectedAgentName ? '@' + selectedAgentName + ' ' + questionText : questionText;
    appendAiMsg('user', displayText, false);

    // Build context prefix
    var contextPrefix = '';
    if (aiHistory.length === 0) {
      contextPrefix = '[CONTEXTO INTERNO - NÃO ENVIAR AO CLIENTE]\\n';
      contextPrefix += 'Cliente: ' + CONTACT_NAME + '\\n';
      if (CHANNEL) contextPrefix += 'Canal: ' + CHANNEL + '\\n';
      if (CONV_SUMMARY) contextPrefix += 'Histórico recente:\\n' + CONV_SUMMARY + '\\n';
      contextPrefix += '---\\nPergunta do operador: ';
    }

    var fullText = contextPrefix + questionText;
    aiHistory.push({ role: 'user', content: fullText });

    var typingDiv = appendAiMsg('assistant', '', false);
    typingDiv.innerHTML = '<span class="typing-dots"></span>';

    // Choose endpoint: if agent selected, use ai-playground; else ai-process-message
    var useAgentEndpoint = !!selectedAgentId;
    var url, payload;

    if (useAgentEndpoint) {
      url = SUPABASE_URL + '/functions/v1/ai-playground';
      payload = {
        agent_id: selectedAgentId,
        messages: aiHistory
      };
    } else {
      url = SUPABASE_URL + '/functions/v1/ai-process-message';
      payload = {
        message_text: fullText,
        skip_send: true
      };
      if (CONVERSATION_ID) payload.conversation_id = CONVERSATION_ID;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      typingDiv.parentElement.remove();
      var reply = d.content || d.reply || d.error || 'Sem resposta da IA';
      appendAiMsg('assistant', reply, true);
      aiHistory.push({ role: 'assistant', content: reply });
    })
    .catch(function(e) {
      typingDiv.parentElement.remove();
      appendAiMsg('assistant', 'Erro: ' + e.message, false);
    })
    .finally(function() {
      aiSending = false;
      document.getElementById('ai-send-btn').disabled = false;
      input.focus();
      // Reset agent selection after send
      selectedAgentId = null;
      selectedAgentName = '';
    });
  }

  function setStatus(msg, color) {
    var el = document.getElementById('status-msg');
    if (el) { el.textContent = msg; el.style.color = color || '#888'; }
    if (msg) setTimeout(function() { if (el && el.textContent === msg) el.textContent = ''; }, 4000);
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
      setStatus('Emmely AI retomou o atendimento!', '#22c55e');
      var badge = document.getElementById('mode-badge');
      if (badge) { badge.textContent = 'Bot Ativo'; badge.style.color = '#22c55e'; badge.style.borderColor = '#22c55e33'; badge.style.background = '#22c55e15'; }
    })
    .catch(function(e) { setStatus('❌ Erro: ' + e.message, '#ef4444'); });
  }

  function startConversation(channel, phone) {
    var msgInput = document.getElementById('start-msg-input');
    var message = msgInput ? msgInput.value.trim() : 'Olá! Em que posso ajudar?';
    if (!message) { setStatus('Escreva uma mensagem', '#f59e0b'); return; }

    setStatus('A iniciar conversa...', '#888');
    fetch(SUPABASE_URL + '/functions/v1/message-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ channel: channel, contact_phone: phone || undefined, message: message })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) throw new Error(d.error);
      setStatus('✅ Conversa iniciada! Recarregue a aba.', '#22c55e');
    })
    .catch(function(e) { setStatus('❌ ' + e.message, '#ef4444'); });
  }

  // Close dropdown on click outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#ai-input-area')) {
      document.getElementById('agent-dropdown').classList.remove('visible');
    }
  });

  try {
    BX24.init(function() { BX24.fitWindow(); });
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

    const memberId = body.member_id || body.MEMBER_ID || "";

    let placementOptions: Record<string, any> = {};
    if (body.PLACEMENT_OPTIONS) {
      try {
        placementOptions = typeof body.PLACEMENT_OPTIONS === "string"
          ? JSON.parse(body.PLACEMENT_OPTIONS)
          : body.PLACEMENT_OPTIONS;
      } catch { placementOptions = {}; }
    }

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

    // Fetch agents and quick_replies in parallel
    const [agentsRes, qrRes, channelSettingsRes] = await Promise.all([
      supabase.from("ai_agents").select("id, name").eq("is_active", true),
      supabase.from("quick_replies").select("id, title, content, category").order("created_at"),
      supabase.from("chatbot_channel_settings").select("channel, enabled").eq("enabled", true),
    ]);

    const agents = agentsRes.data || [];
    const quickReplies = qrRes.data || [];
    const whatsappEnabled = (channelSettingsRes.data || []).some((s: any) => s.channel === "whatsapp");
    const instagramEnabled = (channelSettingsRes.data || []).some((s: any) => s.channel === "instagram");

    if (!integration) {
      return new Response(renderHtml({
        entityId, entityType: entityTypeId, contactName: "Desconhecido",
        attendanceMode: "bot", channel: "", messages: [], conversationId: null,
        supabaseUrl, memberId, integrationId: "",
        phones: [], emails: [], whatsappEnabled: false, instagramEnabled: false,
        quickReplies, agents,
      }), { headers: htmlHeaders });
    }

    const bodyAuthToken = body.AUTH_ID || body.auth_id || "";
    const bodyServerEndpoint = body.SERVER_ENDPOINT
      ? decodeURIComponent(body.SERVER_ENDPOINT)
      : (body.server_endpoint ? decodeURIComponent(body.server_endpoint) : "");

    let accessToken = bodyAuthToken;
    let endpoint = bodyServerEndpoint || integration.client_endpoint;

    if (!accessToken) {
      accessToken = await ensureValidToken(supabase, integration);
    }

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

        if (entityTypeNum === 3) {
          contactName = [entity?.NAME, entity?.LAST_NAME].filter(Boolean).join(" ");
        } else {
          contactName = entity?.NAME || entity?.TITLE || "";
        }

        allPhones = extractPhones(entity);
        allEmails = extractEmails(entity);

        // For Deal: also fetch linked Contact
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
            }
          } catch (e) {
            console.warn("[CRM-TAB] Failed to fetch linked contact:", e);
          }
        }

        // Exhaustive sequential lookup
        if (!conversation && allPhones.length > 0) {
          conversation = await findConversationByPhone(supabase, allPhones);
        }
        if (!conversation && allEmails.length > 0) {
          conversation = await findConversationByEmail(supabase, allEmails);
        }
        if (!conversation) {
          conversation = await findConversationByBotState(supabase, entityId);
        }
        if (!conversation && contactName) {
          conversation = await findConversationByName(supabase, contactName);
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
      quickReplies,
      agents,
    }), { headers: htmlHeaders });

  } catch (e) {
    console.error("[CRM-TAB] Error:", e);
    return new Response(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#ef4444">
      <h3>Erro ao carregar</h3><p>${String(e)}</p>
    </body></html>`, { headers: htmlHeaders });
  }
});
