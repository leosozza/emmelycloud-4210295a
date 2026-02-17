import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    console.log("Callbell webhook payload:", JSON.stringify(body));

    // Callbell webhook sends events with a "payload" key
    // Event types: message_created, message_status_updated, contact_created, etc.
    const event = body.event;
    const payload = body.payload;

    if (!event || !payload) {
      return new Response(JSON.stringify({ success: true, skipped: "no event or payload" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only process incoming messages
    if (event !== "message_created") {
      return new Response(JSON.stringify({ success: true, skipped: event }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = payload.message || payload;
    const contact = payload.contact || {};

    // Skip outbound messages (sent by agent)
    if (message.direction === "out" || message.direction === "outbound") {
      return new Response(JSON.stringify({ success: true, skipped: "outbound" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageText = message.text || message.content?.text || "";
    if (!messageText) {
      return new Response(JSON.stringify({ success: true, skipped: "no text content" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine channel and contact identifier
    const channel = (message.channel || contact.channel || "webchat").toLowerCase();
    const contactPhone = contact.phone || contact.phone_number || null;
    const contactIg = contact.instagram_id || contact.identifier || null;
    const contactEmail = contact.email || null;
    const contactName = contact.name || contact.phone || contact.identifier || "Desconhecido";
    const contactAvatar = contact.profile_picture || contact.avatar_url || null;
    const externalId = message.uuid || message.id || null;
    const mediaUrl = message.attachments?.[0]?.url || null;
    const mediaType = message.attachments?.[0]?.type || null;

    const timestamp = message.created_at
      ? new Date(message.created_at).toISOString()
      : new Date().toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Map Callbell channel to our channel_type enum
    let dbChannel: string = channel;
    if (channel.includes("instagram")) dbChannel = "instagram";
    else if (channel.includes("whatsapp")) dbChannel = "whatsapp";
    else if (channel.includes("email")) dbChannel = "email";
    else dbChannel = "webchat";

    // Find contact identifier for lookup
    let lookupColumn: string | null = null;
    let lookupValue: string | null = null;

    if (dbChannel === "instagram" && contactIg) {
      lookupColumn = "contact_instagram";
      lookupValue = contactIg;
    } else if (dbChannel === "whatsapp" && contactPhone) {
      lookupColumn = "contact_phone";
      lookupValue = contactPhone;
    } else if (dbChannel === "email" && contactEmail) {
      lookupColumn = "contact_email";
      lookupValue = contactEmail;
    }

    let conversationId: string | null = null;

    // Try to find existing conversation
    if (lookupColumn && lookupValue) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel", dbChannel)
        .eq(lookupColumn, lookupValue)
        .maybeSingle();

      if (existing) {
        conversationId = existing.id;
        const updateData: Record<string, unknown> = {
          last_message_at: timestamp,
          last_message_preview: messageText.slice(0, 100),
          unread_count: 1,
          status: "aberta",
        };
        // Update contact name and avatar if available from Callbell
        if (contactName && contactName !== "Desconhecido") {
          updateData.contact_name = contactName;
        }
        if (contactAvatar) {
          updateData.contact_avatar_url = contactAvatar;
        }
        await supabase
          .from("conversations")
          .update(updateData)
          .eq("id", conversationId);
      }
    }

    // Create new conversation if not found
    if (!conversationId) {
      const insertData: Record<string, unknown> = {
        channel: dbChannel,
        contact_name: contactName,
        contact_avatar_url: contactAvatar,
        status: "aberta",
        last_message_at: timestamp,
        last_message_preview: messageText.slice(0, 100),
        unread_count: 1,
      };

      if (contactPhone) insertData.contact_phone = contactPhone;
      if (contactIg) insertData.contact_instagram = contactIg;
      if (contactEmail) insertData.contact_email = contactEmail;

      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert(insertData)
        .select("id")
        .single();

      if (convError) {
        console.error("Error creating conversation:", convError);
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversationId = newConv.id;
    }

    // Insert message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      content: messageText,
      sender_name: contactName,
      external_id: externalId,
      media_url: mediaUrl,
      media_type: mediaType,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Callbell webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
