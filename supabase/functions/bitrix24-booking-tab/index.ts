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

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) return JSON.parse(bodyText);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const bodyText = await req.text();
    const contentType = req.headers.get("content-type") || "";
    const body = parseBody(bodyText, contentType);

    // Resolve integration
    const memberId = body.member_id || body.auth?.member_id || url.searchParams.get("member_id");
    let integration: any = null;
    if (memberId) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").eq("member_id", memberId).maybeSingle();
      integration = data;
    }
    if (!integration) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      integration = data;
    }
    if (!integration?.client_endpoint) {
      return new Response(JSON.stringify({ error: "No integration" }), { status: 404, headers: jsonHeaders });
    }

    const accessToken = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";

    // --- Permission check ---
    if (action !== "get_config") {
      const currentUser = await callBitrix(ep, accessToken, "user.current", {});
      const bitrixUserId = String(currentUser?.result?.ID || "");
      if (bitrixUserId) {
        const { data: perms } = await supabase
          .from("bitrix24_user_permissions")
          .select("id")
          .eq("integration_id", integration.id)
          .eq("module", "emmely_agenda");
        if (perms && perms.length > 0) {
          const hasAccess = perms.some((p: any) =>
            p.bitrix_user_id === bitrixUserId
          );
          // Re-check with correct column
          const { data: userPerm } = await supabase
            .from("bitrix24_user_permissions")
            .select("id")
            .eq("integration_id", integration.id)
            .eq("module", "emmely_agenda")
            .eq("bitrix_user_id", bitrixUserId)
            .maybeSingle();
          if (!userPerm) {
            return new Response(JSON.stringify({ error: "Sem acesso ao módulo Emmely Agenda" }), { status: 403, headers: jsonHeaders });
          }
        }
      }
    }

    // --- JSON Actions ---
    if (action === "get_config") {
      const { data: cfg } = await supabase
        .from("payment_gateway_config")
        .select("config")
        .eq("gateway", "booking")
        .maybeSingle();
      const cfgData = cfg?.config as any;
      return new Response(JSON.stringify({ config: cfgData || null, default_user_id: cfgData?.default_user_id || "" }), { headers: jsonHeaders });
    }

    if (action === "get_users") {
      const result = await callBitrix(ep, accessToken, "user.get", { filter: { ACTIVE: true }, start: 0 });
      const users = (result.result || []).map((u: any) => ({
        id: u.ID,
        name: `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim(),
        position: u.WORK_POSITION || "",
        photo: u.PERSONAL_PHOTO || "",
      }));
      return new Response(JSON.stringify({ users }), { headers: jsonHeaders });
    }

    if (action === "get_availability") {
      const userId = url.searchParams.get("user_id") || body.user_id;
      const monthStr = url.searchParams.get("month") || body.month; // YYYY-MM
      if (!userId || !monthStr) {
        return new Response(JSON.stringify({ error: "user_id and month required" }), { status: 400, headers: jsonHeaders });
      }

      // Get config
      const { data: cfgRow } = await supabase
        .from("payment_gateway_config")
        .select("config")
        .eq("gateway", "booking")
        .maybeSingle();
      const cfg = (cfgRow?.config as any) || {
        work_start: "09:00", work_end: "18:00", weekdays: [1, 2, 3, 4, 5],
        duration_minutes: 30, buffer_minutes: 15,
      };

      const [year, month] = monthStr.split("-").map(Number);
      const from = `${monthStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to = `${monthStr}-${lastDay}`;

      // Get accessibility (busy blocks)
      const accessibilityResult = await callBitrix(ep, accessToken, "calendar.accessibility.get", {
        users: [userId],
        from,
        to,
      });

      const busyBlocks = accessibilityResult?.result?.[userId] || [];

      // Calculate free slots per day
      const days: Record<string, string[]> = {};
      const [sh, sm] = cfg.work_start.split(":").map(Number);
      const [eh, em] = cfg.work_end.split(":").map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const step = cfg.duration_minutes + cfg.buffer_minutes;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month - 1, d);
        if (date < today) continue;
        const dow = date.getDay();
        if (!cfg.weekdays.includes(dow)) continue;

        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const slots: string[] = [];
        let current = startMin;

        while (current + cfg.duration_minutes <= endMin) {
          const slotStart = new Date(year, month - 1, d, Math.floor(current / 60), current % 60);
          const slotEnd = new Date(slotStart.getTime() + cfg.duration_minutes * 60000);

          // Check if slot is in the past
          if (slotStart.getTime() < Date.now()) {
            current += step;
            continue;
          }

          // Check collision with busy blocks
          const isBusy = busyBlocks.some((block: any) => {
            const bStart = new Date(block.from || block.DATE_FROM).getTime();
            const bEnd = new Date(block.to || block.DATE_TO).getTime();
            return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
          });

          if (!isBusy) {
            const h = Math.floor(current / 60);
            const m = current % 60;
            slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
          }
          current += step;
        }

        if (slots.length > 0) {
          days[dateStr] = slots;
        }
      }

      return new Response(JSON.stringify({
        days,
        config: {
          duration_minutes: cfg.duration_minutes,
          meeting_type: cfg.meeting_type || "both",
          event_title_template: cfg.event_title_template || "Reunião — {cliente}",
          send_meeting_link: cfg.send_meeting_link ?? true,
        },
      }), { headers: jsonHeaders });
    }

    if (action === "create_event") {
      const data = body;
      const { user_id, date, time, title, description, meeting_type, entity_type, entity_id } = data;
      if (!user_id || !date || !time) {
        return new Response(JSON.stringify({ error: "user_id, date and time required" }), { status: 400, headers: jsonHeaders });
      }

      // Get config for duration
      const { data: cfgRow } = await supabase
        .from("payment_gateway_config")
        .select("config")
        .eq("gateway", "booking")
        .maybeSingle();
      const cfg = (cfgRow?.config as any) || { duration_minutes: 30, send_meeting_link: true };
      const duration = cfg.duration_minutes || 30;

      const fromDt = `${date} ${time}:00`;
      const [th, tm] = time.split(":").map(Number);
      const endMinutes = th * 60 + tm + duration;
      const toH = Math.floor(endMinutes / 60);
      const toM = endMinutes % 60;
      const toDt = `${date} ${String(toH).padStart(2, "0")}:${String(toM).padStart(2, "0")}:00`;

      // Build CRM fields link
      const crmFields: string[] = [];
      if (entity_type && entity_id) {
        const prefix = entity_type === "deal" ? "D" : entity_type === "lead" ? "L" : entity_type === "contact" ? "C" : "";
        if (prefix) crmFields.push(`${prefix}_${entity_id}`);
      }

      const eventParams: Record<string, any> = {
        type: "user",
        ownerId: user_id,
        name: title || "Reunião",
        from: fromDt,
        to: toDt,
        description: description || "Agendado via Emmely Agenda",
        accessibility: "busy",
        is_meeting: "Y",
        attendees: [user_id],
        host: user_id,
      };

      if (crmFields.length > 0) {
        eventParams.crm_fields = crmFields;
      }

      // Online meeting
      const isOnline = meeting_type === "online";
      if (isOnline && cfg.send_meeting_link) {
        eventParams.meeting = {
          HOST_NAME: title || "Reunião",
          NOTIFY: true,
          MEETING_CREATOR: user_id,
        };
      }

      const result = await callBitrix(ep, accessToken, "calendar.event.add", eventParams);

      if (result.error) {
        console.error("[BOOKING] calendar.event.add error:", result.error, result.error_description);
        return new Response(JSON.stringify({ error: result.error_description || result.error }), { status: 400, headers: jsonHeaders });
      }

      const eventId = result.result;
      let meetingLink = "";
      if (isOnline && integration.domain) {
        meetingLink = `https://${integration.domain}/online/${eventId}`;
      }

      return new Response(JSON.stringify({
        success: true,
        event_id: eventId,
        meeting_link: meetingLink,
        from: fromDt,
        to: toDt,
      }), { headers: jsonHeaders });
    }

    // --- Default: Render HTML calendar UI ---
    const entityType = body.PLACEMENT_OPTIONS?.ENTITY_TYPE_ID?.toLowerCase()
      || body.PLACEMENT_OPTIONS?.entityTypeId?.toLowerCase()
      || "";
    const entityId = body.PLACEMENT_OPTIONS?.ENTITY_ID || body.PLACEMENT_OPTIONS?.entityId || "";
    const contactName = body.PLACEMENT_OPTIONS?.ENTITY_TITLE || body.PLACEMENT_OPTIONS?.entityTitle || "";
    const mid = memberId || integration.member_id;

    const html = renderCalendarHTML(url.origin, mid, entityType, entityId, contactName);
    return new Response(html, { headers: htmlHeaders });

  } catch (e) {
    console.error("[BOOKING TAB] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
  }
});

