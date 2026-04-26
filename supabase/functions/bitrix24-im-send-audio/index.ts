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

function htmlPage(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Enviar Áudio (WhatsApp)</title>
<script src="//api.bitrix24.com/api/v1/"></script>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 12px; margin:0; background:#fff; color:#222; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  button { border:0; border-radius:8px; padding:10px 14px; font-weight:600; cursor:pointer; }
  .rec { background:#e53935; color:white; }
  .stop { background:#444; color:white; }
  .send { background:#2e7d32; color:white; }
  .ghost { background:#eee; color:#333; }
  button[disabled] { opacity:0.5; cursor:not-allowed; }
  audio { width:100%; margin-top:8px; }
  .status { font-size:12px; color:#666; margin-top:6px; min-height:16px; }
  .err { color:#c62828; }
</style>
</head>
<body>
  <div class="row">
    <button id="btnRec" class="rec">● Gravar</button>
    <button id="btnStop" class="stop" disabled>■ Parar</button>
    <button id="btnSend" class="send" disabled>Enviar áudio</button>
    <button id="btnReset" class="ghost" disabled>Descartar</button>
  </div>
  <audio id="player" controls style="display:none"></audio>
  <div id="status" class="status">Aguardando...</div>

<script>
let mediaRecorder = null;
let chunks = [];
let blob = null;
let placementInfo = null;

const $ = (id) => document.getElementById(id);
const setStatus = (t, isErr=false) => { const s=$("status"); s.textContent=t; s.className="status"+(isErr?" err":""); };

function init() {
  try {
    if (typeof BX24 !== "undefined") {
      BX24.init(() => {
        try { placementInfo = BX24.placement.info(); } catch(e) { placementInfo = null; }
        BX24.fitWindow();
        setStatus("Pronto. Clique em Gravar.");
      });
    } else {
      setStatus("BX24 indisponível (modo dev).");
    }
  } catch(e) { setStatus("Erro init: "+e.message, true); }
}

$("btnRec").onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "audio/webm";
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const p = $("player"); p.src = url; p.style.display = "block";
      $("btnSend").disabled = false; $("btnReset").disabled = false;
      stream.getTracks().forEach(t => t.stop());
      setStatus("Gravação pronta. Reveja e clique em Enviar.");
    };
    mediaRecorder.start();
    $("btnRec").disabled = true; $("btnStop").disabled = false;
    setStatus("Gravando...");
  } catch(e) { setStatus("Microfone negado: "+e.message, true); }
};

$("btnStop").onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  $("btnRec").disabled = false; $("btnStop").disabled = true;
};

$("btnReset").onclick = () => {
  blob = null;
  $("player").src = ""; $("player").style.display = "none";
  $("btnSend").disabled = true; $("btnReset").disabled = true;
  setStatus("Descartado.");
};

$("btnSend").onclick = async () => {
  if (!blob) return;
  $("btnSend").disabled = true;
  setStatus("Enviando...");
  try {
    const dialogId = (placementInfo && placementInfo.options && (placementInfo.options.DIALOG_ID || placementInfo.options.dialogId)) || "";
    const fd = new FormData();
    fd.append("file", blob, "audio.ogg");
    fd.append("dialog_id", String(dialogId));
    fd.append("mime", blob.type || "audio/ogg");
    const res = await fetch(window.location.pathname, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Falha no envio");
    setStatus("Áudio enviado para o WhatsApp ✔");
    blob = null; $("player").src=""; $("player").style.display="none"; $("btnReset").disabled=true;
    setTimeout(() => { try { BX24.closeApplication(); } catch(_) {} }, 800);
  } catch(e) {
    setStatus("Erro: "+e.message, true);
    $("btnSend").disabled = false;
  }
};

init();
</script>
</body>
</html>`;
}

async function resolveConversation(supabase: any, dialogId: string) {
  // dialogId looks like "chat1807"
  const numeric = String(dialogId).replace(/\D+/g, "");
  if (!numeric) return null;
  const { data } = await supabase
    .from("conversations")
    .select("id, contact_phone, channel, bitrix_chat_id")
    .eq("bitrix_chat_id", numeric)
    .maybeSingle();
  return data || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Bitrix loads the iframe via POST (form). Serve the page if Content-Type is form-urlencoded
  // and there is no `file` field; only treat as upload when multipart.
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
      const mime = String(form.get("mime") || "audio/ogg");
      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "file missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!dialogId) {
        return new Response(JSON.stringify({ error: "dialog_id missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
      const conv = await resolveConversation(supabase, dialogId);
      if (!conv) {
        return new Response(JSON.stringify({ error: "conversation not found for dialog " + dialogId }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Upload to media bucket
      const ext = mime.includes("ogg") ? "ogg" : (mime.includes("webm") ? "webm" : "bin");
      const path = `bitrix-audio/${conv.id}/${Date.now()}.${ext}`;
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

      // Forward to message-send (existing pipeline → WUZAPI / WhatsApp)
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
