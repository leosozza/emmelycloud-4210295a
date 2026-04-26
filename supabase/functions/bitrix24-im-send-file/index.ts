// Edge Function: bitrix24-im-send-file
// Iframe handler for the IM_TEXTAREA placement. Allows a Bitrix24 operator
// to upload a file (image, PDF, document, video) inside the Open Channel
// chat and forward it to WhatsApp via WUZAPI through `message-send`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

function htmlPage(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Enviar Arquivo (WhatsApp)</title>
<script src="//api.bitrix24.com/api/v1/"></script>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 12px; margin:0; background:#fff; color:#222; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  input[type=file] { padding:6px; }
  textarea { width:100%; min-height:48px; box-sizing:border-box; padding:6px; border:1px solid #ddd; border-radius:6px; margin-top:8px; }
  button { border:0; border-radius:8px; padding:10px 14px; font-weight:600; cursor:pointer; }
  .send { background:#1565c0; color:white; }
  button[disabled] { opacity:0.5; cursor:not-allowed; }
  .status { font-size:12px; color:#666; margin-top:6px; min-height:16px; }
  .err { color:#c62828; }
  .info { color:#888; font-size:11px; }
</style>
</head>
<body>
  <div class="row">
    <input id="file" type="file" accept="image/*,application/pdf,video/mp4,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" />
  </div>
  <textarea id="caption" placeholder="Legenda (opcional, apenas para imagens/vídeos)"></textarea>
  <div class="row" style="margin-top:8px;">
    <button id="btnSend" class="send" disabled>Enviar arquivo</button>
    <span id="info" class="info"></span>
  </div>
  <div id="status" class="status">Selecione um arquivo.</div>

<script>
let placementInfo = null;
const $ = (id) => document.getElementById(id);
const setStatus = (t, isErr=false) => { const s=$("status"); s.textContent=t; s.className="status"+(isErr?" err":""); };

function init() {
  try {
    if (typeof BX24 !== "undefined") {
      BX24.init(() => {
        try { placementInfo = BX24.placement.info(); } catch(e) { placementInfo = null; }
        BX24.fitWindow();
        setStatus("Selecione um arquivo.");
      });
    }
  } catch(e) { setStatus("Erro init: "+e.message, true); }
}

$("file").onchange = () => {
  const f = $("file").files[0];
  if (!f) { $("btnSend").disabled = true; $("info").textContent=""; return; }
  $("info").textContent = f.name + " — " + Math.round(f.size/1024) + " KB";
  $("btnSend").disabled = false;
};

$("btnSend").onclick = async () => {
  const f = $("file").files[0];
  if (!f) return;
  $("btnSend").disabled = true;
  setStatus("Enviando...");
  try {
    const dialogId = (placementInfo && placementInfo.options && (placementInfo.options.DIALOG_ID || placementInfo.options.dialogId)) || "";
    const fd = new FormData();
    fd.append("file", f, f.name);
    fd.append("dialog_id", String(dialogId));
    fd.append("mime", f.type || "application/octet-stream");
    fd.append("filename", f.name);
    fd.append("caption", $("caption").value || "");
    const res = await fetch(window.location.pathname, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Falha no envio");
    setStatus("Arquivo enviado para o WhatsApp ✔");
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
  const numeric = String(dialogId).replace(/\D+/g, "");
  if (!numeric) return null;
  const { data } = await supabase
    .from("conversations")
    .select("id, contact_phone, channel, bitrix_chat_id")
    .eq("bitrix_chat_id", numeric)
    .maybeSingle();
  return data || null;
}

function classifyMime(mime: string): "image" | "audio" | "video" | "document" {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "document";
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
      const mime = String(form.get("mime") || "application/octet-stream");
      const filename = String(form.get("filename") || "arquivo");
      const caption = String(form.get("caption") || "");
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

      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `bitrix-files/${conv.id}/${Date.now()}-${safeName}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage.from("media").upload(path, buf, {
        contentType: mime, upsert: false,
      });
      if (upErr) {
        console.error("[IM-FILE] upload error", upErr);
        return new Response(JSON.stringify({ error: "upload failed: " + upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const mediaUrl = pub.publicUrl;
      const msgType = classifyMime(mime);

      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/message-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({
          conversation_id: conv.id,
          content: msgType === "image" || msgType === "video" ? caption : (msgType === "document" ? filename : ""),
          message_type: msgType,
          resolvedInteractiveData: { url: mediaUrl, filename, mime },
        }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        return new Response(JSON.stringify({ error: "message-send failed", detail: sendJson }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ ok: true, mediaUrl, conversationId: conv.id, type: msgType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[IM-FILE] error", e);
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  return new Response(htmlPage(), { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
});
