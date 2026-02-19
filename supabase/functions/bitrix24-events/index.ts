import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse PHP-style nested form data (Bitrix24 sends data[MESSAGES][0][message][text] etc.)
function parsePhpStyleBody(bodyText: string): Record<string, any> {
  if (!bodyText) return {};
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};

  for (const [key, value] of params.entries()) {
    const parts = key.match(/([^\[\]]+)/g);
    if (parts && parts.length > 1) {
      let current = data;
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

const SUPPORTED_EVENTS = [
  "ONIMCONNECTORMESSAGEADD",
  "ONIMBOTMESSAGEADD",
  "ONIMBOTJOINOPEN",
  "ONIMBOTWELCOMEMESSAGE",
  "ONIMCONNECTORSTATUSDELETE",
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

    const event = (data.event || "").toUpperCase();
    const memberId = data.auth?.member_id || data.member_id || null;

    console.log("[EVENTS] Received event:", event, "member:", memberId);

    // Quick validation
    if (!event || !memberId) {
      return new Response("successfully", {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Only enqueue supported events
    if (SUPPORTED_EVENTS.includes(event)) {
      // Insert into queue - fire and forget style (don't await errors)
      const { error: insertError } = await supabase.from("bitrix_event_queue").insert({
        event_type: event,
        member_id: memberId,
        payload: data,
        status: "pending",
      });

      if (insertError) {
        console.error("[EVENTS] Queue insert error:", insertError);
      } else {
        console.log("[EVENTS] Event queued:", event);

        // Fire-and-forget: trigger the worker
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

    // Always return "successfully" fast (< 200ms)
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
