// Handler for messageservice.sender.add — Bitrix24 calls this when a user
// sends a message from the CRM "Message" tab via the "Emmely Messages" provider.
//
// Sintaxe aceite no campo de mensagem do Bitrix:
//   template: nome_do_template
//   var1: João
//   var2: 15/01
// OU em linha única: "template: nome | var1 | var2 | var3"
// Sem "template:" → envia como texto livre (só funciona dentro da janela 24h).
//
// Reference: https://apidocs.bitrix24.com/api-reference/messageservice/index.html
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parsePhpStyleBody(bodyText: string): Record<string, any> {
  if (!bodyText) return {};
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    const parts = key.match(/([^\[\]]+)/g);
    if (parts && parts.length > 1) {
      let current: any = data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    } else {
      data[key] = value;
    }
  }
  return data;
}

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) {
    try { return JSON.parse(bodyText); } catch { return {}; }
  }
  return parsePhpStyleBody(bodyText);
}

type ParsedMessage =
  | { mode: "template"; templateName: string; variables: string[] }
  | { mode: "text"; text: string };

function parseEmmelyMessage(raw: string): ParsedMessage {
  const text = String(raw || "").trim();
  if (!text) return { mode: "text", text: "" };

  // Procurar "template:" (case-insensitive) em qualquer linha
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const templateLineIdx = lines.findIndex((l) => /^template\s*[:=]/i.test(l));

  if (templateLineIdx === -1) {
    return { mode: "text", text };
  }

  const templateLine = lines[templateLineIdx];
  // Capturar conteúdo após "template:" e separar por |
  const afterColon = templateLine.replace(/^template\s*[:=]\s*/i, "");
  const inlineParts = afterColon.split("|").map((p) => p.trim()).filter(Boolean);
  const templateName = (inlineParts.shift() || "").trim();

  // Variáveis: primeiro pegar as inline (após |), depois procurar varN: em outras linhas
  const variables: Array<{ idx: number; value: string }> = [];
  inlineParts.forEach((v, i) => variables.push({ idx: i + 1, value: v }));

  const varRegex = /^(?:var|v|\{\{)?\s*(\d+)\s*\}?\}?\s*[:=]\s*(.*)$/i;
  for (let i = 0; i < lines.length; i++) {
    if (i === templateLineIdx) continue;
    const m = lines[i].match(varRegex);
    if (m) {
      const idx = parseInt(m[1], 10);
      const value = m[2].trim();
      // substituir se já existe esse índice
      const existing = variables.findIndex((x) => x.idx === idx);
      if (existing >= 0) variables[existing] = { idx, value };
      else variables.push({ idx, value });
    }
  }

  variables.sort((a, b) => a.idx - b.idx);
  return {
    mode: "template",
    templateName,
    variables: variables.map((v) => v.value),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    console.log("[MS-SEND] payload:", JSON.stringify(data).slice(0, 500));

    const event = data.event || "";
    const memberId = data.auth?.member_id || data.member_id || "";
    const messageTo = data.MESSAGE_TO || data.message_to || data.TO || "";
    const messageBody = data.MESSAGE_BODY || data.message_body || data.BODY || "";
    const messageId = data.MESSAGE_ID || data.message_id || crypto.randomUUID();

    // Find integration
    let integration: any = null;
    if (memberId) {
      const { data: row } = await supabase
        .from("bitrix24_integrations").select("*").eq("member_id", memberId).maybeSingle();
      integration = row;
    }

    const parsed = parseEmmelyMessage(messageBody);
    const phone = String(messageTo).replace(/\D/g, "");

    await supabase.from("bitrix24_debug_logs").insert({
      integration_id: integration?.id || null,
      event_type: "messageservice_send",
      direction: "inbound",
      payload: {
        event,
        messageTo,
        phone,
        messageId,
        memberId,
        parsed,
        bodyPreview: String(messageBody).slice(0, 200),
      },
    }).catch(() => {});

    // Send only when we have a phone target
    let forwardResult: any = null;
    let forwardStatus = 0;
    let forwardOk = false;

    if (phone && (parsed.mode === "template" ? !!parsed.templateName : !!parsed.text)) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const sendBody: Record<string, any> =
          parsed.mode === "template"
            ? {
                phone,
                channel: "whatsapp",
                message_type: "template",
                content: "", // texto fallback (Gupshup ignora em template)
                interactive_data: {
                  name: parsed.templateName,
                  id: parsed.templateName,
                  params: parsed.variables,
                },
                source: "bitrix24_messageservice",
              }
            : {
                phone,
                message: parsed.text,
                content: parsed.text,
                channel: "whatsapp",
                message_type: "text",
                source: "bitrix24_messageservice",
              };

        const forwardRes = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(sendBody),
        });
        forwardStatus = forwardRes.status;
        forwardResult = await forwardRes.json().catch(() => ({}));
        forwardOk = forwardRes.ok && !forwardResult?.error;
        console.log("[MS-SEND] forwarded:", forwardStatus, JSON.stringify(forwardResult).slice(0, 300));
      } catch (fwdErr) {
        console.error("[MS-SEND] forward failed:", fwdErr);
        forwardResult = { error: String(fwdErr) };
      }

      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration?.id || null,
        event_type: "messageservice_send_result",
        direction: "outbound",
        payload: { status: forwardStatus, ok: forwardOk, result: forwardResult },
      }).catch(() => {});
    }

    // Respond to Bitrix24
    if (!phone) {
      return new Response(JSON.stringify({
        result: { STATUS: "error", EXTERNAL_ID: messageId, ERROR: "Sem número de telefone (MESSAGE_TO)" },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!forwardOk) {
      const errMsg = parsed.mode === "template"
        ? `Falha no template '${(parsed as any).templateName}'. ${forwardResult?.error || forwardResult?.details?.error || "verifique se está aprovado"}`
        : `Falha ao enviar. ${forwardResult?.error || "tente novamente ou use sintaxe template: nome | var1 | var2"}`;
      return new Response(JSON.stringify({
        result: { STATUS: "error", EXTERNAL_ID: messageId, ERROR: errMsg },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      result: { STATUS: "delivered", EXTERNAL_ID: messageId },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[MS-SEND] error:", err);
    return new Response(JSON.stringify({
      result: { STATUS: "error", ERROR: String(err) },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
