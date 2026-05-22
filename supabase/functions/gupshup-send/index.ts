import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GUPSHUP_URL = "https://api.gupshup.io/wa/api/v1/msg";

interface SendBody {
  to: string;                 // E.164 sem +, ex: "351912345678"
  content?: string;
  message_type?: "text" | "image" | "video" | "audio" | "document" | "sticker" | "template";
  media_url?: string;
  filename?: string;
  template?: { id: string; params?: string[] };
}

async function getCreds(supabase: any) {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_key, credential_value")
    .eq("provider", "gupshup");
  const map: Record<string, string> = {};
  (data || []).forEach((c: any) => { if (c.credential_key) map[c.credential_key] = (c.credential_value || "").trim(); });
  return {
    apiKey: map.GUPSHUP_API_KEY || "",
    appName: map.GUPSHUP_APP_NAME || "",
    source: map.GUPSHUP_SOURCE_NUMBER || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json() as SendBody;
    if (!body.to) {
      return new Response(JSON.stringify({ error: "Missing 'to'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { apiKey, appName, source } = await getCreds(supabase);
    if (!apiKey || !appName || !source) {
      return new Response(JSON.stringify({ error: "Credenciais Gupshup não configuradas (GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_SOURCE_NUMBER)." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const destination = body.to.replace(/[^0-9]/g, "");
    const mtype = body.message_type || "text";
    let messageObj: any;

    if (mtype === "template" && body.template) {
      messageObj = { id: body.template.id, params: body.template.params || [] };
    } else if (mtype === "image") {
      messageObj = { type: "image", originalUrl: body.media_url, previewUrl: body.media_url, caption: body.content || "" };
    } else if (mtype === "video") {
      messageObj = { type: "video", url: body.media_url, caption: body.content || "" };
    } else if (mtype === "audio") {
      messageObj = { type: "audio", url: body.media_url };
    } else if (mtype === "document") {
      messageObj = { type: "file", url: body.media_url, filename: body.filename || "documento", caption: body.content || "" };
    } else if (mtype === "sticker") {
      messageObj = { type: "sticker", url: body.media_url };
    } else {
      messageObj = { type: "text", text: body.content || "" };
    }

    const form = new URLSearchParams();
    form.set("channel", "whatsapp");
    form.set("source", source);
    form.set("destination", destination);
    form.set("src.name", appName);
    form.set(mtype === "template" ? "template" : "message", JSON.stringify(messageObj));

    const res = await fetch(GUPSHUP_URL, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok || result.status === "error") {
      console.error("[GUPSHUP-SEND] error", res.status, result);
      return new Response(JSON.stringify({ error: "Falha ao enviar via Gupshup", status: res.status, details: result }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message_id: result.messageId || null, raw: result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GUPSHUP-SEND] exception", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
