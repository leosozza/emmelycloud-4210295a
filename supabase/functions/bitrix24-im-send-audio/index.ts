// Edge Function: bitrix24-im-send-audio
// Iframe handler for the IM_TEXTAREA placement. Lets a Bitrix24 operator
// record an audio message inside the Open Channel chat and forward it to
// WhatsApp (Gupshup / WUZAPI / Meta) via the existing `message-send` pipeline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  detectMimeFromBytes,
  remuxWebmOpusToOgg,
} from "../_shared/audio-remux.ts";

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

  /* Painel de logs por envio */
  .logs {
    margin-top: 12px; padding: 10px 12px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    font-size: 12px; display: none;
  }
  .logs.visible { display: block; }
  .logs h4 {
    margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .03em;
    text-transform: uppercase; color: var(--muted);
    display: flex; align-items: center; justify-content: space-between;
  }
  .logs ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  .logs li {
    display: grid; grid-template-columns: 16px 1fr auto; gap: 8px; align-items: start;
    padding: 4px 0; line-height: 1.35;
  }
  .logs li .ic { font-size: 13px; line-height: 1; padding-top: 1px; }
  .logs li .name { color: var(--text); font-weight: 500; }
  .logs li .name .detail { display: block; color: var(--muted); font-weight: 400; font-size: 11px; word-break: break-word; }
  .logs li .ms { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 11px; }
  .logs li.ok .ic { color: var(--success); }
  .logs li.fail .ic { color: var(--danger); }
  .logs li.skip .ic { color: var(--muted); }
  .logs li.pending .ic { color: var(--primary); }
  .logs .clear-btn {
    background: transparent; border: 0; padding: 0; cursor: pointer;
    color: var(--muted); font-size: 11px; font-weight: 500;
  }
  .logs .clear-btn:hover { color: var(--text); }
</style>
</head>
<body>
  <div class="wrap">
    <div id="stage" class="stage"></div>
    <div id="status" class="status"></div>
    <div id="logs" class="logs" aria-live="polite">
      <h4><span>Etapas do envio</span><button class="clear-btn" id="clearLogs" type="button">Limpar</button></h4>
      <ul id="logsList"></ul>
    </div>
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
const logsEl = document.getElementById("logs");
const logsList = document.getElementById("logsList");
const setStatus = (t, kind = "") => { statusEl.textContent = t || ""; statusEl.className = "status " + kind; };

