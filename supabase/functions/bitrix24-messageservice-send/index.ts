// Handler for messageservice.sender.add — Bitrix24 calls this when a user
// sends a message from the CRM "Message" tab via the "Emmely Messages" provider.
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

    await supabase.from("bitrix24_debug_logs").insert({
      integration_id: integration?.id || null,
      event_type: "messageservice_send",
      direction: "inbound",
      payload: { event, messageTo, messageBody: messageBody?.slice(0, 200), messageId, memberId },
    }).catch(() => {});

    // For OnSendMessage event: forward to internal message-send.
    if (event === "OnSendMessage" || event === "ONSENDMESSAGE" || messageTo) {
      try {
        const forwardRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/message-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            phone: String(messageTo).replace(/\D/g, ""),
            message: messageBody,
            channel: "whatsapp",
            message_type: "text",
            source: "bitrix24_messageservice",
          }),
        });
        const fwdJson = await forwardRes.json().catch(() => ({}));
        console.log("[MS-SEND] forwarded to message-send:", forwardRes.status, JSON.stringify(fwdJson).slice(0, 200));
      } catch (fwdErr) {
        console.error("[MS-SEND] forward failed:", fwdErr);
      }
    }

    // Acknowledge in the format Bitrix24 expects.
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
