// Gupshup WhatsApp Send — alinhado a https://docs.gupshup.io/reference/msg
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GUPSHUP_URL = "https://api.gupshup.io/wa/api/v1/msg";

type MessageType =
  | "text" | "image" | "video" | "audio" | "document" | "sticker"
  | "template" | "list" | "quick_reply" | "cta_url" | "location" | "contact" | "reaction";

interface SendBody {
  to: string;                        // E.164 sem +, ex: "351912345678"
  content?: string;
  message_type?: MessageType;
  media_url?: string;
  preview_url?: string;              // imagem: thumbnail
  filename?: string;                 // documento
  caption?: string;                  // override de legenda
  media_mime?: string;               // mídia: mime real do arquivo
  force_ptt?: boolean | string;       // áudio: enviar como nota de voz/PTT nativa
  disable_preview?: boolean;         // text: desativa link preview
  // interactive / location / contact / reaction
  interactive?: any;                 // objeto pronto (list/quick_reply/cta_url)
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contact?: any;                     // objeto pronto conforme docs
  reaction?: { msgid: string; emoji: string };
  template?: { id: string; params?: string[] };
  cta_url?: { url: string; display_text: string };
}

async function getCreds(supabase: any) {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_key, credential_value")
    .eq("provider", "gupshup");
  const map: Record<string, string> = {};
  (data || []).forEach((c: any) => {
    if (c.credential_key) map[c.credential_key] = (c.credential_value || "").trim();
  });
  return {
    apiKey: map.GUPSHUP_API_KEY || "",
    appName: map.GUPSHUP_APP_NAME || "",
    source: (map.GUPSHUP_SOURCE_NUMBER || "").replace(/[^0-9]/g, ""),
    appId: map.GUPSHUP_APP_ID || "",
  };
}

function normalizePhone(value: string) {
  return (value || "").replace(/[^0-9]/g, "");
}

function extractCanonicalAppDetails(payload: any) {
  const roots = [payload, payload?.app, payload?.profile, payload?.business, payload?.data].filter(Boolean);
  const appName = roots
    .map((item: any) => item?.name || item?.wabaName || item?.appName || item?.srcName)
    .find((value: any) => typeof value === "string" && value.trim())?.trim() || "";
  const source = normalizePhone(
    roots
      .map((item: any) => item?.phone || item?.phoneNumber || item?.source || item?.contactNumber)
      .find((value: any) => typeof value === "string" && value.trim()) || ""
  );
  return { appName, source };
}

async function fetchCanonicalAppDetails(apiKey: string, appId: string) {
  if (!apiKey || !appId) return null;
  const urls = [
    `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}`,
    `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/business/profile`,
    `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/business`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { apikey: apiKey, accept: "application/json" } });
      const rawText = await response.text();
      let payload: any = {};
      try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }
      if (!response.ok) continue;

      const canonical = extractCanonicalAppDetails(payload);
      if (canonical.appName || canonical.source) return canonical;
    } catch (error) {
      console.warn("[GUPSHUP-SEND] canonical app lookup failed", error);
    }
  }

  return null;
}

async function persistCanonicalCreds(supabase: any, canonical: { appName?: string; source?: string }) {
  const rows = [];
  if (canonical.appName) rows.push({ provider: "gupshup", credential_key: "GUPSHUP_APP_NAME", credential_value: canonical.appName });
  if (canonical.source) rows.push({ provider: "gupshup", credential_key: "GUPSHUP_SOURCE_NUMBER", credential_value: canonical.source });
  if (!rows.length) return;
  const { error } = await supabase.from("integration_credentials").upsert(rows, { onConflict: "provider,credential_key" });
  if (error) console.warn("[GUPSHUP-SEND] could not persist canonical Gupshup details", error.message);
}

function isInvalidAppDetails(result: any) {
  const rawMessage = String(result?.message || result?.error || result?.raw || "");
  return /invalid app details|portal user not found|apikey/i.test(rawMessage);
}

