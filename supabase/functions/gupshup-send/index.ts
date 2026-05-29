// Gupshup WhatsApp Send — alinhado a https://docs.gupshup.io/reference/msg
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GUPSHUP_URL = "https://api.gupshup.io/wa/api/v1/msg";

type MessageType =
  | "text" | "image" | "video" | "audio" | "document" | "sticker"
  | "template" | "list" | "quick_reply" | "location" | "contact" | "reaction";

interface SendBody {
  to: string;                        // E.164 sem +, ex: "351912345678"
  content?: string;
  message_type?: MessageType;
  media_url?: string;
  preview_url?: string;              // imagem: thumbnail
  filename?: string;                 // documento
  caption?: string;                  // override de legenda
  disable_preview?: boolean;         // text: desativa link preview
  // interactive / location / contact / reaction
  interactive?: any;                 // objeto pronto (list/quick_reply)
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contact?: any;                     // objeto pronto conforme docs
  reaction?: { msgid: string; emoji: string };
  template?: { id: string; params?: string[] };
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
  };
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

    case "template":
      return {
        messageObj: { id: body.template!.id, params: body.template!.params || [] },
        isTemplate: true,
      };

    default:
      return { messageObj: { type: "text", text: body.content || "" }, isTemplate: false };
  }
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
  if (t === "template" && !body.template?.id) return "'template.id' obrigatório";
  return null;
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

    const { apiKey, appName, source } = await getCreds(supabase);
    if (!apiKey || !appName || !source) {
      return new Response(JSON.stringify({
        error: "Credenciais Gupshup não configuradas (GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_SOURCE_NUMBER).",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const destination = body.to.replace(/[^0-9]/g, "");
    if (!destination) {
      return new Response(JSON.stringify({ error: "'to' inválido (precisa de dígitos E.164 sem +)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const res = await fetch(GUPSHUP_URL, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const rawText = await res.text();
    let result: any = {};
    try { result = JSON.parse(rawText); } catch { result = { raw: rawText }; }

    // Per Gupshup docs, qualquer 2XX é aceite — checar status === "submitted"
    const submitted = res.ok && result?.status === "submitted";
    if (!submitted) {
      console.error("[GUPSHUP-SEND] error", res.status, result);

      let enrichedError = "Falha ao enviar via Gupshup";
      let diagnosticHint = undefined;

      const isInvalidAppDetails = 
        result?.message === "Invalid App Details" || 
        result?.gupshup?.message === "Invalid App Details" ||
        rawText.includes("Invalid App Details");

      if (isInvalidAppDetails) {
        enrichedError = "Falha ao enviar via Gupshup: App Name ou Source Number inválido/divergente";
        diagnosticHint = "O Gupshup retornou o erro 'Invalid App Details'. Isso indica que a combinação do 'App Name' e do 'Source Number' configurada em Integrações -> Gupshup não corresponde exatamente à aplicação associada à sua API Key no console do Gupshup. Certifique-se também de que não há espaços extras ou letras maiúsculas/minúsculas divergentes.";
      } else if (res.status === 401) {
        enrichedError = "Falha ao enviar via Gupshup: API Key inválida ou expirada";
        diagnosticHint = "O Gupshup recusou a autenticação (401 Unauthorized). Verifique se a sua GUPSHUP_API_KEY está correta na aba de Integrações.";
      }

      return new Response(JSON.stringify({
        error: enrichedError,
        http_status: res.status,
        gupshup: result,
        ...(diagnosticHint ? { hint: diagnosticHint } : {}),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
