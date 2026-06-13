// Edge Function: bitrix24-im-send-audio
// Iframe handler for the IM_TEXTAREA placement. Lets a Bitrix24 operator
// record an audio message inside the Open Channel chat and forward it to
// WhatsApp via WUZAPI using the existing `message-send` pipeline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  // Allow embedding inside Bitrix24 portals
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

function htmlPage(initialPlacementOptions: Record<string, any> = {}, initialMeta: Record<string, any> = {}): string {
  const endpoint = `${SUPABASE_URL}/functions/v1/bitrix24-im-send-audio`;
  const initialPayload = { options: initialPlacementOptions, meta: initialMeta };
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Enviar áudio</title>
<script src="//api.bitrix24.com/api/v1/"></script>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --surface: #f8fafc;
    --border: #e5e7eb;
    --text: #0f172a;
    --muted: #64748b;
    --primary: #2563eb;
    --primary-hover: #1d4ed8;
    --danger: #ef4444;
    --danger-soft: #fee2e2;
    --success: #16a34a;
    --shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    padding: 20px 18px;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 380px; margin: 0 auto; }
  .stage {
    display: flex; flex-direction: column; align-items: center; gap: 14px;
    padding: 18px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow);
    animation: fadein .18s ease;
  }
  @keyframes fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .label { font-size: 13px; color: var(--muted); font-weight: 500; text-align: center; }
  .row { display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; width: 100%; }
  button {
    border: 0; border-radius: 999px; padding: 10px 18px; font-weight: 600; font-size: 14px;
    cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    transition: transform .08s ease, background .15s ease, opacity .15s ease;
    font-family: inherit;
  }
  button:active { transform: scale(0.97); }
  button[disabled] { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: var(--primary); color: #fff; }
  .btn-primary:hover:not([disabled]) { background: var(--primary-hover); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover:not([disabled]) { color: var(--text); }
  .btn-success { background: var(--success); color: #fff; }
  .mic-btn {
    width: 72px; height: 72px; border-radius: 50%; padding: 0;
    background: var(--primary); color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 18px rgba(37, 99, 235, .35);
  }
  .mic-btn:hover:not([disabled]) { background: var(--primary-hover); }
  .mic-btn svg { width: 30px; height: 30px; }
  .pulse {
    width: 14px; height: 14px; border-radius: 50%; background: var(--danger);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, .7);
    animation: pulse 1.4s infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, .55); }
    70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  .timer { font-variant-numeric: tabular-nums; font-size: 17px; font-weight: 600; color: var(--text); }
  audio { width: 100%; height: 40px; }
  .status { font-size: 12px; color: var(--muted); min-height: 16px; text-align: center; }
  .status.err { color: var(--danger); }
  .status.ok { color: var(--success); }
  .spinner {
    width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff;
    border-radius: 50%; animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="wrap">
    <div id="stage" class="stage"></div>
    <div id="status" class="status"></div>
  </div>

<script>
const ENDPOINT = ${JSON.stringify(endpoint)};
const INITIAL_PLACEMENT = ${JSON.stringify(initialPayload)};
let mediaRecorder = null;
let chunks = [];
let blob = null;
let stream = null;
let placementInfo = null;
let timerInterval = null;
let elapsedSec = 0;

const stage = document.getElementById("stage");
const statusEl = document.getElementById("status");
const setStatus = (t, kind = "") => { statusEl.textContent = t || ""; statusEl.className = "status " + kind; };

const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>';
const ICON_STOP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
const ICON_SEND = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
const ICON_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

function fit() { try { BX24.fitWindow(); } catch(_) {} }
function fmtTime(s) { const m = Math.floor(s/60), r = s%60; return m + ":" + String(r).padStart(2,"0"); }

function renderIdle() {
  stage.innerHTML = '<button id="recBtn" class="mic-btn" title="Gravar áudio">' + ICON_MIC + '</button>' +
    '<div class="label">Toque para gravar uma mensagem de voz</div>';
  document.getElementById("recBtn").onclick = startRecording;
  fit();
}
function renderRecording() {
  stage.innerHTML =
    '<div class="row"><span class="pulse"></span><span class="timer" id="timer">0:00</span></div>' +
    '<div class="label">Gravando…</div>' +
    '<div class="row">' +
      '<button id="cancelBtn" class="btn-ghost">' + ICON_X + ' Cancelar</button>' +
      '<button id="stopBtn" class="btn-danger">' + ICON_STOP + ' Parar</button>' +
    '</div>';
  document.getElementById("cancelBtn").onclick = cancelRecording;
  document.getElementById("stopBtn").onclick = stopRecording;
  fit();
}
function renderPreview(url) {
  stage.innerHTML =
    '<audio controls src="' + url + '"></audio>' +
    '<div class="row">' +
      '<button id="discardBtn" class="btn-ghost">' + ICON_X + ' Descartar</button>' +
      '<button id="sendBtn" class="btn-success">' + ICON_SEND + ' Enviar áudio</button>' +
    '</div>';
  document.getElementById("discardBtn").onclick = () => { blob = null; renderIdle(); setStatus(""); };
  document.getElementById("sendBtn").onclick = sendBlob;
  fit();
}
function renderSending() {
  stage.innerHTML =
    '<div class="row"><div class="spinner" style="border-color: rgba(37,99,235,.2); border-top-color: var(--primary);"></div></div>' +
    '<div class="label">Enviando para o WhatsApp…</div>';
  fit();
}

async function startRecording() {
  setStatus("");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
      ? "audio/ogg;codecs=opus"
      : (MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm");
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      try { stream && stream.getTracks().forEach(t => t.stop()); } catch(_) {}
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      renderPreview(url);
    };
    mediaRecorder.start();
    elapsedSec = 0;
    renderRecording();
    const t = document.getElementById("timer");
    timerInterval = setInterval(() => { elapsedSec += 1; if (t) t.textContent = fmtTime(elapsedSec); }, 1000);
  } catch (e) {
    setStatus("Não foi possível acessar o microfone: " + (e && e.message ? e.message : e), "err");
    renderIdle();
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}
function cancelRecording() {
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = () => { try { stream && stream.getTracks().forEach(t => t.stop()); } catch(_) {} };
      mediaRecorder.stop();
    }
  } catch(_) {}
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  blob = null; chunks = [];
  renderIdle();
}