function buildMessageObject(body: SendBody): { messageObj: any; isTemplate: boolean } {
  const caption = body.caption ?? body.content ?? "";
  switch (body.message_type || "text") {
    case "text":
      return { messageObj: { type: "text", text: body.content || "" }, isTemplate: false };

    case "image":
      return {
        messageObj: {
          type: "image",
          originalUrl: body.media_url,
          previewUrl: body.preview_url || body.media_url,
          ...(caption ? { caption } : {}),
        },
        isTemplate: false,
      };

    case "video":
      return {
        messageObj: {
          type: "video",
          url: body.media_url,
          ...(caption ? { caption } : {}),
        },
        isTemplate: false,
      };

    case "audio":
      return { messageObj: { type: "audio", url: body.media_url }, isTemplate: false };

    case "document":
      // docs: file aceita apenas url e filename
      return {
        messageObj: {
          type: "file",
          url: body.media_url,
          filename: body.filename || "documento",
        },
        isTemplate: false,
      };

    case "sticker":
      return { messageObj: { type: "sticker", url: body.media_url }, isTemplate: false };

    case "location": {
      const l = body.location!;
      return {
        messageObj: {
          type: "location",
          longitude: l.longitude,
          latitude: l.latitude,
          ...(l.name ? { name: l.name } : {}),
          ...(l.address ? { address: l.address } : {}),
        },
        isTemplate: false,
      };
    }

    case "contact":
      return { messageObj: { type: "contact", contact: body.contact }, isTemplate: false };

    case "reaction":
      return {
        messageObj: {
          type: "reaction",
          msgid: body.reaction!.msgid,
          emoji: body.reaction!.emoji,
        },
        isTemplate: false,
      };

    case "list":
    case "quick_reply":
      // interactive: caller envia objeto completo conforme docs
      return { messageObj: body.interactive, isTemplate: false };

    case "cta_url": {
      const cta = body.cta_url || (body.interactive && body.interactive.cta_url) || null;
      const url = cta?.url || "";
      const display_text = cta?.display_text || "Abrir link";
      const bodyText = body.content || "";
      return {
        messageObj: {
          type: "cta_url",
          cta_url: { display_text, url },
          ...(bodyText ? { body: { text: bodyText } } : {}),
        },
        isTemplate: false,
      };
    }

    case "template":
      return {
        messageObj: { id: body.template!.id, params: body.template!.params || [] },
        isTemplate: true,
      };

    default:
      return { messageObj: { type: "text", text: body.content || "" }, isTemplate: false };
  }
}

function wantsPtt(body: SendBody) {
  return body.force_ptt === true || body.force_ptt === "true";
}

function validate(body: SendBody): string | null {
  if (!body.to) return "Missing 'to'";
  const t = body.message_type || "text";
  if (["image", "video", "audio", "document", "sticker"].includes(t) && !body.media_url) {
    return `'media_url' obrigatório para ${t}`;
  }
  if (t === "location" && (!body.location || body.location.latitude == null || body.location.longitude == null)) {
    return "'location' com latitude/longitude obrigatório";
  }
  if (t === "contact" && !body.contact) return "'contact' obrigatório";
  if (t === "reaction" && (!body.reaction?.msgid || !body.reaction?.emoji)) {
    return "'reaction.msgid' e 'reaction.emoji' obrigatórios";
  }
  if ((t === "list" || t === "quick_reply") && !body.interactive) {
    return "'interactive' obrigatório para list/quick_reply";
  }
  if (t === "cta_url") {
    const cta = body.cta_url || (body.interactive && body.interactive.cta_url);
    if (!cta?.url || !cta?.display_text) return "'cta_url.url' e 'cta_url.display_text' obrigatórios";
  }
  if (t === "template" && !body.template?.id) return "'template.id' obrigatório";
  return null;
}

