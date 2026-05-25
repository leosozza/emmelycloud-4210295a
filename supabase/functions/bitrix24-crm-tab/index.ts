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

// Returns ALL whatsapp conversations matching any phone variant, sorted by active+recency.
async function findConversationsByPhone(supabase: any, phones: string[]): Promise<any[]> {
  const cleaned = phones
    .map((p) => String(p || "").replace(/\D/g, ""))
    .filter((p) => p.length >= 8);
  if (cleaned.length === 0) return [];

  // Build a set of suffix variants for fuzzy matching (full, last 11, last 10, last 9, last 8)
  const variants = new Set<string>();
  for (const p of cleaned) {
    variants.add(p);
    if (p.length >= 11) variants.add(p.slice(-11));
    if (p.length >= 10) variants.add(p.slice(-10));
    if (p.length >= 9) variants.add(p.slice(-9));
    if (p.length >= 8) variants.add(p.slice(-8));
  }

  const collected = new Map<string, any>();
  for (const variant of variants) {
    const { data } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, last_message_at, bot_state")
      .eq("channel", "whatsapp")
      .ilike("contact_phone", `%${variant}%`)
      .order("last_message_at", { ascending: false })
      .limit(20);
    for (const c of data || []) {
      if (!collected.has(c.id)) collected.set(c.id, c);
    }
  }

  // Also try contact_lid match (some BR numbers only deliver via @lid)
  for (const p of cleaned) {
    const { data } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, last_message_at, bot_state")
      .eq("channel", "whatsapp")
      .ilike("contact_lid", `%${p}%`)
      .order("last_message_at", { ascending: false })
      .limit(10);
    for (const c of data || []) {
      if (!collected.has(c.id)) collected.set(c.id, c);
    }
  }

  const list = Array.from(collected.values());
  // Sort: active conversations (status != fechada) first, then by last_message_at desc
  list.sort((a, b) => {
    const aActive = a.status !== "fechada" ? 1 : 0;
    const bActive = b.status !== "fechada" ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTs - aTs;
  });
  return list;
}

// Backwards-compatible single-result helper
async function findConversationByPhone(supabase: any, phones: string[]): Promise<any> {
  const list = await findConversationsByPhone(supabase, phones);
  return list[0] || null;
}

async function findConversationByEmail(supabase: any, emails: string[]): Promise<any> {
  for (const email of emails) {
    const { data: active } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
      .ilike("contact_email", `%${email}%`)
      .neq("status", "fechada")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active) return active;
    const { data: anyConv } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
      .ilike("contact_email", `%${email}%`)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anyConv) {
      console.log("[CRM-TAB] Email match found closed conversation:", anyConv.id, "status:", anyConv.status);
      return anyConv;
    }
  }
  return null;
}

async function findConversationByBotState(supabase: any, entityId: string, entityTypeId?: string): Promise<any> {
  const selectCols = "id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state";
  const eid = String(entityId);

  // 1. Try exact bitrix_deal_id match
  {
    const { data: convs } = await supabase
      .from("conversations")
      .select(selectCols)
      .filter("bot_state->>bitrix_deal_id", "eq", eid)
      .order("last_message_at", { ascending: false })
      .limit(5);
    if (convs?.length) {
      const active = convs.find((c: any) => c.status !== "fechada");
      const best = active || convs[0];
      console.log("[CRM-TAB] bot_state bitrix_deal_id match:", best.id, "status:", best.status);
      return best;
    }
  }

  // 2. Try exact bitrix_lead_id match
  {
    const { data: convs } = await supabase
      .from("conversations")
      .select(selectCols)
      .filter("bot_state->>bitrix_lead_id", "eq", eid)
      .order("last_message_at", { ascending: false })
      .limit(5);
    if (convs?.length) {
      const active = convs.find((c: any) => c.status !== "fechada");
      const best = active || convs[0];
      console.log("[CRM-TAB] bot_state bitrix_lead_id match:", best.id, "status:", best.status);
      return best;
    }
  }

  // 3. Try bitrix_entity_id (exact or with prefix like "1:17805", "2:23693")
  const prefixed = entityTypeId ? `${entityTypeId}:${eid}` : null;
  {
    const orClauses = [`bot_state->>bitrix_entity_id.eq.${eid}`];
    if (prefixed) orClauses.push(`bot_state->>bitrix_entity_id.eq.${prefixed}`);
    const { data: convs } = await supabase
      .from("conversations")
      .select(selectCols)
      .or(orClauses.join(","))
      .order("last_message_at", { ascending: false })
      .limit(5);
    if (convs?.length) {
      const active = convs.find((c: any) => c.status !== "fechada");
      const best = active || convs[0];
      console.log("[CRM-TAB] bot_state bitrix_entity_id match:", best.id, "status:", best.status);
      return best;
    }
  }

  // 4. Try entity_id embedded in prefixed values (e.g. "1:17805" contains ":17805")
  {
    const { data: convs } = await supabase
      .from("conversations")
      .select(selectCols)
      .not("bot_state", "is", null)
      .or(`bot_state->>bitrix_entity_id.like.%:${eid}`)
      .order("last_message_at", { ascending: false })
      .limit(5);
    if (convs?.length) {
      const active = convs.find((c: any) => c.status !== "fechada");
      const best = active || convs[0];
      console.log("[CRM-TAB] bot_state entity_id suffix match:", best.id, "status:", best.status);
      return best;
    }
  }

  return null;
}

async function findConversationByName(supabase: any, name: string): Promise<any> {
  if (!name || name.length < 5) return null;
  const words = name.split(/[\s:,]+/).filter(w => w.length > 4);
  for (const word of words.slice(0, 3)) {
    const { data: active } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
      .ilike("contact_name", `%${word}%`)
      .neq("status", "fechada")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active) return active;
    const { data: anyConv } = await supabase
      .from("conversations")
      .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
      .ilike("contact_name", `%${word}%`)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anyConv) {
      console.log("[CRM-TAB] Name match found closed conversation:", anyConv.id, "status:", anyConv.status);
      return anyConv;
    }
  }
  return null;
}