async function sendBlob() {
  if (!blob) return;
  renderSending();
  setStatus("");
  try {
    const opts = (placementInfo && placementInfo.options) || {};
    const dialogId = String(opts.DIALOG_ID || opts.dialogId || opts.CHAT_ID || opts.chatId || "");
    const chatId = String(opts.CHAT_ID || opts.chatId || "");
    if (!dialogId && !chatId) throw new Error("Chat não identificado pelo Bitrix");

    const fd = new FormData();
    const ext = (blob.type || "").includes("ogg") ? "ogg" : "webm";
    fd.append("file", blob, "audio." + ext);
    fd.append("dialog_id", dialogId);
    fd.append("chat_id", chatId);
    fd.append("mime", blob.type || ("audio/" + ext));

    const res = await fetch(ENDPOINT, { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || ("Falha (HTTP " + res.status + ")"));

    setStatus("Áudio enviado ✔", "ok");
    blob = null;
    setTimeout(() => { try { BX24.closeApplication(); } catch(_) { renderIdle(); } }, 700);
  } catch (e) {
    setStatus("Erro: " + (e && e.message ? e.message : e), "err");
    renderPreview(URL.createObjectURL(blob));
  }
}

function init() {
  try {
    if (typeof BX24 !== "undefined") {
      BX24.init(() => {
        try { placementInfo = BX24.placement.info(); } catch(_) { placementInfo = null; }
        if (!placementInfo || !placementInfo.options || Object.keys(placementInfo.options).length === 0) placementInfo = INITIAL_PLACEMENT;
        renderIdle();
      });
    } else {
      placementInfo = INITIAL_PLACEMENT;
      renderIdle();
    }
  } catch (e) {
    setStatus("Erro init: " + e.message, "err");
    renderIdle();
  }
}
init();
</script>
</body>
</html>`;
}

async function resolveConversation(supabase: any, dialogId: string, chatId: string) {
  const candidates = new Set<string>();
  for (const v of [dialogId, chatId]) {
    const num = String(v || "").replace(/\D+/g, "");
    if (num) candidates.add(num);
  }
  for (const num of candidates) {
    const { data } = await supabase
      .from("conversations")
      .select("id, contact_phone, channel, bitrix_chat_id")
      .eq("bitrix_chat_id", num)
      .maybeSingle();
    if (data) {
      console.log("[IM-AUDIO] resolved conversation", { num, convId: data.id, phone: data.contact_phone });
      return data;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const contentType = req.headers.get("content-type") || "";

  if (req.method === "GET" || (req.method === "POST" && contentType.includes("application/x-www-form-urlencoded"))) {
    return new Response(htmlPage(), {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (req.method === "POST" && contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("file");
      const dialogId = String(form.get("dialog_id") || "");
      const chatId = String(form.get("chat_id") || "");
      const mime = String(form.get("mime") || "audio/ogg");

      console.log("[IM-AUDIO] upload", { dialogId, chatId, mime, hasFile: file instanceof File, size: file instanceof File ? file.size : 0 });

      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "file missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!dialogId && !chatId) {
        return new Response(JSON.stringify({ error: "dialog_id/chat_id missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
      const conv = await resolveConversation(supabase, dialogId, chatId);
      if (!conv) {
        console.warn("[IM-AUDIO] conversation not found", { dialogId, chatId });
        return new Response(JSON.stringify({ error: "Conversa não vinculada para esse chat (" + (dialogId || chatId) + "). Abra o chat pelo painel Emmely." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ext = mime.includes("ogg") ? "ogg" : (mime.includes("webm") ? "webm" : "bin");
      const path = `bitrix-audio/${conv.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage.from("media").upload(path, buf, {
        contentType: mime, upsert: false,
      });
      if (upErr) {
        console.error("[IM-AUDIO] upload error", upErr);
        return new Response(JSON.stringify({ error: "upload failed: " + upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const mediaUrl = pub.publicUrl;
      console.log("[IM-AUDIO] uploaded", { convId: conv.id, path, mediaUrl, bytes: buf.length });

      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/message-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({
          conversation_id: conv.id,
          content: "",
          message_type: "audio",
          resolvedInteractiveData: { url: mediaUrl, filename: `audio.${ext}`, mime },
        }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        console.error("[IM-AUDIO] message-send failed", sendRes.status, sendJson);
        return new Response(JSON.stringify({ error: "message-send failed", detail: sendJson }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ ok: true, mediaUrl, conversationId: conv.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[IM-AUDIO] error", e);
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  return new Response(htmlPage(), { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
});