function describeGupshupFailure(httpStatus: number, result: any) {
  const rawMessage = String(result?.message || result?.error || result?.raw || "");
  const invalidAppDetails = /invalid app details|portal user not found|apikey/i.test(rawMessage);

  if (invalidAppDetails) {
    return {
      error: "Credenciais Gupshup inválidas: confirme API Key, App Name e Source Number da mesma app Gupshup.",
      error_code: "GUPSHUP_INVALID_APP_DETAILS",
      hint: "No painel Gupshup, copie novamente a API Key da conta correta e confirme que o App Name é exatamente igual ao nome da app e que o Source Number pertence a essa app.",
      http_status: httpStatus,
      gupshup: result,
    };
  }

  return {
    error: "Falha ao enviar via Gupshup",
    error_code: "GUPSHUP_SEND_FAILED",
    http_status: httpStatus,
    gupshup: result,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = (await req.json()) as SendBody;

    const vErr = validate(body);
    if (vErr) {
      return new Response(JSON.stringify({ error: vErr }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { apiKey, appName, source, appId } = await getCreds(supabase);
    if (apiKey && appId && (!appName || !source)) {
      const bootstrapCanonical = await fetchCanonicalAppDetails(apiKey, appId);
      if (bootstrapCanonical?.appName || bootstrapCanonical?.source) {
        await persistCanonicalCreds(supabase, { appName: bootstrapCanonical.appName, source: bootstrapCanonical.source });
        appName = bootstrapCanonical.appName || appName;
        source = bootstrapCanonical.source || source;
      }
    }

    if (!apiKey || !appName || !source) {
      return new Response(JSON.stringify({
        error: "Credenciais Gupshup não configuradas (GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_SOURCE_NUMBER).",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const canonical = await fetchCanonicalAppDetails(apiKey, appId);
    if (canonical?.appName || canonical?.source) {
      const nextAppName = canonical.appName || appName;
      const nextSource = canonical.source || source;
      if (nextAppName !== appName || nextSource !== source) {
        console.log("[GUPSHUP-SEND] using canonical app details", {
          appNameChanged: nextAppName !== appName,
          sourceChanged: nextSource !== source,
        });
        await persistCanonicalCreds(supabase, { appName: canonical.appName, source: canonical.source });
        appName = nextAppName;
        source = nextSource;
      }
    }

    const destination = body.to.replace(/[^0-9]/g, "");
    if (!destination) {
      return new Response(JSON.stringify({ error: "'to' inválido (precisa de dígitos E.164 sem +)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((body.message_type || "text") === "audio" && wantsPtt(body)) {
      const audioMime = (body.media_mime || "audio/ogg; codecs=opus").replace(";codecs=", "; codecs=");
      // O endpoint público /wa/api/v1/msg renderiza como nota de voz (PTT)
      // automaticamente quando o ficheiro servido na URL é Ogg/Opus.
      if (!/audio\/ogg/i.test(audioMime)) {
        console.warn("[GUPSHUP-SEND] PTT requested but mime is not audio/ogg; WhatsApp may render as regular audio", { mime: audioMime });
      } else {
        console.log("[GUPSHUP-SEND] sending audio as PTT via standard /msg endpoint (Ogg/Opus)");
      }
    }


    const { messageObj, isTemplate } = buildMessageObject(body);

    const form = new URLSearchParams();
    form.set("channel", "whatsapp");
    form.set("source", source);
    form.set("destination", destination);
    form.set("src.name", appName);
    form.set(isTemplate ? "template" : "message", JSON.stringify(messageObj));
    if ((body.message_type || "text") === "text" && body.disable_preview) {
      form.set("disablePreview", "true");
    }

    const sendToGupshup = async () => {
      const res = await fetch(GUPSHUP_URL, {
        method: "POST",
        headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const rawText = await res.text();
      let result: any = {};
      try { result = JSON.parse(rawText); } catch { result = { raw: rawText }; }
      return { res, result };
    };

    let { res, result } = await sendToGupshup();

    if (!res.ok && isInvalidAppDetails(result) && !canonical && appId) {
      const lateCanonical = await fetchCanonicalAppDetails(apiKey, appId);
      if (lateCanonical?.appName || lateCanonical?.source) {
        appName = lateCanonical.appName || appName;
        source = lateCanonical.source || source;
        form.set("source", source);
        form.set("src.name", appName);
        await persistCanonicalCreds(supabase, { appName: lateCanonical.appName, source: lateCanonical.source });
        ({ res, result } = await sendToGupshup());
      }
    }

    // Per Gupshup docs, qualquer 2XX é aceite — checar status === "submitted"
    const submitted = res.ok && result?.status === "submitted";
    if (!submitted) {
      console.error("[GUPSHUP-SEND] error", res.status, result);
      return new Response(JSON.stringify(describeGupshupFailure(res.status, result)), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: result.messageId || null,
      raw: result,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[GUPSHUP-SEND] exception", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