// Lookup conversations via Open Channel session activities attached to a CRM entity.
// Many WhatsApp contacts (esp. WUZAPI BR) have no real phone — only a LID like 36777922437277.
// Bitrix attaches an "imopenlines" activity to the Lead/Deal/Contact whose USER_CODE encodes the chat_id.
async function findConversationByOpenChannelChatId(
  supabase: any,
  endpoint: string,
  accessToken: string,
  entityTypeNum: number,
  entityId: string,
  contactId?: string,
): Promise<any> {
  const lids = new Set<string>();

  const targets: Array<{ ownerType: number; ownerId: string }> = [];
  targets.push({ ownerType: entityTypeNum, ownerId: String(entityId) });
  if (contactId) targets.push({ ownerType: 3, ownerId: String(contactId) });

  for (const t of targets) {
    try {
      const res = await callBitrix(endpoint, accessToken, "crm.activity.list", {
        filter: { OWNER_TYPE_ID: t.ownerType, OWNER_ID: t.ownerId, PROVIDER_ID: "IMOPENLINES_SESSION" },
        select: ["ID", "PROVIDER_PARAMS", "COMMUNICATIONS", "ASSOCIATED_ENTITY_ID", "SUBJECT"],
        order: { ID: "DESC" },
      });
      const acts = res?.result || [];
      for (const a of acts) {
        // USER_CODE format: "imol|emmely_connector|19|36777922437277|..." OR "livechat|..."
        const userCode: string = a?.PROVIDER_PARAMS?.USER_CODE || "";
        const m = userCode.match(/\|(\d{10,})(?:\||$)/);
        if (m) lids.add(m[1]);
        // Also scan COMMUNICATIONS values for raw chat ids
        const comms = Array.isArray(a?.COMMUNICATIONS) ? a.COMMUNICATIONS : [];
        for (const c of comms) {
          const v = String(c?.VALUE || "");
          const cm = v.match(/(\d{10,})(?:@|$)/);
          if (cm) lids.add(cm[1]);
        }
        // Subject may also embed chat id (rare)
        const subj = String(a?.SUBJECT || "");
        const sm = subj.match(/(\d{12,})/);
        if (sm) lids.add(sm[1]);
      }
    } catch (e) {
      console.warn("[CRM-TAB] crm.activity.list openchannel lookup failed:", String((e as any)?.message || e));
    }
  }

  if (lids.size === 0) return null;
  console.log("[CRM-TAB] OpenChannel LIDs found:", Array.from(lids));

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state, last_message_at")
    .eq("channel", "whatsapp")
    .in("contact_lid", Array.from(lids))
    .order("last_message_at", { ascending: false })
    .limit(10);

  if (!convs?.length) return null;
  const active = convs.find((c: any) => c.status !== "fechada");
  return active || convs[0];
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
  paperclip: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  mic: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`,
  stop: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
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
  conversationCandidates?: any[];
}): string {
  const {
    contactName, attendanceMode, channel, messages, conversationId,
    supabaseUrl, memberId, integrationId, phones, emails,
    whatsappEnabled, instagramEnabled, quickReplies, agents,
    conversationCandidates = [],
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
  // Sempre permitimos iniciar pelo WhatsApp se o canal estiver habilitado.
  // Se não houver telefone no CRM, o utilizador insere manualmente.
  const canStartWhatsApp = whatsappEnabled;
  const canStartInstagram = instagramEnabled;
  const needsManualPhone = whatsappEnabled && !primaryPhone;

  const startConvHtml = !conversationId ? `
    <div style="text-align:center;padding:24px 16px">
      <div style="margin-bottom:12px;color:#c4cdd5">${B24_ICONS.search}</div>
      <h3 style="color:#333840;margin:0 0 6px;font-size:14px">Nenhuma conversa ativa encontrada</h3>
      <p style="color:#959ca4;font-size:12px;margin:0 0 12px">
        Inicie uma conversa com o cliente.
      </p>
      ${phones.length ? `<p style="color:#333840;font-size:12px;margin:0 0 4px;display:flex;align-items:center;justify-content:center;gap:4px">${B24_ICONS.phone} ${phones.map(p => "+" + p).join(", ")}</p>` : ""}
      ${emails.length ? `<p style="color:#333840;font-size:12px;margin:0 0 12px;display:flex;align-items:center;justify-content:center;gap:4px">${B24_ICONS.mail} ${emails.join(", ")}</p>` : ""}

      ${needsManualPhone ? `
        <div style="margin:12px 0;text-align:left;padding:10px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px">
          <label style="font-size:11px;color:#92400e;display:block;margin-bottom:4px;font-weight:600">⚠ Nenhum telefone no CRM — insira manualmente</label>
          <input id="manual-phone-input" type="tel" inputmode="numeric" placeholder="Ex: 351912345678 ou 5511987654321" style="width:100%;padding:8px 10px;border:1px solid #fcd34d;border-radius:6px;font-size:13px;color:#333840;background:#fff;outline:none" />
          <p style="font-size:10.5px;color:#92400e;margin:4px 0 0">Inclua o código do país (351 PT, 55 BR), apenas dígitos.</p>
        </div>
      ` : ""}

      ${canStartWhatsApp ? `
        <div style="margin:12px 0;text-align:left">
          <label style="font-size:11px;color:#959ca4;display:block;margin-bottom:4px">Template WhatsApp Oficial (HSM)</label>
          <select id="hsm-template-select" onchange="onHsmTemplateChange()" style="width:100%;padding:8px 10px;border:1px solid #dfe0e3;border-radius:8px;font-size:13px;color:#333840;background:#fff;outline:none;cursor:pointer">
            <option value="">— A carregar templates… —</option>
          </select>
          <p id="hsm-warning" style="font-size:10.5px;color:#b45309;margin:4px 0 0;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 8px">
            Fora da janela de 24h, apenas templates HSM aprovados podem iniciar a conversa.
          </p>
        </div>
        <div id="hsm-params-container" style="display:none;text-align:left;margin:8px 0"></div>
        <div id="hsm-preview" style="display:none;text-align:left;margin:8px 0;padding:8px 10px;background:#f0f7ff;border:1px solid #c4dff0;border-radius:8px;font-size:12px;color:#333840;white-space:pre-wrap"></div>
      ` : ""}

      ${templateOptionsHtml ? `
        <div id="quick-reply-wrap" style="margin:12px 0;text-align:left">
          <label style="font-size:11px;color:#959ca4;display:block;margin-bottom:4px">Resposta rápida (texto livre)</label>
          <select id="template-select" onchange="onQuickReplyChange()" style="width:100%;padding:8px 10px;border:1px solid #dfe0e3;border-radius:8px;font-size:13px;color:#333840;background:#fff;outline:none;cursor:pointer">
            <option value="">Mensagem personalizada...</option>
            ${templateOptionsHtml}
          </select>
        </div>
      ` : ""}

      <div id="free-text-wrap" style="margin:8px 0">
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

  // Conversation switcher (when multiple conversations match the same contact)
  const switcherHtml = conversationCandidates.length > 1 ? `
    <div style="background:#f9fafb;border-bottom:1px solid #f0f1f3;padding:6px 12px;display:flex;align-items:center;gap:6px;flex-shrink:0">
      <span style="font-size:11px;color:#959ca4;white-space:nowrap">${conversationCandidates.length} conversas:</span>
      <select id="conv-switcher" onchange="switchConversation(this.value)" style="flex:1;padding:4px 8px;border:1px solid #dfe0e3;border-radius:6px;font-size:11px;color:#333840;background:#fff;outline:none;cursor:pointer">
        ${conversationCandidates.map((c: any) => {
          const lastTs = c.last_message_at ? formatTime(c.last_message_at) : "—";
          const phone = c.contact_phone || c.contact_lid || "?";
          const statusLabel = c.status === "fechada" ? "fechada" : (c.attendance_mode === "human" ? "humano" : "bot");
          const sel = c.id === conversationId ? " selected" : "";
          return `<option value="${c.id}"${sel}>${(c.contact_name || "?").replace(/</g, "&lt;")} · ${phone} · ${statusLabel} · ${lastTs}</option>`;
        }).join("")}
      </select>
    </div>` : "";

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

    #conv-area, .tab-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
    #messages { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; }

    /* Client send bar */
    #client-send-bar { background: #fff; border-top: 1px solid #dfe0e3; padding: 8px 12px; display: flex; gap: 8px; align-items: flex-end; }
    #client-send-bar textarea { flex: 1; border: 1px solid #dfe0e3; border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; color: #333840; font-family: inherit; resize: none; min-height: 36px; max-height: 80px; }
    #client-send-bar textarea:focus { border-color: #2283d8; }
    #client-send-bar button { background: #2283d8; color: #fff; border: none; border-radius: 8px; padding: 8px 12px; cursor: pointer; transition: background .15s; display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    #client-send-bar button:hover { background: #1b6cb8; }
    #client-send-bar button:disabled { opacity: .5; cursor: not-allowed; }
    #client-send-bar .icon-btn { background: #f4f6f8; color: #535c69; padding: 8px; }
    #client-send-bar .icon-btn:hover { background: #e3e8ed; color: #2283d8; }
    #client-send-bar .icon-btn.recording { background: #ef4444; color: #fff; animation: pulseRec 1s infinite; }
    @keyframes pulseRec { 0%,100%{opacity:1} 50%{opacity:.6} }
    #status-msg { font-size: 11px; color: #959ca4; text-align: center; padding: 2px 16px; min-height: 14px; }

    /* Tab bar */
    #tab-bar { display: flex; background: #fff; border-bottom: 1px solid #dfe0e3; }
    .tab-btn { flex: 1; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #959ca4; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; transition: all .15s; }
    .tab-btn:hover { color: #2283d8; background: #f0f7ff; }
    .tab-btn.active { color: #2283d8; border-bottom-color: #2283d8; }
    .tab-content { display: none; flex: 1; flex-direction: column; overflow: hidden; min-height: 0; }
    .tab-content.active { display: flex; }

    /* Agent Badges — horizontal gallery scroll */
    #agent-badges { display: flex; flex-wrap: nowrap; gap: 6px; padding: 6px 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; background: #f9fafb; border-bottom: 1px solid #f0f1f3; flex-shrink: 0; }
    #agent-badges::-webkit-scrollbar { display: none; height: 0; }
    #agent-badges { scrollbar-width: none; -ms-overflow-style: none; }
    .agent-badge-btn { display: flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; border: 1.5px solid #dfe0e3; background: #fff; font-size: 11px; font-weight: 500; color: #555; cursor: pointer; white-space: nowrap; transition: all .15s; flex-shrink: 0; }
    .agent-badge-btn:hover { border-color: #2283d8; color: #2283d8; }
    .agent-badge-btn.active { background: #2283d8; color: #fff; border-color: #2283d8; }
    .agent-badge-icon { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
    .agent-badge-btn:not(.active) .agent-badge-icon { background: linear-gradient(135deg, #7b5ea7, #2283d8); color: #fff; }
    .agent-badge-btn.active .agent-badge-icon { background: rgba(255,255,255,0.3); color: #fff; }

    /* AI Chat messages */
    #ai-messages { flex: 1; overflow-y: auto; padding: 8px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
    .ai-msg { max-width: 90%; padding: 8px 12px; border-radius: 12px; font-size: 12px; line-height: 1.5; word-break: break-word; white-space: pre-wrap; }
    .ai-msg.user { align-self: flex-end; background: #2283d8; color: #fff; border-bottom-right-radius: 4px; }
    .ai-msg.assistant { align-self: flex-start; background: #f5f7fa; color: #333840; border: 1px solid #dfe0e3; border-bottom-left-radius: 4px; }
    .ai-msg .typing-dots::after { content: '...'; animation: dots 1.2s steps(4,end) infinite; }
    @keyframes dots { 0%,20%{content:'.'} 40%{content:'..'} 60%,100%{content:'...'} }
    .use-response-btn { display: inline-flex; align-items: center; gap: 4px; background: #e8f4fd; color: #2283d8; border: 1px solid #c4dff0; border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; margin-top: 6px; transition: all .15s; }
    .use-response-btn:hover { background: #2283d8; color: #fff; }
    .ai-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; color: #959ca4; text-align: center; flex: 1; }
    .ai-empty svg { margin-bottom: 8px; color: #c4cdd5; }
    .ai-empty p { font-size: 12px; line-height: 1.5; }

    /* AI Input */
    #ai-input-area { display: flex; gap: 6px; padding: 8px 12px; background: #fff; border-top: 1px solid #eee; align-items: flex-end; flex-shrink: 0; }
    #ai-input { flex: 1; border: 1px solid #dfe0e3; border-radius: 8px; padding: 8px 12px; font-size: 12px; outline: none; color: #333840; font-family: inherit; resize: none; min-height: 36px; max-height: 80px; }
    #ai-input:focus { border-color: #2283d8; }
    #ai-send-btn { background: #2283d8; color: #fff; border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
    #ai-send-btn:hover { background: #1b6cb8; }
    #ai-send-btn:disabled { opacity: .5; cursor: not-allowed; }
    .ai-suggestions { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 16px 8px; background: #fff; flex-shrink: 0; }
    .ai-suggestions button { background: #f5f7fa; color: #333840; border: 1px solid #dfe0e3; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap; display: flex; align-items: center; gap: 3px; }
    .ai-suggestions button:hover { background: #e8f4fd; color: #2283d8; border-color: #2283d8; }

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

  <!-- Tab Bar -->
  <div id="tab-bar">
    <button class="tab-btn active" onclick="switchTab('conversa')" id="tab-btn-conversa">${B24_ICONS.message} Conversa</button>
    <button class="tab-btn" onclick="switchTab('consulta')" id="tab-btn-consulta">${B24_ICONS.robot} Consulta IA</button>
  </div>

  <!-- Tab: Conversa -->
  <div id="tab-conversa" class="tab-content active">
    ${switcherHtml}
    <div id="messages" style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column">
      ${conversationId ? messagesHtml : startConvHtml}
    </div>
    
    ${conversationId ? `
    <div id="client-send-bar">
      <input type="file" id="client-file-input" style="display:none" onchange="onFilePicked(event)" accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" />
      <button class="icon-btn" type="button" title="Anexar arquivo" onclick="document.getElementById('client-file-input').click()">${B24_ICONS.paperclip}</button>
      <button class="icon-btn" id="mic-btn" type="button" title="Gravar áudio" onclick="toggleAudioRecording()">${B24_ICONS.mic}</button>
      <textarea id="client-input" rows="1" placeholder="Escreva ao cliente..." oninput="autoResize(this)"></textarea>
      <button onclick="sendClientMessage()" id="send-client-btn">${B24_ICONS.send} Enviar</button>
    </div>
    <div style="background:#fff;padding:0 12px 4px;display:flex;gap:6px;align-items:center">
      ${returnToBotBtn}
    </div>
    ` : ""}
    <div id="status-msg"></div>
  </div>

  <!-- Tab: Consulta IA -->
  <div id="tab-consulta" class="tab-content">
    <div id="agent-badges"></div>
    <div id="ai-messages">
      <div class="ai-empty" id="ai-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>
        <p>Selecione um agente e faça a sua pergunta.<br>A Emmely responde com base no contexto da conversa.</p>
      </div>
    </div>
    <div id="ai-input-area">
      <textarea id="ai-input" rows="1" placeholder="Pergunte à Emmely..." oninput="autoResizeAi(this)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAiMessage()}"></textarea>
      <button id="ai-send-btn" onclick="sendAiMessage()">${B24_ICONS.send}</button>
    </div>
    <div class="ai-suggestions">
      <button onclick="quickAsk('Faz um resumo desta conversa com o cliente')">${B24_ICONS.clipboard} Resumir</button>
      <button onclick="quickAsk('Sugere uma resposta profissional para enviar ao cliente')">${B24_ICONS.lightbulb} Sugerir</button>
      <button onclick="quickAsk('Analisa o sentimento do cliente nesta conversa')">${B24_ICONS.smile} Sentimento</button>
      <button onclick="quickAsk('Qual é o procedimento recomendado para este caso?')">${B24_ICONS.list} Procedimento</button>
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
  var ENTITY_ID = "${opts.entityId || ""}";
  var ENTITY_TYPE_ID = "${opts.entityType || ""}";
  var PHONES = ${JSON.stringify(phones)};
  var CONV_SUMMARY = ${JSON.stringify(convSummary)};
  var AGENTS = ${agentsJson};
    var selectedAgentId = AGENTS.length > 0 ? AGENTS[0].id : null;
    var selectedAgentName = AGENTS.length > 0 ? AGENTS[0].name : '';
    var BADGE_COLORS = ['#2283d8','#7b5ea7','#e06c4f','#22a86b','#d4a017','#3ea8c7','#c75ea7','#5ea77b'];

    // ── Build agent badges ──
    function renderBadges() {
      var container = document.getElementById('agent-badges');
      if (!container || AGENTS.length === 0) return;
      container.innerHTML = AGENTS.map(function(a, i) {
        var isActive = a.id === selectedAgentId;
        var color = BADGE_COLORS[i % BADGE_COLORS.length];
        return '<button class="agent-badge-btn' + (isActive ? ' active' : '') + '" data-id="' + a.id + '" data-name="' + a.name.replace(/"/g,'&quot;') + '" onclick="selectAgent(this)" style="' + (isActive ? 'background:'+color+';border-color:'+color : '') + '">' +
          '<span class="agent-badge-icon" style="' + (!isActive ? 'background:'+color : '') + '">' + a.name.charAt(0).toUpperCase() + '</span>' +
          a.name + '</button>';
      }).join('');
      updatePlaceholder();
    }
    renderBadges();

    function selectAgent(el) {
      var id = el.getAttribute('data-id');
      var name = el.getAttribute('data-name');
      if (id === selectedAgentId) return;
      selectedAgentId = id;
      selectedAgentName = name;
      // Clear chat history when switching agent
      aiHistory = [];
      var msgs = document.getElementById('ai-messages');
      msgs.innerHTML = '<div class="ai-empty" id="ai-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg><p>Pergunte ao <strong>' + name + '</strong><br>A resposta será baseada no contexto da conversa.</p></div>';
      renderBadges();
    }

    function updatePlaceholder() {
      var input = document.getElementById('ai-input');
      if (input && selectedAgentName) input.placeholder = 'Pergunte ao ' + selectedAgentName + '...';
    }

    function autoResizeAi(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 80) + 'px';
    }

    // ── AI Chat functions ──
    var aiHistory = [];
    var aiSending = false;

    function appendAiMsg(role, text, showUseBtn) {
      var empty = document.getElementById('ai-empty');
      if (empty) empty.remove();
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
      // Switch to conversa tab first
      switchTab('conversa');
      
      var clientInput = document.getElementById('client-input');
      if (clientInput) {
        clientInput.value = text;
        autoResize(clientInput);
        clientInput.focus();
        setStatus('Resposta copiada para o campo de envio', '#2283d8');
        return;
      }
      
      // No conversation yet — create send bar dynamically
      var messagesDiv = document.getElementById('messages');
      if (!messagesDiv) return;
      
      // Check if we already injected a temporary send bar
      var existingBar = document.getElementById('client-send-bar');
      if (!existingBar) {
        var bar = document.createElement('div');
        bar.id = 'client-send-bar';
        bar.innerHTML = '<input type="file" id="client-file-input" style="display:none" onchange="onFilePicked(event)" accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" />' +
          '<button class="icon-btn" type="button" title="Anexar arquivo" onclick="document.getElementById(\\'client-file-input\\').click()">${B24_ICONS.paperclip}</button>' +
          '<button class="icon-btn" id="mic-btn" type="button" title="Gravar áudio" onclick="toggleAudioRecording()">${B24_ICONS.mic}</button>' +
          '<textarea id="client-input" rows="1" placeholder="Escreva ao cliente..." oninput="autoResize(this)"></textarea>' +
          '<button onclick="sendClientMessage()" id="send-client-btn">${B24_ICONS.send} Enviar</button>';
        messagesDiv.parentElement.insertBefore(bar, messagesDiv.nextSibling);
      }
      
      var newInput = document.getElementById('client-input');
      if (newInput) {
        newInput.value = text;
        autoResize(newInput);
        newInput.focus();
        setStatus('Resposta copiada — envie para iniciar a conversa', '#2283d8');
      }
    }

    function switchTab(tab) {
      document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
      document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
      var content = document.getElementById('tab-' + tab);
      var btn = document.getElementById('tab-btn-' + tab);
      if (content) content.classList.add('active');
      if (btn) btn.classList.add('active');
      if (tab === 'consulta') {
        var aiInput = document.getElementById('ai-input');
        if (aiInput) aiInput.focus();
      }
    }

    function quickAsk(text) {
      switchTab('consulta');
      document.getElementById('ai-input').value = text;
      sendAiMessage();
    }

    function sendAiMessage() {
      if (aiSending) return;
      var input = document.getElementById('ai-input');
      var questionText = (input.value || '').trim();
      if (!questionText) return;

      input.value = '';
      input.style.height = 'auto';
      aiSending = true;
      document.getElementById('ai-send-btn').disabled = true;

      appendAiMsg('user', questionText, false);

      // Build context on first message
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

      // Always use ai-playground with selected agent; fallback to ai-process-message
      var url, payload;
      if (selectedAgentId) {
        url = SUPABASE_URL + '/functions/v1/ai-playground';
        payload = { agent_id: selectedAgentId, messages: aiHistory };
      } else {
        url = SUPABASE_URL + '/functions/v1/ai-process-message';
        payload = { message_text: fullText, skip_send: true };
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
      });
    }

    function sendClientMessage() {
      var input = document.getElementById('client-input');
      var message = (input ? input.value : '').trim();
      if (!message) { setStatus('Escreva uma mensagem', '#f59e0b'); return; }
      
      var sendBtn = document.getElementById('send-client-btn');
      if (sendBtn) sendBtn.disabled = true;
      setStatus('A enviar...', '#888');
      
      function doSend(convId) {
        var operatorName = '';
        try {
          if (window._bitrixCurrentUser) operatorName = window._bitrixCurrentUser.NAME + ' ' + (window._bitrixCurrentUser.LAST_NAME || '');
        } catch(e) {}
        operatorName = operatorName.trim() || 'Operador Bitrix24';

        fetch(SUPABASE_URL + '/functions/v1/message-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({
            conversation_id: convId,
            content: message,
            sender_name: operatorName
          })
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.error) throw new Error(d.error);
          var container = document.getElementById('messages');
          if (container) {
            var div = document.createElement('div');
            div.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:6px';
            div.innerHTML = '<div style="background:#2283d8;color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:80%;font-size:13px;white-space:pre-wrap">' + message.replace(/</g,'&lt;') + '</div>';
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
          }
          input.value = '';
          if (input) autoResize(input);
          setStatus('✅ Mensagem enviada', '#22c55e');
          if (sendBtn) sendBtn.disabled = false;

          // Mirror message to Bitrix24 Open Channel (fire-and-forget)
          try {
            var contactPhone = PHONES.length > 0 ? PHONES[0] : null;
            var mirrorContactId = contactPhone || CONTACT_NAME || 'unknown';
            var mirrorMsg = '[b]' + operatorName + '[/b] - ' + message;
            fetch(SUPABASE_URL + '/functions/v1/bitrix24-send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
              body: JSON.stringify({
                message: mirrorMsg,
                contactName: CONTACT_NAME || 'Cliente',
                contactId: mirrorContactId,
                channel: CHANNEL || 'whatsapp',
                conversationId: convId,
                agentName: operatorName
              })
            }).catch(function() {});
          } catch(e) {}
        })
        .catch(function(e) {
          setStatus('❌ ' + e.message, '#ef4444');
          if (sendBtn) sendBtn.disabled = false;
        });
      }

      if (CONVERSATION_ID) {
        doSend(CONVERSATION_ID);
      } else {
        // No conversation yet — create one first via Supabase REST, then send
        var phone = PHONES.length > 0 ? PHONES[0] : null;
        var channel = CHANNEL || (phone ? 'whatsapp' : 'webchat');
        var convPayload = {
          channel: channel,
          contact_name: CONTACT_NAME || 'Cliente Bitrix24',
          contact_phone: phone || null,
          status: 'open',
          unread_count: 0
        };
        fetch(SUPABASE_URL + '/rest/v1/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(convPayload)
        })
        .then(function(r) { return r.json(); })
        .then(function(rows) {
          var newConv = Array.isArray(rows) ? rows[0] : rows;
          if (!newConv || !newConv.id) throw new Error('Falha ao criar conversa');
          CONVERSATION_ID = newConv.id;
          setStatus('Conversa criada, a enviar...', '#888');
          doSend(newConv.id);
        })
        .catch(function(e) {
          setStatus('❌ ' + e.message, '#ef4444');
          if (sendBtn) sendBtn.disabled = false;
        });
      }
    }

    // ── Media (file / audio) sending ──
    function blobToBase64(blob) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function() {
          var s = String(reader.result || '');
          var i = s.indexOf(',');
          resolve(i >= 0 ? s.substring(i + 1) : s);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    function ensureConversationThen(cb) {
      if (CONVERSATION_ID) { cb(CONVERSATION_ID); return; }
      var phone = PHONES.length > 0 ? PHONES[0] : null;
      var channel = CHANNEL || (phone ? 'whatsapp' : 'webchat');
      fetch(SUPABASE_URL + '/rest/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=representation' },
        body: JSON.stringify({ channel: channel, contact_name: CONTACT_NAME || 'Cliente Bitrix24', contact_phone: phone || null, status: 'open', unread_count: 0 })
      })
        .then(function(r) { return r.json(); })
        .then(function(rows) {
          var nc = Array.isArray(rows) ? rows[0] : rows;
          if (!nc || !nc.id) throw new Error('Falha ao criar conversa');
          CONVERSATION_ID = nc.id;
          cb(nc.id);
        })
        .catch(function(e) { setStatus('❌ ' + e.message, '#ef4444'); });
    }

    function sendMedia(blob, fileName, mimeType, messageType) {
      setStatus('A enviar ' + (messageType === 'audio' ? 'áudio' : (messageType === 'image' ? 'imagem' : 'arquivo')) + '...', '#888');
      blobToBase64(blob).then(function(b64) {
        ensureConversationThen(function(convId) {
          var caption = '';
          var inp = document.getElementById('client-input');
          if (inp && messageType !== 'audio') { caption = (inp.value || '').trim(); }
          fetch(SUPABASE_URL + '/functions/v1/message-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
            body: JSON.stringify({
              conversation_id: convId,
              content: caption,
              message_type: messageType,
              media_base64: b64,
              media_mime_type: mimeType,
              file_name: fileName
            })
          })
            .then(function(r) { return r.json(); })
            .then(function(d) {
              if (d && d.error) throw new Error(d.error);
              setStatus('✅ Enviado', '#22c55e');
              if (inp && messageType !== 'audio') { inp.value = ''; autoResize(inp); }
              var container = document.getElementById('messages');
              if (container) {
                var div = document.createElement('div');
                div.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:6px';
                var label = messageType === 'audio' ? '🎤 Áudio enviado' : (messageType === 'image' ? '🖼️ Imagem: ' + fileName : '📎 ' + fileName);
                div.innerHTML = '<div style="background:#2283d8;color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:80%;font-size:13px">' + label + '</div>';
                container.appendChild(div);
                container.scrollTop = container.scrollHeight;
              }
            })
            .catch(function(e) { setStatus('❌ ' + e.message, '#ef4444'); });
        });
      });
    }

    function onFilePicked(ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      var mime = f.type || 'application/octet-stream';
      var mt = mime.indexOf('image/') === 0 ? 'image' : (mime.indexOf('audio/') === 0 ? 'audio' : 'document');
      sendMedia(f, f.name, mime, mt);
    }

    var _mediaRecorder = null;
    var _audioChunks = [];
    function toggleAudioRecording() {
      var btn = document.getElementById('mic-btn');
      if (_mediaRecorder && _mediaRecorder.state === 'recording') {
        _mediaRecorder.stop();
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('Navegador não suporta gravação de áudio', '#ef4444'); return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        var mime = 'audio/webm;codecs=opus';
        try { if (!MediaRecorder.isTypeSupported(mime)) mime = 'audio/ogg;codecs=opus'; } catch(e) {}
        try { if (!MediaRecorder.isTypeSupported(mime)) mime = 'audio/webm'; } catch(e) {}
        _audioChunks = [];
        _mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        _mediaRecorder.ondataavailable = function(e) { if (e.data && e.data.size > 0) _audioChunks.push(e.data); };
        _mediaRecorder.onstop = function() {
          if (btn) { btn.classList.remove('recording'); btn.innerHTML = '${B24_ICONS.mic}'; btn.title = 'Gravar áudio'; }
          stream.getTracks().forEach(function(t) { t.stop(); });
          var blob = new Blob(_audioChunks, { type: mime });
          if (blob.size === 0) { setStatus('Áudio vazio', '#f59e0b'); return; }
          showAudioPreview(blob);
        };
        _mediaRecorder.start();
        if (btn) { btn.classList.add('recording'); btn.innerHTML = '${B24_ICONS.stop}'; btn.title = 'Parar gravação'; }
        setStatus('🎤 A gravar... clique no botão para parar', '#ef4444');
      }).catch(function(e) {
        setStatus('❌ Microfone negado: ' + e.message, '#ef4444');
      });
    }

    function showAudioPreview(blob) {
      var bar = document.getElementById('client-send-bar');
      if (!bar) { sendMedia(blob, 'audio-' + Date.now() + '.ogg', 'audio/ogg', 'audio'); return; }
      var existing = document.getElementById('audio-preview-bar');
      if (existing) { try { URL.revokeObjectURL(existing.dataset.url); } catch(e) {} existing.remove(); }
      var url = URL.createObjectURL(blob);
      var wrap = document.createElement('div');
      wrap.id = 'audio-preview-bar';
      wrap.dataset.url = url;
      wrap.style.cssText = 'background:#f4f6f8;border-top:1px solid #dfe0e3;padding:8px 12px;display:flex;gap:8px;align-items:center';
      wrap.innerHTML = '<audio controls src="' + url + '" style="flex:1;height:36px"></audio>' +
        '<button class="icon-btn" type="button" id="audio-preview-cancel" title="Descartar">✕</button>' +
        '<button id="audio-preview-send" style="background:#22c55e;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:4px">${B24_ICONS.send} Enviar</button>';
      bar.parentNode.insertBefore(wrap, bar);
      document.getElementById('audio-preview-cancel').onclick = function() {
        try { URL.revokeObjectURL(url); } catch(e) {}
        wrap.remove();
      };
      document.getElementById('audio-preview-send').onclick = function() {
        var sBtn = document.getElementById('audio-preview-send');
        if (sBtn) { sBtn.disabled = true; sBtn.style.opacity = '0.6'; }
        sendMedia(blob, 'audio-' + Date.now() + '.ogg', 'audio/ogg', 'audio');
        try { URL.revokeObjectURL(url); } catch(e) {}
        wrap.remove();
      };
    }

    function autoResize(el) {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
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

    // ── HSM Templates (Gupshup) ──
    var HSM_TEMPLATES = [];
    var SELECTED_HSM = null;

    function loadHsmTemplates() {
      var sel = document.getElementById('hsm-template-select');
      if (!sel) return;
      fetch(SUPABASE_URL + '/functions/v1/gupshup-templates', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        HSM_TEMPLATES = (d && d.templates) || [];
        sel.innerHTML = '';
        var opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = HSM_TEMPLATES.length
          ? '— Nenhum (usar texto livre, só dentro de 24h) —'
          : (d && d.reason === 'missing_app_id'
              ? '⚠ Configure GUPSHUP_APP_ID em Integrações'
              : (d && d.reason === 'missing_api_key'
                  ? '⚠ Configure GUPSHUP_API_KEY em Integrações'
                  : '— Sem templates aprovados —'));
        sel.appendChild(opt0);
        HSM_TEMPLATES.forEach(function(t) {
          var o = document.createElement('option');
          o.value = t.id;
          o.textContent = (t.elementName || t.id) + (t.language ? ' [' + t.language + ']' : '') +
                          (t.paramCount ? ' • ' + t.paramCount + ' var' : '');
          sel.appendChild(o);
        });
      })
      .catch(function(e) {
        sel.innerHTML = '<option value="">Erro ao carregar: ' + (e.message || e) + '</option>';
      });
    }

    function renderHsmPreview() {
      var preview = document.getElementById('hsm-preview');
      if (!preview || !SELECTED_HSM) return;
      var body = SELECTED_HSM.body || '';
      for (var i = 1; i <= SELECTED_HSM.paramCount; i++) {
        var inp = document.getElementById('hsm-param-' + i);
        var v = inp ? (inp.value || '').trim() : '';
        body = body.split('{{' + i + '}}').join(v ? v : '{{' + i + '}}');
      }
      preview.textContent = body;
    }

    function onHsmTemplateChange() {
      var sel = document.getElementById('hsm-template-select');
      var container = document.getElementById('hsm-params-container');
      var preview = document.getElementById('hsm-preview');
      var freeWrap = document.getElementById('free-text-wrap');
      var quickWrap = document.getElementById('quick-reply-wrap');
      var id = sel ? sel.value : '';
      SELECTED_HSM = null;
      if (!id) {
        if (container) { container.style.display = 'none'; container.innerHTML = ''; }
        if (preview) { preview.style.display = 'none'; preview.textContent = ''; }
        if (freeWrap) freeWrap.style.display = '';
        if (quickWrap) quickWrap.style.display = '';
        return;
      }
      SELECTED_HSM = HSM_TEMPLATES.find(function(t) { return String(t.id) === String(id); });
      if (!SELECTED_HSM) return;
      // Hide free text & quick replies — HSM is the only valid path
      if (freeWrap) freeWrap.style.display = 'none';
      if (quickWrap) quickWrap.style.display = 'none';
      if (container) {
        container.innerHTML = '';
        for (var i = 1; i <= SELECTED_HSM.paramCount; i++) {
          var label = document.createElement('label');
          label.style.cssText = 'font-size:11px;color:#959ca4;display:block;margin:6px 0 2px';
          label.textContent = 'Parâmetro {{' + i + '}}';
          var input = document.createElement('input');
          input.type = 'text';
          input.id = 'hsm-param-' + i;
          input.placeholder = 'Valor para {{' + i + '}}';
          input.style.cssText = 'width:100%;padding:7px 10px;border:1px solid #dfe0e3;border-radius:8px;font-size:13px;color:#333840;outline:none';
          input.oninput = renderHsmPreview;
          container.appendChild(label);
          container.appendChild(input);
        }
        container.style.display = SELECTED_HSM.paramCount > 0 ? 'block' : 'none';
      }
      if (preview) { preview.style.display = 'block'; }
      renderHsmPreview();
    }

    function onQuickReplyChange() {
      var sel = document.getElementById('template-select');
      var ta = document.getElementById('start-msg-input');
      if (sel && ta && sel.value) ta.value = sel.value;
    }

    function startConversation(channel, phone) {
      var hsmSel = document.getElementById('hsm-template-select');
      var hsmId = hsmSel ? hsmSel.value : '';
      var isHsm = !!hsmId && !!SELECTED_HSM;

      // Se for WhatsApp e não houver telefone no CRM, ler do input manual
      if (channel === 'whatsapp' && !phone) {
        var manualInp = document.getElementById('manual-phone-input');
        var manual = manualInp ? (manualInp.value || '').replace(/\\D/g, '') : '';
        if (!manual || manual.length < 8) {
          setStatus('Informe o telefone (com indicativo, apenas dígitos)', '#f59e0b');
          if (manualInp) manualInp.focus();
          return;
        }
        phone = manual;
      }

      var message = '';
      var params = [];

      if (isHsm) {
        for (var i = 1; i <= SELECTED_HSM.paramCount; i++) {
          var inp = document.getElementById('hsm-param-' + i);
          var v = inp ? (inp.value || '').trim() : '';
          if (!v) { setStatus('Preencha o parâmetro {{' + i + '}}', '#f59e0b'); if (inp) inp.focus(); return; }
          params.push(v);
        }
        message = SELECTED_HSM.body || '';
        for (var j = 1; j <= params.length; j++) {
          message = message.split('{{' + j + '}}').join(params[j - 1]);
        }
      } else {
        var msgInput = document.getElementById('start-msg-input');
        message = msgInput ? msgInput.value.trim() : 'Olá! Em que posso ajudar?';
        if (!message) { setStatus('Escreva uma mensagem', '#f59e0b'); return; }
      }

      setStatus('A iniciar conversa...', '#888');
      var convPayload = {
        channel: channel || 'whatsapp',
        contact_name: CONTACT_NAME || 'Cliente Bitrix24',
        contact_phone: phone || null,
        status: 'open',
        unread_count: 0
      };
      fetch(SUPABASE_URL + '/rest/v1/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(convPayload)
      })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var newConv = Array.isArray(rows) ? rows[0] : rows;
        if (!newConv || !newConv.id) throw new Error('Falha ao criar conversa');
        CONVERSATION_ID = newConv.id;

        var sendBody = { conversation_id: newConv.id, content: message };
        if (isHsm) {
          sendBody.message_type = 'template';
          sendBody.resolvedInteractiveData = { id: SELECTED_HSM.id, params: params };
        }

        return fetch(SUPABASE_URL + '/functions/v1/message-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
          body: JSON.stringify(sendBody)
        }).then(function(r) { return r.json(); });
      })
      .then(function(d) {
        if (d && d.error) throw new Error(typeof d.error === 'string' ? d.error : JSON.stringify(d.error));
        setStatus('✅ Conversa iniciada!', '#22c55e');
      })
      .catch(function(e) { setStatus('❌ ' + (e.message || e), '#ef4444'); });
    }

  try {
    BX24.init(function() {
      BX24.fitWindow();
      // Fetch current user for operator name — disable send until loaded
      var sendBtn = document.getElementById('send-client-btn');
      if (sendBtn) sendBtn.disabled = true;
      try {
        BX24.callMethod('user.current', {}, function(res) {
          if (res.data()) window._bitrixCurrentUser = res.data();
          if (sendBtn) sendBtn.disabled = false;
        });
      } catch(e) { if (sendBtn) sendBtn.disabled = false; }
      // Lazy-load HSM templates when the start-conversation card is on screen
      try { if (document.getElementById('hsm-template-select')) loadHsmTemplates(); } catch(e) {}
    });
  } catch(e) {
    try { if (document.getElementById('hsm-template-select')) loadHsmTemplates(); } catch(_) {}
  }
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

    // Infer entityTypeId from PLACEMENT value when not explicitly provided
    const placement = body.PLACEMENT || "";
    let inferredTypeId = "1"; // default Lead
    if (placement.includes("DEAL")) inferredTypeId = "2";
    else if (placement.includes("CONTACT")) inferredTypeId = "3";
    else if (placement.includes("COMPANY")) inferredTypeId = "4";

    const entityTypeId = placementOptions.ENTITY_TYPE_ID || placementOptions.entity_type_id || body.ENTITY_TYPE_ID || inferredTypeId;

    // Optional: user can pick a specific conversation from the conversation switcher
    const requestedConvId: string = (body.selected_conversation_id || body.conversation_id || "").toString();

    // Optional: query string fallback for selected_conversation_id (e.g. iframe reload)
    let queryConvId = "";
    try {
      const u = new URL(req.url);
      queryConvId = u.searchParams.get("selected_conversation_id") || "";
    } catch { /* ignore */ }
    const selectedConvOverride = requestedConvId || queryConvId;

    console.log("[CRM-TAB] entityId:", entityId, "entityTypeId:", entityTypeId, "memberId:", memberId, "selectedConv:", selectedConvOverride);

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

    // Permission check removed — CRM placements are accessible to all users

    // --- Lookup conversation ---
    let conversation: any = null;
    let contactName = "";
    let allPhones: string[] = [];
    let allEmails: string[] = [];
    let conversationCandidates: any[] = [];

    // If user explicitly chose a conversation from the switcher, load it directly
    if (selectedConvOverride) {
      const { data: chosen } = await supabase
        .from("conversations")
        .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, last_message_at, bot_state")
        .eq("id", selectedConvOverride)
        .maybeSingle();
      if (chosen) {
        conversation = chosen;
        if (chosen.contact_name) contactName = chosen.contact_name;
        console.log("[CRM-TAB] Using user-selected conversation:", chosen.id);
      }
    }

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
        let linkedContactName = "";
        if (entityTypeNum === 2 && entity?.CONTACT_ID) {
          try {
            const contactData = await callBitrix(endpoint, accessToken, "crm.contact.get", { ID: entity.CONTACT_ID });
            const contact = contactData.result;
            if (contact) {
              const contactPhones = extractPhones(contact);
              const contactEmails = extractEmails(contact);
              linkedContactName = [contact.NAME, contact.LAST_NAME].filter(Boolean).join(" ");
              if (!contactName && linkedContactName) contactName = linkedContactName;
              allPhones = [...new Set([...allPhones, ...contactPhones])];
              allEmails = [...new Set([...allEmails, ...contactEmails])];
            }
          } catch (e) {
            console.warn("[CRM-TAB] Failed to fetch linked contact:", e);
          }
        }

        console.log("[CRM-TAB] Lookup context:", {
          entityId, entityTypeNum, contactName, linkedContactName,
          phones: allPhones, emails: allEmails,
          leadId: entity?.LEAD_ID || null, contactId: entity?.CONTACT_ID || null,
        });

        // ── 1. Deterministic local lookup via leads table ──
        if (!conversation) {
          const { data: localLead } = await supabase
            .from("leads")
            .select("id, conversation_id, client_id, name")
            .eq("bitrix24_id", String(entityId))
            .maybeSingle();

          if (localLead) {
            console.log("[CRM-TAB] Found local lead by bitrix24_id:", localLead.id, "conv:", localLead.conversation_id);
            if (localLead.conversation_id) {
              const { data: conv } = await supabase
                .from("conversations")
                .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
                .eq("id", localLead.conversation_id)
                .maybeSingle();
              if (conv) {
                conversation = conv;
                console.log("[CRM-TAB] ✓ Matched via lead.conversation_id");
              }
            }
            if (!conversation && localLead.client_id) {
              // Try active first
              const { data: activeConv } = await supabase
                .from("conversations")
                .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
                .eq("client_id", localLead.client_id)
                .neq("status", "fechada")
                .order("last_message_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (activeConv) {
                conversation = activeConv;
                console.log("[CRM-TAB] ✓ Matched via lead.client_id (active)");
              } else {
                // Fallback: include closed
                const { data: anyConv } = await supabase
                  .from("conversations")
                  .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
                  .eq("client_id", localLead.client_id)
                  .order("last_message_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (anyConv) {
                  conversation = anyConv;
                  console.log("[CRM-TAB] ✓ Matched via lead.client_id (closed):", anyConv.status);
                }
              }
            }
            if (!contactName && localLead.name) contactName = localLead.name;
          }
        }

        // ── 2. Bot state lookup (deterministic IDs — before phone/email heuristics) ──
        if (!conversation) {
          conversation = await findConversationByBotState(supabase, entityId, entityTypeId);
          if (conversation) console.log("[CRM-TAB] ✓ Matched via bot_state");
        }
        if (!conversation && entityTypeNum === 2) {
          conversation = await findConversationByBotState(supabase, entityId, "2");
          if (conversation) console.log("[CRM-TAB] ✓ Matched via bot_state (deal prefix)");
        }
        // For Deals, also try the linked LEAD_ID in bot_state
        if (!conversation && entityTypeNum === 2 && entity?.LEAD_ID) {
          conversation = await findConversationByBotState(supabase, String(entity.LEAD_ID), "1");
          if (!conversation) {
            conversation = await findConversationByBotState(supabase, String(entity.LEAD_ID));
          }
          if (conversation) console.log("[CRM-TAB] ✓ Matched via deal's LEAD_ID:", entity.LEAD_ID);
        }

        // ── 2.5 Open Channel chat_id (LID) lookup — handles WhatsApp contacts without real phone ──
        if (!conversation) {
          conversation = await findConversationByOpenChannelChatId(
            supabase, endpoint, accessToken, entityTypeNum, String(entityId),
            entityTypeNum === 2 ? entity?.CONTACT_ID : undefined,
          );
          if (conversation) {
            console.log("[CRM-TAB] ✓ Matched via openchannel LID:", conversation.contact_lid);
            try {
              const prevState = (conversation.bot_state as any) || {};
              await supabase.from("conversations").update({
                bot_state: { ...prevState, bitrix_entity_id: `${entityTypeNum}:${entityId}` },
              }).eq("id", conversation.id);
            } catch (e) {
              console.warn("[CRM-TAB] Failed to cache bitrix_entity_id:", String((e as any)?.message || e));
            }
          }
        }

        // ── 3. Phone/email lookup ──
        if (!conversation && allPhones.length > 0) {
          conversation = await findConversationByPhone(supabase, allPhones);
          if (conversation) console.log("[CRM-TAB] ✓ Matched via phone");
        }
        if (!conversation && allEmails.length > 0) {
          conversation = await findConversationByEmail(supabase, allEmails);
          if (conversation) console.log("[CRM-TAB] ✓ Matched via email");
        }

        // ── 4. Client lookup via CONTACT_ID → clients.bitrix24_id → conversations.client_id ──
        if (!conversation && entityTypeNum === 2 && entity?.CONTACT_ID) {
          try {
            const { data: client } = await supabase
              .from("clients")
              .select("id")
              .eq("bitrix24_id", String(entity.CONTACT_ID))
              .maybeSingle();
            if (client) {
              // Try active first
              const { data: activeConv } = await supabase
                .from("conversations")
                .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
                .eq("client_id", client.id)
                .neq("status", "fechada")
                .order("last_message_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (activeConv) {
                conversation = activeConv;
                console.log("[CRM-TAB] ✓ Matched via client.bitrix24_id (CONTACT_ID:", entity.CONTACT_ID, ")");
              } else {
                const { data: anyConv } = await supabase
                  .from("conversations")
                  .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
                  .eq("client_id", client.id)
                  .order("last_message_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (anyConv) {
                  conversation = anyConv;
                  console.log("[CRM-TAB] ✓ Matched via client.bitrix24_id closed (CONTACT_ID:", entity.CONTACT_ID, ")");
                }
              }
            }
          } catch (e) { console.warn("[CRM-TAB] Client bitrix24_id lookup failed:", e); }
        }

        // ── 5. For Deals without contact, try COMPANY_ID ──
        if (!conversation && entityTypeNum === 2 && entity?.COMPANY_ID) {
          try {
            const companyData = await callBitrix(endpoint, accessToken, "crm.company.get", { ID: entity.COMPANY_ID });
            const company = companyData.result;
            if (company) {
              const compPhones = extractPhones(company);
              const compEmails = extractEmails(company);
              if (compPhones.length) {
                allPhones = [...new Set([...allPhones, ...compPhones])];
                conversation = await findConversationByPhone(supabase, compPhones);
                if (conversation) console.log("[CRM-TAB] ✓ Matched via company phone");
              }
              if (!conversation && compEmails.length) {
                allEmails = [...new Set([...allEmails, ...compEmails])];
                conversation = await findConversationByEmail(supabase, compEmails);
                if (conversation) console.log("[CRM-TAB] ✓ Matched via company email");
              }
            }
          } catch (e) { console.warn("[CRM-TAB] Company lookup failed:", e); }
        }

        // ── 5b. Telephony searchCrmEntities fallback ──
        // When we have a conversation with a real phone but no bitrix link, or
        // when we have no conversation but phones exist, use Bitrix24's telephony
        // fuzzy phone matching to find/resolve CRM entities
        if (!conversation && allPhones.length > 0) {
          console.log("[CRM-TAB] Trying telephony.searchCrmEntities with phones:", allPhones);
          for (const phone of allPhones) {
            try {
              const telRes = await callBitrix(endpoint, accessToken, "telephony.externalCall.searchCrmEntities", { PHONE_NUMBER: phone });
              const entities = telRes?.result || [];
              if (entities.length > 0) {
                console.log("[CRM-TAB] telephony found entities:", JSON.stringify(entities));
                // Try to find a conversation via the discovered contact/lead
                for (const ent of entities) {
                  const entType = String(ent.CRM_ENTITY_TYPE || "").toUpperCase();
                  const entId = String(ent.CRM_ENTITY_ID || "");
                  if (!entId) continue;

                  // Map entity type to bot_state field
                  if (entType === "CONTACT") {
                    // Look up via clients.bitrix24_id
                    const { data: client } = await supabase
                      .from("clients")
                      .select("id")
                      .eq("bitrix24_id", entId)
                      .maybeSingle();
                    if (client) {
                      const { data: conv } = await supabase
                        .from("conversations")
                        .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
                        .eq("client_id", client.id)
                        .order("last_message_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (conv) {
                        conversation = conv;
                        console.log("[CRM-TAB] ✓ Matched via telephony→client.bitrix24_id:", entId);
                        break;
                      }
                    }
                  } else if (entType === "LEAD") {
                    // Look up via leads.bitrix24_id
                    const { data: lead } = await supabase
                      .from("leads")
                      .select("id, conversation_id")
                      .eq("bitrix24_id", entId)
                      .maybeSingle();
                    if (lead?.conversation_id) {
                      const { data: conv } = await supabase
                        .from("conversations")
                        .select("id, contact_name, attendance_mode, channel, status, contact_phone, contact_lid, bot_state")
                        .eq("id", lead.conversation_id)
                        .maybeSingle();
                      if (conv) {
                        conversation = conv;
                        console.log("[CRM-TAB] ✓ Matched via telephony→lead.bitrix24_id:", entId);
                        break;
                      }
                    }
                  }
                }
                if (conversation) break;

                // If still no conversation, try the phone from telephony match in conversations directly
                conversation = await findConversationByPhone(supabase, [phone]);
                if (conversation) {
                  console.log("[CRM-TAB] ✓ Matched via telephony phone re-lookup:", phone);
                  break;
                }
              }
            } catch (telErr) {
              console.warn("[CRM-TAB] telephony.searchCrmEntities failed for", phone, ":", telErr);
            }
          }
        }

        // ── 5c. Reverse lookup: conversation has phone → find CRM entity via telephony ──
        if (conversation && !((conversation.bot_state as any)?.bitrix_deal_id) && conversation.contact_phone) {
          const convPhone = (conversation.contact_phone || "").replace(/\D/g, "");
          if (convPhone.length >= 8 && !convPhone.startsWith("@")) {
            try {
              const telRes = await callBitrix(endpoint, accessToken, "telephony.externalCall.searchCrmEntities", { PHONE_NUMBER: convPhone });
              const entities = telRes?.result || [];
              for (const ent of entities) {
                const entType = String(ent.CRM_ENTITY_TYPE || "").toUpperCase();
                const entId = String(ent.CRM_ENTITY_ID || "");
                if (entType === "CONTACT" && entId) {
                  // Persist the discovered contact_id in bot_state
                  const bs = (conversation.bot_state as any) || {};
                  if (!bs.bitrix_contact_id) {
                    await supabase.from("conversations").update({
                      bot_state: { ...bs, bitrix_contact_id: entId },
                    }).eq("id", conversation.id);
                    console.log("[CRM-TAB] ✓ Persisted bitrix_contact_id via telephony:", entId);
                  }
                  break;
                }
              }
            } catch (telErr) {
              console.warn("[CRM-TAB] Reverse telephony lookup failed:", telErr);
            }
          }
        }

        // ── 6. Name fallback — try linkedContactName first, then deal title ──
        if (!conversation) {
          const namesToTry = [linkedContactName, contactName].filter(Boolean);
          console.log("[CRM-TAB] Name fallback candidates:", namesToTry);
          for (const name of namesToTry) {
            if (!name) continue;
            conversation = await findConversationByName(supabase, name);
            if (conversation) {
              console.log("[CRM-TAB] ✓ Matched via name:", name);
              break;
            }
          }
        }

        // ── 7. Persist entity ID in bot_state for instant future lookups ──
        if (conversation && entityTypeNum === 2) {
          const bs = (conversation.bot_state as any) || {};
          if (String(bs.bitrix_deal_id || "") !== String(entityId)) {
            await supabase.from("conversations").update({
              bot_state: { ...bs, bitrix_deal_id: String(entityId) },
            }).eq("id", conversation.id);
            console.log("[CRM-TAB] ✓ Persisted bitrix_deal_id:", entityId, "on conversation:", conversation.id);
          }
        }
        if (conversation && entityTypeNum === 1) {
          const bs = (conversation.bot_state as any) || {};
          if (String(bs.bitrix_lead_id || "") !== String(entityId)) {
            await supabase.from("conversations").update({
              bot_state: { ...bs, bitrix_lead_id: String(entityId) },
            }).eq("id", conversation.id);
            console.log("[CRM-TAB] ✓ Persisted bitrix_lead_id:", entityId, "on conversation:", conversation.id);
          }
        }

        if (!conversation) {
          console.log("[CRM-TAB] ✗ No conversation found for entity", entityId, "phones:", allPhones, "emails:", allEmails, "name:", contactName);
        }
        if (conversation && !contactName) contactName = conversation.contact_name;

      } catch (crmErr) {
        console.error("[CRM-TAB] CRM lookup error:", crmErr);
      }
    }

    // Always gather candidate conversations by phone (so the user can switch between
    // multiple WhatsApp instances/conversations belonging to the same contact)
    if (allPhones.length > 0) {
      conversationCandidates = await findConversationsByPhone(supabase, allPhones);
      console.log("[CRM-TAB] Candidate conversations found:", conversationCandidates.length);
    }

    // If no conversation was selected/matched but candidates exist, default to the best one
    if (!conversation && conversationCandidates.length > 0) {
      conversation = conversationCandidates[0];
      console.log("[CRM-TAB] Defaulting to top candidate:", conversation.id);
    }

    // Make sure the currently selected conversation is in the candidates list
    if (conversation && !conversationCandidates.some((c) => c.id === conversation.id)) {
      conversationCandidates = [conversation, ...conversationCandidates];
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
      conversationCandidates,
    }), { headers: htmlHeaders });

  } catch (e) {
    console.error("[CRM-TAB] Error:", e);
    return new Response(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#ef4444">
      <h3>Erro ao carregar</h3><p>${String(e)}</p>
    </body></html>`, { headers: htmlHeaders });
  }
});
