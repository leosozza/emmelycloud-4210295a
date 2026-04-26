import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Instance UUID may be supplied via query (?instance=...) or header — used to route to the correct Bitrix24 Open Line
    const instanceIdFromUrl = url.searchParams.get("instance") || url.searchParams.get("instanceId") || req.headers.get("x-instance-id") || null;

    const body = await req.json();
    console.log("[WUZAPI-WEBHOOK] Received:", JSON.stringify(body).slice(0, 500), "instance:", instanceIdFromUrl);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const instanceId: string | null = instanceIdFromUrl || body.instance_id || body.instanceId || null;

    // WUZAPI sends different payload formats:
    // Format A (expected):  { event: "Message", data: { Info: {...}, Message: {...} } }
    // Format B (actual):    { event: { Info: {...}, Message: {...} } }  — event IS the data
    // Format C (flat):      { Info: {...}, Message: {...} }
    let eventType: string | undefined;
    let messageData: any;

    if (typeof body.event === "string") {
      // Format A: event is a string like "Message"
      eventType = body.event;
      messageData = body.data || body;
    } else if (body.event && typeof body.event === "object" && (body.event.Info || body.event.Message)) {
      // Format B: event IS the message object
      eventType = "Message";
      messageData = body.event;
    } else if (body.Info || body.Message) {
      // Format C: flat payload
      eventType = "Message";
      messageData = body;
    } else {
      eventType = body.type;
      messageData = body.data || body;
    }

    // Only process incoming messages
    if (eventType !== "Message" && eventType !== "message") {
      console.log(`[WUZAPI-WEBHOOK] Ignoring event type: ${eventType}`);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract message data from WUZAPI payload
    const info = messageData.Info || messageData.info || {};
    const message = messageData.Message || messageData.message || {};

    // Get sender info from JID
    // WUZAPI v2+ uses LID format: 196847578665004@lid
    // Classic format: 5511999999999@s.whatsapp.net
    const chatJid = info.Chat || info.RemoteJid || info.remoteJid || info.Sender || info.sender || "";
    const phone = chatJid.replace(/@.*$/, "");
    // Preserve the JID suffix to know if it's a LID or phone-based contact
    const isLidContact = chatJid.includes("@lid");

    if (!phone) {
      console.log("[WUZAPI-WEBHOOK] No phone number found in payload");
      return new Response(JSON.stringify({ ok: true, no_phone: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[WUZAPI-WEBHOOK] Contact: ${phone}, isLID: ${isLidContact}, JID: ${chatJid}`);

    // Skip outgoing messages (from me)
    const fromMe = info.FromMe || info.fromMe || false;
    if (fromMe) {
      console.log("[WUZAPI-WEBHOOK] Skipping outgoing message");
      return new Response(JSON.stringify({ ok: true, skipped: "from_me" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract message content
    let content = "";
    let mediaType: string | null = null;
    let mediaUrl: string | null = null;

    if (message.Conversation || message.conversation) {
      content = message.Conversation || message.conversation;
    } else if (message.ExtendedTextMessage || message.extendedTextMessage) {
      const ext = message.ExtendedTextMessage || message.extendedTextMessage;
      content = ext.Text || ext.text || "";
    } else if (message.ImageMessage || message.imageMessage) {
      const img = message.ImageMessage || message.imageMessage;
      content = img.Caption || img.caption || "[Imagem]";
      mediaType = "image";
    } else if (message.DocumentMessage || message.documentMessage) {
      const doc = message.DocumentMessage || message.documentMessage;
      content = doc.Title || doc.title || doc.FileName || doc.fileName || "[Documento]";
      mediaType = "document";
    } else if (message.AudioMessage || message.audioMessage) {
      content = "[Áudio]";
      mediaType = "audio";
    } else if (message.VideoMessage || message.videoMessage) {
      const vid = message.VideoMessage || message.videoMessage;
      content = vid.Caption || vid.caption || "[Vídeo]";
      mediaType = "video";
    } else if (message.StickerMessage || message.stickerMessage) {
      content = "[Sticker]";
      mediaType = "image";
    } else if (message.ContactMessage || message.contactMessage) {
      const ct = message.ContactMessage || message.contactMessage;
      content = `[Contato] ${ct.DisplayName || ct.displayName || ""}`;
    } else if (message.LocationMessage || message.locationMessage) {
      content = "[Localização]";
    } else {
      content = "[Mensagem não suportada]";
    }

    if (!content) content = "[Mensagem vazia]";

    // Get sender name (push name)
    const senderName = info.PushName || info.pushName || phone;

    // External message ID
    const externalId = info.Id || info.id || info.MessageID || "";

    // Upsert conversation
    // For LID contacts, store the full JID so message-send knows to use @lid
    const contactPhoneValue = isLidContact ? `${phone}@lid` : phone;

    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id, attendance_mode")
      .eq("channel", "whatsapp")
      .eq("contact_phone", contactPhoneValue)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;
    let attendanceMode = "bot";

    if (existingConv) {
      conversationId = existingConv.id;
      attendanceMode = existingConv.attendance_mode || "bot";
      await supabase.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
        last_customer_message_at: new Date().toISOString(),
        contact_name: senderName,
        unread_count: (existingConv as any).unread_count ? (existingConv as any).unread_count + 1 : 1,
      }).eq("id", conversationId);
    } else {
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          channel: "whatsapp",
          contact_phone: contactPhoneValue,
          contact_name: senderName,
          status: "aberta",
          attendance_mode: "bot",
          last_message_at: new Date().toISOString(),
          last_message_preview: content.slice(0, 100),
          last_customer_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select("id")
        .single();

      if (convError || !newConv) {
        console.error("[WUZAPI-WEBHOOK] Error creating conversation:", convError);
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversationId = newConv.id;
    }

    // Dedup: check if this message was sent by Emmely (echo prevention)
    if (externalId) {
      const { data: dedupHit } = await supabase
        .from("sync_dedup_cache")
        .select("id")
        .eq("entity_type", "message")
        .eq("external_id", externalId)
        .eq("source", "emmely")
        .maybeSingle();
      if (dedupHit) {
        console.log("[WUZAPI-WEBHOOK] Dedup: skipping echo message:", externalId);
        return new Response(JSON.stringify({ ok: true, skipped: "dedup_echo" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      content,
      sender_name: senderName,
      external_id: externalId,
      media_type: mediaType,
      media_url: mediaUrl,
      delivery_status: "delivered",
      sync_source: "bitrix24",
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Forward message to Bitrix24 Open Channel
    try {
      const bitrixResponse = await fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          message: content,
          contactName: senderName,
          contactId: phone,
          channel: "whatsapp",
          conversationId,
        }),
      });

      const bitrixResult = await bitrixResponse.json().catch(() => null);
      console.log("[WUZAPI-WEBHOOK] bitrix24-send result:", JSON.stringify(bitrixResult));

      if (!bitrixResponse.ok || bitrixResult?.error) {
        throw new Error(bitrixResult?.error || `bitrix24-send failed with status ${bitrixResponse.status}`);
      }
    } catch (e) {
      console.error("[WUZAPI-WEBHOOK] bitrix24-send error:", e);
    }

    // Trigger flow-engine if bot is active (unified pipeline)
    if (attendanceMode === "bot") {
      try {
        fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            message_text: content,
          }),
        }).catch((e) => console.error("[WUZAPI-WEBHOOK] flow-engine fire-and-forget error:", e));
      } catch {}
    }

    console.log(`[WUZAPI-WEBHOOK] Processed message from ${phone} in conversation ${conversationId}`);

    return new Response(JSON.stringify({ ok: true, conversation_id: conversationId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[WUZAPI-WEBHOOK] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
