import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CALLBELL_API = "https://api.callbell.eu/v1";

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

    const { conversation_id, content, template_uuid, template_values } = await req.json();
    if (!conversation_id || (!content && !template_uuid)) {
      return new Response(JSON.stringify({ error: "conversation_id and either content or template_uuid required" }), {
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
      // ── Instagram: send via Callbell API ──
      const CALLBELL_TOKEN = Deno.env.get("CALLBELL_API_TOKEN");
      if (!CALLBELL_TOKEN) {
        return new Response(JSON.stringify({ error: "CALLBELL_API_TOKEN not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const channelUuid = Deno.env.get("CALLBELL_IG_CHANNEL_UUID");
      if (!channelUuid) {
        return new Response(JSON.stringify({ error: "CALLBELL_IG_CHANNEL_UUID not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const to = conv.contact_instagram;
      if (!to) {
        return new Response(JSON.stringify({ error: "No Instagram contact identifier" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("DEBUG callbell-send instagram to:", to, "channel:", channelUuid);

      const cbBody: Record<string, unknown> = {
        to,
        from: "whatsapp",
        channel_uuid: channelUuid,
      };

      // Support template-based messages
      if (template_uuid) {
        cbBody.type = "template";
        cbBody.content = {
          uuid: template_uuid,
          ...(template_values ? { values: template_values } : {}),
        };
      } else {
        cbBody.type = "text";
        cbBody.content = { text: content };
      }

      // Check if this is first contact - if conversation is new, include optin_contact
      const { count: msgCountNum } = await serviceSupabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversation_id);
      
      const isFirstContact = (msgCountNum === null || msgCountNum === 0);
      if (isFirstContact) {
        cbBody.optin_contact = true;
        console.log("DEBUG first contact, including optin_contact");
      }

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
      console.log("DEBUG callbell-send instagram response:", cbResponse.status, JSON.stringify(cbResult));

      if (!cbResponse.ok) {
        console.error("Callbell API error:", JSON.stringify(cbResult));
        return new Response(JSON.stringify({ error: "Failed to send Instagram message via Callbell", details: cbResult }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      externalMessageId = cbResult.message?.uuid ?? null;

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
    const messageContent = template_uuid 
      ? `[Template: ${template_uuid}]`
      : content;
    
    await serviceSupabase.from("messages").insert({
      conversation_id,
      direction: "outbound",
      content: messageContent,
      sender_name: "Atendente",
      external_id: externalMessageId,
      delivery_status: "sent",
    });

    // Update conversation preview
    await serviceSupabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageContent.slice(0, 100),
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
