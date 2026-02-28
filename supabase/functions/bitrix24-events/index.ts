import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse PHP-style nested form data (Bitrix24 sends data[MESSAGES][0][message][text] etc.)
// Numeric keys are correctly reconstructed as arrays (not objects with numeric string keys)
function parsePhpStyleBody(bodyText: string): Record<string, any> {
  if (!bodyText) return {};
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};

  function setNestedValue(obj: any, parts: string[], value: string) {
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const nextKey = parts[i + 1];
      const nextIsNumeric = /^\d+$/.test(nextKey);
      if (obj[key] === undefined || obj[key] === null) {
        obj[key] = nextIsNumeric ? [] : {};
      }
      obj = obj[key];
    }
    const lastKey = parts[parts.length - 1];
    if (Array.isArray(obj)) {
      obj[parseInt(lastKey, 10)] = value;
    } else {
      obj[lastKey] = value;
    }
  }

  for (const [key, value] of params.entries()) {
    const parts = key.match(/([^\[\]]+)/g);
    if (parts && parts.length > 1) {
      // Check if root key needs array (next key is numeric)
      if (/^\d+$/.test(parts[1]) && !Array.isArray(data[parts[0]])) {
        data[parts[0]] = data[parts[0]] ? Object.values(data[parts[0]]) : [];
      }
      setNestedValue(data, parts, value);
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

// Extrair member_id de múltiplas localizações possíveis no payload do Bitrix24
function extractMemberId(data: Record<string, any>): string | null {
  // Ordem de prioridade baseada no thothai
  return (
    data.auth?.member_id ||
    data.auth?.MEMBER_ID ||
    data.member_id ||
    data.MEMBER_ID ||
    data.data?.auth?.member_id ||
    data.data?.PARAMS?.member_id ||
    null
  );
}

const SUPPORTED_EVENTS = [
  "ONIMCONNECTORMESSAGEADD",
  "ONIMCONNECTORDIALOGSTART",
  "ONIMCONNECTORDIALOGFINISH",
  "ONIMCONNECTORSTATUSDELETE",
  "ONIMBOTMESSAGEADD",
  "ONIMBOTJOINOPEN",
  "ONIMBOTWELCOMEMESSAGE",
  "ONIMBOTJOINCHAT",   // Open Lines join event
  "ONCRMDEALUPDATE",   // Deal update — auto-charge on close
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    const event = (data.event || data.EVENT || "").toUpperCase();
    const memberId = extractMemberId(data);

    // Log completo para debugging
    console.log("[EVENTS] Event:", event, "| member_id:", memberId);
    console.log("[EVENTS] Full payload:", JSON.stringify(data).substring(0, 1000));

    // Sempre responder "successfully" imediatamente (< 200ms)
    if (!event) {
      console.log("[EVENTS] No event in payload, ignoring");
      return new Response("successfully", {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (!memberId) {
      console.error("[EVENTS] No member_id found! payload keys:", Object.keys(data).join(", "));
      // Mesmo sem member_id, enfileirar — o worker irá tentar encontrar a integração pelo payload
    }

    // Enfileirar eventos suportados
    if (SUPPORTED_EVENTS.includes(event)) {
      const { error: insertError } = await supabase.from("bitrix_event_queue").insert({
        event_type: event,
        member_id: memberId,  // pode ser null — o worker também tenta pelo domain/payload
        payload: data,
        status: "pending",
      });

      if (insertError) {
        console.error("[EVENTS] Queue insert error:", insertError);
      } else {
        console.log("[EVENTS] Queued:", event, "member:", memberId);

        // Fire-and-forget: trigger worker
        fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ trigger: "event", event_type: event }),
        }).catch((e) => console.error("[EVENTS] Worker trigger error:", e));
      }
    } else {
      console.log("[EVENTS] Unsupported event, ignoring:", event);
    }

    return new Response("successfully", {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("[EVENTS] Error:", error);
    return new Response("successfully", {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