const STEP_ICON = { ok: "✓", fail: "✕", skip: "–", pending: "…" };
function setSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) { logsEl.classList.remove("visible"); return; }
  logsEl.classList.add("visible");
  logsList.innerHTML = steps.map(s => {
    const kind = s.status || "pending";
    const ms = (typeof s.ms === "number") ? (s.ms + " ms") : "";
    const detail = s.detail ? '<span class="detail">' + String(s.detail).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c])) + '</span>' : "";
    return '<li class="' + kind + '"><span class="ic">' + (STEP_ICON[kind] || "•") + '</span>' +
           '<span class="name">' + (s.step || "etapa") + detail + '</span>' +
           '<span class="ms">' + ms + '</span></li>';
  }).join("");
  fit();
}
document.getElementById("clearLogs").onclick = () => { setSteps([]); };

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
  // Mostra etapas em "pending" antes mesmo da resposta para feedback imediato.
  setSteps([
    { step: "Enviar para servidor", status: "pending" },
    { step: "Upload no storage", status: "pending" },
    { step: "Envio ao WhatsApp", status: "pending" },
    { step: "Postar no chat Bitrix24", status: "pending" },
  ]);
  const tClient = Date.now();
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let res, json;
    try {
      res = await fetch(ENDPOINT, { method: "POST", body: fd, signal: controller.signal });
      json = await res.json().catch(() => ({}));
    } finally {
      clearTimeout(timeoutId);
    }

    // Servidor devolve etapas detalhadas no campo "steps". Acrescentamos a
    // etapa do POST (round-trip do cliente) e, abaixo, a etapa do Bitrix.
    const serverSteps = Array.isArray(json && json.steps) ? json.steps : [];
    const allSteps = [
      { step: "Enviar para servidor", status: res && res.ok ? "ok" : "fail", detail: "HTTP " + (res ? res.status : "?"), ms: Date.now() - tClient },
      ...serverSteps,
    ];
    setSteps(allSteps);

    if (!res.ok || !json || json.ok !== true) {
      const detail = json && (json.error || (json.detail && (json.detail.error || json.detail.message)));
      throw new Error(detail || ("Falha no envio (HTTP " + (res ? res.status : "?") + ")"));
    }

    // Posta o áudio no chat do Open Channel via BX24 SDK.
    const tBx = Date.now();
    let bxStep = { step: "Postar no chat Bitrix24", status: "skip", detail: "BX24 indisponível" };
    try {
      if (typeof BX24 !== "undefined" && json.mediaUrl && dialogId) {
        const bxResult = await new Promise((resolve) => {
          BX24.callMethod("im.message.add", {
            DIALOG_ID: dialogId,
            MESSAGE: "[B]🎤 Áudio enviado pelo atendente[/B]\\n[URL=" + json.mediaUrl + "]Ouvir áudio[/URL]",
            ATTACH: [{
              DESCRIPTION: "Áudio enviado ao WhatsApp",
              LINK: { NAME: "Ouvir áudio (.ogg)", LINK: json.mediaUrl }
            }],
          }, (r) => resolve(r));
        });
        const err = bxResult && bxResult.error && bxResult.error();
        if (err) {
          bxStep = { step: "Postar no chat Bitrix24", status: "fail", detail: (err.ex && err.ex.error_description) || err.ex || String(err), ms: Date.now() - tBx };
        } else {
          const msgId = bxResult && bxResult.data && bxResult.data();
          bxStep = { step: "Postar no chat Bitrix24", status: "ok", detail: msgId ? ("msg id " + msgId) : "publicado", ms: Date.now() - tBx };
        }
      }
    } catch (e) {
      bxStep = { step: "Postar no chat Bitrix24", status: "fail", detail: (e && e.message) || String(e), ms: Date.now() - tBx };
    }
    setSteps([...allSteps, bxStep]);

    setStatus(bxStep.status === "ok" ? "Áudio enviado e publicado no chat ✔" : "Áudio enviado, mas falhou ao postar no chat do Bitrix", bxStep.status === "ok" ? "ok" : "err");
    blob = null;
    // Mantém o painel aberto se houve falha parcial; só fecha em sucesso pleno.
    if (bxStep.status === "ok") {
      setTimeout(() => { try { BX24.closeApplication(); } catch(_) { renderIdle(); } }, 1400);
    } else {
      renderIdle();
    }
  } catch (e) {
    const msg = (e && e.name === "AbortError")
      ? "Tempo esgotado ao enviar o áudio. Tente novamente."
      : ("Erro: " + (e && e.message ? e.message : e));
    setStatus(msg, "err");
    if (blob) renderPreview(URL.createObjectURL(blob));
    else renderIdle();
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

function parsePlacementForm(bodyText: string) {
  const body: Record<string, any> = {};
  const params = new URLSearchParams(bodyText || "");
  for (const [key, value] of params.entries()) body[key] = value;
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
  return { body, placementOptions };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const contentType = req.headers.get("content-type") || "";

  if (req.method === "GET") {
    return new Response(htmlPage(), {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (req.method === "POST" && contentType.includes("application/x-www-form-urlencoded")) {
    const { body, placementOptions } = parsePlacementForm(await req.text());
    console.log("[IM-AUDIO] placement open", { memberId: body.member_id || body.MEMBER_ID || null, placementOptions });
    return new Response(htmlPage(placementOptions, { member_id: body.member_id || body.MEMBER_ID || null }), {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (req.method === "POST" && contentType.includes("multipart/form-data")) {
    const steps: Array<{ step: string; status: "ok" | "fail" | "skip"; detail?: string; ms?: number }> = [];
    const t0 = Date.now();
    const mark = (step: string, status: "ok" | "fail" | "skip", detail?: string, started?: number) => {
      steps.push({ step, status, detail, ms: started != null ? Date.now() - started : undefined });
    };
    const respond = (ok: boolean, payload: Record<string, any>, httpStatus = 200) =>
      new Response(JSON.stringify({ ok, steps, ...payload }), {
        status: httpStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    try {
      const tParse = Date.now();
      const form = await req.formData();
      const file = form.get("file");
      const dialogId = String(form.get("dialog_id") || "");
      const chatId = String(form.get("chat_id") || "");
      const mime = String(form.get("mime") || "audio/ogg");

      console.log("[IM-AUDIO] upload", { dialogId, chatId, mime, hasFile: file instanceof File, size: file instanceof File ? file.size : 0 });

      if (!(file instanceof File)) {
        mark("Receber áudio", "fail", "Arquivo ausente no formulário", tParse);
        return respond(false, { error: "file missing" }, 400);
      }
      if (!dialogId && !chatId) {
        mark("Receber áudio", "fail", "dialog_id/chat_id ausentes", tParse);
        return respond(false, { error: "dialog_id/chat_id missing" }, 400);
      }
      mark("Receber áudio", "ok", `${(file.size / 1024).toFixed(1)} KB · ${mime}`, tParse);

      const tConv = Date.now();
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
      const conv = await resolveConversation(supabase, dialogId, chatId);
      if (!conv) {
        console.warn("[IM-AUDIO] conversation not found", { dialogId, chatId });
        mark("Vincular conversa", "fail", `Sem conversa para chat ${dialogId || chatId}`, tConv);
        return respond(false, { error: "Conversa não vinculada para esse chat (" + (dialogId || chatId) + "). Abra o chat pelo painel Emmely." }, 404);
      }
      mark("Vincular conversa", "ok", `${conv.channel} · ${conv.contact_phone || conv.id.slice(0, 8)}`, tConv);

      const rawBuf = new Uint8Array(await file.arrayBuffer());
      let detectedMime = detectMimeFromBytes(rawBuf, mime.split(";")[0] || "audio/webm");
      let finalBuf = rawBuf;
      let finalMime = detectedMime;
      let finalExt = "bin";

      const tRemux = Date.now();
      if (detectedMime === "audio/webm") {
        const ogg = remuxWebmOpusToOgg(rawBuf);
        if (ogg) {
          finalBuf = ogg;
          finalMime = "audio/ogg";
          console.log("[IM-AUDIO] remuxed WebM/Opus to Ogg/Opus", { from: rawBuf.length, to: ogg.length });
          mark("Converter para Ogg/Opus", "ok", `${rawBuf.length} → ${ogg.length} bytes`, tRemux);
        } else {
          console.warn("[IM-AUDIO] WebM/Opus remux failed; provider will likely reject the file");
          mark("Converter para Ogg/Opus", "fail", "Remux falhou; provedor pode rejeitar", tRemux);
        }
      } else {
        mark("Converter para Ogg/Opus", "skip", `Já em ${detectedMime}`);
      }

      finalExt = finalMime === "audio/ogg" ? "ogg"
        : finalMime === "audio/mpeg" ? "mp3"
        : finalMime === "audio/mp4" ? "m4a"
        : finalMime === "audio/wav" ? "wav"
        : finalMime === "audio/webm" ? "webm"
        : "bin";

      const tUpload = Date.now();
      const path = `bitrix-audio/${conv.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${finalExt}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, finalBuf, {
        contentType: finalMime, upsert: false,
      });
      if (upErr) {
        console.error("[IM-AUDIO] upload error", upErr);
        mark("Upload no storage", "fail", upErr.message, tUpload);
        return respond(false, { error: "upload failed: " + upErr.message }, 500);
      }
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const mediaUrl = `${pub.publicUrl}?v=${Date.now()}`;
      console.log("[IM-AUDIO] uploaded", { convId: conv.id, channel: conv.channel, path, mediaUrl, finalMime, bytes: finalBuf.length });
      mark("Upload no storage", "ok", `${finalBuf.length} bytes · ${finalMime}`, tUpload);

      const tSend = Date.now();
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/message-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({
          conversation_id: conv.id,
          content: "",
          message_type: "audio",
          sender_name: "Atendente",
          force_ptt: true,
          resolvedInteractiveData: { url: mediaUrl, filename: `audio.${finalExt}`, mime: finalMime },
        }),
      });
      const sendJson = await sendRes.json().catch(() => ({} as any));

      const providerOk = sendRes.ok && sendJson && sendJson.success !== false && !sendJson.error;
      if (!providerOk) {
        console.error("[IM-AUDIO] message-send failed", { status: sendRes.status, sendJson });
        const reason = (sendJson && (sendJson.error || sendJson.message)) || `HTTP ${sendRes.status}`;
        mark("Envio ao WhatsApp", "fail", String(reason), tSend);
        return respond(false, {
          error: reason,
          detail: sendJson,
        }, 502);
      }
      mark("Envio ao WhatsApp", "ok", sendJson?.message_id ? `id ${String(sendJson.message_id).slice(0, 18)}…` : "confirmado pelo provedor", tSend);

      return respond(true, {
        mediaUrl,
        conversationId: conv.id,
        externalMessageId: sendJson?.message_id ?? null,
        totalMs: Date.now() - t0,
      });
    } catch (e) {
      console.error("[IM-AUDIO] error", e);
      mark("Erro inesperado", "fail", String(e?.message || e));
      return respond(false, { error: String(e?.message || e) }, 500);
    }
  }

  return new Response(htmlPage(), { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
});
