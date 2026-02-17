import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CALLBELL_API = "https://api.callbell.eu/v1";
const INSTAGRAM_GRAPH_API = "https://graph.instagram.com/v22.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, content } = await req.json();
    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: "conversation_id and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get conversation details
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: conv, error: convError } = await serviceSupabase
      .from("conversations")
      .select("channel, contact_phone, contact_instagram, contact_email")
      .eq("id", conversation_id)
      .single();

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let externalMessageId: string | null = null;

    if (conv.channel === "instagram") {
      // ── Instagram: send via Meta Graph API ──
      const IG_ACCESS_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN");
      const IG_ACCOUNT_ID = Deno.env.get("META_IG_ACCOUNT_ID");

      if (!IG_ACCESS_TOKEN || !IG_ACCOUNT_ID) {
        return new Response(JSON.stringify({ error: "Instagram API credentials not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const recipientId = conv.contact_instagram;
      if (!recipientId) {
        return new Response(JSON.stringify({ error: "No Instagram contact identifier" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("DEBUG instagram-send to:", recipientId, "account:", IG_ACCOUNT_ID);

      const igResponse = await fetch(
        `${INSTAGRAM_GRAPH_API}/${IG_ACCOUNT_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${IG_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: content },
          }),
        }
      );

      const igResult = await igResponse.json();
      console.log("DEBUG instagram-send response:", igResponse.status, JSON.stringify(igResult));

      if (!igResponse.ok) {
        console.error("Instagram API error:", JSON.stringify(igResult));
        return new Response(JSON.stringify({ error: "Failed to send Instagram message", details: igResult }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      externalMessageId = igResult.message_id ?? null;

    } else if (conv.channel === "whatsapp") {
      // ── WhatsApp: send via Callbell API ──
      const CALLBELL_TOKEN = Deno.env.get("CALLBELL_API_TOKEN");
      if (!CALLBELL_TOKEN) {
        return new Response(JSON.stringify({ error: "CALLBELL_API_TOKEN not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const channelUuid = Deno.env.get("CALLBELL_WA_CHANNEL_UUID");
      if (!channelUuid) {
        return new Response(JSON.stringify({ error: "CALLBELL_WA_CHANNEL_UUID not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const to = conv.contact_phone;
      if (!to) {
        return new Response(JSON.stringify({ error: "No phone number for WhatsApp contact" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cbBody = {
        to,
        from: "whatsapp",
        type: "text",
        content: { text: content },
        channel_uuid: channelUuid,
      };

      console.log("DEBUG callbell-send request body:", JSON.stringify(cbBody));

      const cbResponse = await fetch(`${CALLBELL_API}/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CALLBELL_TOKEN}`,
        },
        body: JSON.stringify(cbBody),
      });

      const cbResult = await cbResponse.json();
      console.log("DEBUG callbell-send response:", cbResponse.status, JSON.stringify(cbResult));

      if (!cbResponse.ok) {
        console.error("Callbell API error:", JSON.stringify(cbResult));
        return new Response(JSON.stringify({ error: "Failed to send message via Callbell", details: cbResult }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      externalMessageId = cbResult.message?.uuid ?? null;

    } else {
      // ── Other channels: direct DB insert ──
    }

    // Store outbound message
    await serviceSupabase.from("messages").insert({
      conversation_id,
      direction: "outbound",
      content,
      sender_name: "Atendente",
      external_id: externalMessageId,
      delivery_status: "sent",
    });

    // Update conversation preview
    await serviceSupabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
      })
      .eq("id", conversation_id);

    return new Response(JSON.stringify({ success: true, message_id: externalMessageId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