function renderCalendarHTML(baseUrl: string, memberId: string, entityType: string, entityId: string, contactName: string): string {
  const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bitrix24-booking-tab`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Emmely Agenda</title>
<style>
:root {
  --bg: #ffffff; --fg: #1a1a2e; --muted: #64748b; --border: #e2e8f0;
  --primary: #4f46e5; --primary-fg: #ffffff; --primary-light: #eef2ff;
  --success: #10b981; --success-light: #d1fae5;
  --card: #ffffff; --card-hover: #f8fafc;
}
@media(prefers-color-scheme:dark){
  :root {
    --bg: #0f172a; --fg: #e2e8f0; --muted: #94a3b8; --border: #334155;
    --primary: #818cf8; --primary-fg: #0f172a; --primary-light: #1e1b4b;
    --success: #34d399; --success-light: #064e3b;
    --card: #1e293b; --card-hover: #334155;
  }
}
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--fg); padding:16px; }
.header { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
.header h1 { font-size:18px; font-weight:700; }
.header .badge { background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; }

/* User selector */
.user-select { margin-bottom:16px; }
.user-select select { width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--fg); font-size:14px; }

/* Calendar */
.cal-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.cal-nav button { background:none; border:1px solid var(--border); border-radius:6px; padding:6px 12px; cursor:pointer; color:var(--fg); font-size:13px; }
.cal-nav button:hover { background:var(--card-hover); }
.cal-nav .month-label { font-size:15px; font-weight:600; }

.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; margin-bottom:16px; }
.cal-header { text-align:center; font-size:11px; font-weight:600; color:var(--muted); padding:4px; text-transform:uppercase; }
.cal-day { text-align:center; padding:8px 4px; border-radius:8px; font-size:13px; cursor:default; position:relative; }
.cal-day.empty { }
.cal-day.available { cursor:pointer; background:var(--success-light); color:var(--success); font-weight:600; }
.cal-day.available:hover { outline:2px solid var(--primary); }
.cal-day.selected { background:var(--primary); color:var(--primary-fg); font-weight:700; }
.cal-day.past { color:var(--muted); opacity:0.4; }
.cal-day .dot { position:absolute; bottom:2px; left:50%; transform:translateX(-50%); width:4px; height:4px; border-radius:50%; background:var(--success); }

/* Slots */
.slots-panel { border:1px solid var(--border); border-radius:12px; padding:16px; background:var(--card); margin-bottom:16px; }
.slots-panel h3 { font-size:14px; font-weight:600; margin-bottom:12px; }
.slots-grid { display:flex; flex-wrap:wrap; gap:8px; }
.slot-btn { padding:8px 16px; border:1px solid var(--border); border-radius:8px; background:var(--card); cursor:pointer; font-size:13px; font-weight:500; color:var(--fg); transition:all .15s; }
.slot-btn:hover { border-color:var(--primary); background:var(--primary-light); }
.slot-btn.active { background:var(--primary); color:var(--primary-fg); border-color:var(--primary); }

/* Form */
.booking-form { border:1px solid var(--border); border-radius:12px; padding:16px; background:var(--card); }
.booking-form h3 { font-size:14px; font-weight:600; margin-bottom:12px; }
.form-row { margin-bottom:12px; }
.form-row label { display:block; font-size:12px; font-weight:500; color:var(--muted); margin-bottom:4px; }
.form-row input, .form-row select, .form-row textarea { width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--fg); font-size:13px; }
.form-row textarea { resize:vertical; min-height:60px; }

.btn-primary { width:100%; padding:10px; border:none; border-radius:8px; background:var(--primary); color:var(--primary-fg); font-size:14px; font-weight:600; cursor:pointer; transition:opacity .15s; }
.btn-primary:hover { opacity:0.9; }
.btn-primary:disabled { opacity:0.5; cursor:not-allowed; }

/* Success */
.success-card { border:1px solid var(--success); border-radius:12px; padding:20px; background:var(--success-light); text-align:center; }
.success-card h3 { color:var(--success); font-size:16px; margin-bottom:8px; }
.success-card p { font-size:13px; color:var(--fg); margin-bottom:4px; }
.success-card a { color:var(--primary); text-decoration:none; font-weight:500; }

.loading { text-align:center; padding:40px; color:var(--muted); font-size:13px; }
.error-msg { color:#ef4444; font-size:12px; margin-top:4px; }
</style>
</head>
<body>
<div class="header">
  <h1>📅 Emmely Agenda</h1>
  <span class="badge">Agendamento</span>
</div>

<div class="user-select">
  <select id="userSelect" onchange="onUserChange()">
    <option value="">Selecione o responsável...</option>
  </select>
</div>

<div id="calendarSection" style="display:none">
  <div class="cal-nav">
    <button onclick="changeMonth(-1)">← Anterior</button>
    <span class="month-label" id="monthLabel"></span>
    <button onclick="changeMonth(1)">Próximo →</button>
  </div>
  <div class="cal-grid" id="calGrid"></div>
</div>

<div id="slotsPanel" style="display:none" class="slots-panel">
  <h3>Horários disponíveis — <span id="selectedDateLabel"></span></h3>
  <div class="slots-grid" id="slotsGrid"></div>
</div>

<div id="bookingForm" style="display:none" class="booking-form">
  <h3>Confirmar Agendamento</h3>
  <div class="form-row">
    <label>Título</label>
    <input type="text" id="eventTitle" />
  </div>
  <div class="form-row">
    <label>Tipo de reunião</label>
    <select id="meetingType">
      <option value="presencial">Presencial</option>
      <option value="online">Online</option>
    </select>
  </div>
  <div class="form-row">
    <label>Descrição (opcional)</label>
    <textarea id="eventDesc"></textarea>
  </div>
  <button class="btn-primary" id="bookBtn" onclick="createBooking()">Agendar</button>
  <div id="bookError" class="error-msg" style="display:none"></div>
</div>

<div id="successCard" style="display:none" class="success-card"></div>
<div id="loadingIndicator" style="display:none" class="loading">A carregar...</div>

<script>
const API = '${fnUrl}';
const MEMBER_ID = '${memberId}';
const ENTITY_TYPE = '${entityType}';
const ENTITY_ID = '${entityId}';
const CONTACT_NAME = '${contactName}';

let currentYear, currentMonth;
let availability = {};
let bookingConfig = {};
let selectedDate = null;
let selectedTime = null;

const now = new Date();
currentYear = now.getFullYear();
currentMonth = now.getMonth() + 1;

// Init
loadUsersAndConfig();

async function loadUsersAndConfig() {
  await loadUsers();
  // Pre-select default user from config
  try {
    const cfgData = await apiCall('get_config');
    const defaultUserId = cfgData?.default_user_id || (cfgData?.config?.default_user_id) || '';
    if (defaultUserId) {
      const sel = document.getElementById('userSelect');
      if (sel && sel.querySelector('option[value="' + defaultUserId + '"]')) {
        sel.value = defaultUserId;
        onUserChange();
      }
    }
  } catch(e) { console.warn('Config load error', e); }
}

async function apiCall(action, params = {}) {
  const qp = new URLSearchParams({ action, member_id: MEMBER_ID, ...params });
  const res = await fetch(API + '?' + qp.toString());
  return await res.json();
}

async function apiPost(action, body) {
  const qp = new URLSearchParams({ action, member_id: MEMBER_ID });
  const res = await fetch(API + '?' + qp.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function loadUsers() {
  const data = await apiCall('get_users');
  const sel = document.getElementById('userSelect');
  (data.users || []).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name + (u.position ? ' — ' + u.position : '');
    sel.appendChild(opt);
  });
}

function onUserChange() {
  const userId = document.getElementById('userSelect').value;
  if (!userId) {
    document.getElementById('calendarSection').style.display = 'none';
    return;
  }
  document.getElementById('calendarSection').style.display = 'block';
  document.getElementById('slotsPanel').style.display = 'none';
  document.getElementById('bookingForm').style.display = 'none';
  document.getElementById('successCard').style.display = 'none';
  loadAvailability();
}

async function loadAvailability() {
  const userId = document.getElementById('userSelect').value;
  if (!userId) return;
  
  document.getElementById('loadingIndicator').style.display = 'block';
  const monthStr = currentYear + '-' + String(currentMonth).padStart(2, '0');
  const data = await apiCall('get_availability', { user_id: userId, month: monthStr });
  document.getElementById('loadingIndicator').style.display = 'none';
  
  availability = data.days || {};
  bookingConfig = data.config || {};
  renderCalendar();
}

function renderCalendar() {
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('monthLabel').textContent = months[currentMonth - 1] + ' ' + currentYear;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // Headers
  ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(currentYear, currentMonth - 1, 1);
  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7; // Monday-based
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Empty cells
  for (let i = 1; i < startDow; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = currentYear + '-' + String(currentMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const date = new Date(currentYear, currentMonth - 1, d);
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;

    if (date < today) {
      el.classList.add('past');
    } else if (availability[dateStr] && availability[dateStr].length > 0) {
      el.classList.add('available');
      const dot = document.createElement('div');
      dot.className = 'dot';
      el.appendChild(dot);
      el.onclick = () => selectDate(dateStr);
    }

    if (dateStr === selectedDate) el.classList.add('selected');
    grid.appendChild(el);
  }
}

function selectDate(dateStr) {
  selectedDate = dateStr;
  selectedTime = null;
  renderCalendar();

  const slots = availability[dateStr] || [];
  const panel = document.getElementById('slotsPanel');
  const slotsGrid = document.getElementById('slotsGrid');
  
  const parts = dateStr.split('-');
  document.getElementById('selectedDateLabel').textContent = parts[2] + '/' + parts[1] + '/' + parts[0];

  slotsGrid.innerHTML = '';
  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.textContent = slot;
    btn.onclick = () => selectSlot(slot);
    slotsGrid.appendChild(btn);
  });

  panel.style.display = 'block';
  document.getElementById('bookingForm').style.display = 'none';
  document.getElementById('successCard').style.display = 'none';
}

function selectSlot(time) {
  selectedTime = time;
  
  // Highlight active slot
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.slot-btn').forEach(b => {
    if (b.textContent === time) b.classList.add('active');
  });

  // Show booking form
  const form = document.getElementById('bookingForm');
  form.style.display = 'block';

  // Set default title
  const template = bookingConfig.event_title_template || 'Reunião — {cliente}';
  document.getElementById('eventTitle').value = template.replace('{cliente}', CONTACT_NAME || 'Cliente');

  // Set meeting type options based on config
  const mtSel = document.getElementById('meetingType');
  if (bookingConfig.meeting_type === 'presencial') {
    mtSel.innerHTML = '<option value="presencial">Presencial</option>';
  } else if (bookingConfig.meeting_type === 'online') {
    mtSel.innerHTML = '<option value="online">Online</option>';
  } else {
    mtSel.innerHTML = '<option value="presencial">Presencial</option><option value="online">Online</option>';
  }

  document.getElementById('bookError').style.display = 'none';
}

async function createBooking() {
  const btn = document.getElementById('bookBtn');
  btn.disabled = true;
  btn.textContent = 'A agendar...';
  document.getElementById('bookError').style.display = 'none';

  try {
    const result = await apiPost('create_event', {
      user_id: document.getElementById('userSelect').value,
      date: selectedDate,
      time: selectedTime,
      title: document.getElementById('eventTitle').value,
      description: document.getElementById('eventDesc').value,
      meeting_type: document.getElementById('meetingType').value,
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID,
      member_id: MEMBER_ID,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    // Success
    document.getElementById('slotsPanel').style.display = 'none';
    document.getElementById('bookingForm').style.display = 'none';

    const card = document.getElementById('successCard');
    let html = '<h3>✅ Agendamento Confirmado!</h3>';
    html += '<p><strong>' + document.getElementById('eventTitle').value + '</strong></p>';
    html += '<p>📅 ' + selectedDate.split('-').reverse().join('/') + ' às ' + selectedTime + '</p>';
    html += '<p>⏱ Duração: ' + (bookingConfig.duration_minutes || 30) + ' min</p>';
    if (result.meeting_link) {
      html += '<p>🔗 <a href="' + result.meeting_link + '" target="_blank">Abrir reunião online</a></p>';
    }
    card.innerHTML = html;
    card.style.display = 'block';

    // Remove slot from availability
    if (availability[selectedDate]) {
      availability[selectedDate] = availability[selectedDate].filter(s => s !== selectedTime);
      renderCalendar();
    }

  } catch (err) {
    const errEl = document.getElementById('bookError');
    errEl.textContent = err.message || 'Erro ao criar agendamento';
    errEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = 'Agendar';
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  selectedDate = null;
  selectedTime = null;
  document.getElementById('slotsPanel').style.display = 'none';
  document.getElementById('bookingForm').style.display = 'none';
  document.getElementById('successCard').style.display = 'none';
  loadAvailability();
}
</script>
</body>
</html>`;
}
