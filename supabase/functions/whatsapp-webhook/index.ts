import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const META_APP_SECRET = Deno.env.get("META_APP_SECRET");

  // ─── GET: Meta Webhook Verification ───
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === META_APP_SECRET) {
      console.log("[WA-WEBHOOK] Verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ─── POST: Incoming WhatsApp messages ───
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("[WA-WEBHOOK] Payload:", JSON.stringify(body).substring(0, 500));

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== "messages") continue;

          const value = change.value || {};
          const messages = value.messages || [];
          const contacts = value.contacts || [];
          const statuses = value.statuses || [];

          // Handle delivery status updates
          for (const status of statuses) {
            if (status.id) {
              await supabase.from("messages")
                .update({ delivery_status: status.status })
                .eq("external_id", status.id);
            }
          }

          for (const msg of messages) {
            const from = msg.from;
            const waMessageId = msg.id;
            const contactInfo = contacts.find((c: any) => c.wa_id === from);
            const contactName = contactInfo?.profile?.name || from;

            if (!from) continue;

            // Extract message content based on type
            let text = "";
            let mediaUrl = "";
            let mediaType = "";
            let interactiveResponse: any = null;

            switch (msg.type) {
              case "text":
                text = msg.text?.body || "";
                break;
              case "image":
                text = msg.image?.caption || "[Imagem]";
                mediaType = "image";
                mediaUrl = msg.image?.id || "";
                break;
              case "audio":
                text = "[Áudio]";
                mediaType = "audio";
                mediaUrl = msg.audio?.id || "";
                break;
              case "video":
                text = msg.video?.caption || "[Vídeo]";
                mediaType = "video";
                mediaUrl = msg.video?.id || "";
                break;
              case "document":
                text = msg.document?.caption || `[Documento: ${msg.document?.filename || "ficheiro"}]`;
                mediaType = "document";
                mediaUrl = msg.document?.id || "";
                break;
              case "sticker":
                text = "[Sticker]";
                mediaType = "sticker";
                mediaUrl = msg.sticker?.id || "";
                break;
              case "location":
                text = `[Localização: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
                mediaType = "location";
                break;
              case "contacts":
                const contact = msg.contacts?.[0];
                text = `[Contacto: ${contact?.name?.formatted_name || ""}]`;
                mediaType = "contact";
                break;
              case "interactive":
                // Button or list reply
                interactiveResponse = msg.interactive;
                text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "[Resposta interativa]";
                break;
              case "button":
                text = msg.button?.text || "[Botão]";
                interactiveResponse = { button_reply: { id: msg.button?.payload, title: msg.button?.text } };
                break;
              case "reaction":
                text = `[Reação: ${msg.reaction?.emoji || ""}]`;
                break;
              case "order":
                text = "[Pedido recebido]";
                mediaType = "order";
                break;
              default:
                text = `[${msg.type || "desconhecido"}]`;
                break;
            }

            if (!text && !mediaUrl) continue;

            // Find or create conversation
            let conversationId: string;

            const { data: existing } = await supabase
              .from("conversations")
              .select("id")
              .eq("channel", "whatsapp")
              .eq("contact_phone", from)
              .maybeSingle();

            if (existing) {
              conversationId = existing.id;
            } else {
              const { data: newConv, error: convErr } = await supabase
                .from("conversations")
                .insert({
                  channel: "whatsapp",
                  contact_name: contactName,
                  contact_phone: from,
                  status: "aberta",
                })
                .select("id")
                .single();

              if (convErr || !newConv) {
                console.error("[WA-WEBHOOK] Failed to create conversation:", convErr);
                continue;
              }
              conversationId = newConv.id;
            }

            // Check for duplicate
            const { data: dupCheck } = await supabase
              .from("messages")
              .select("id")
              .eq("external_id", waMessageId)
              .maybeSingle();

            if (dupCheck) {
              console.log("[WA-WEBHOOK] Duplicate message, skipping:", waMessageId);
              continue;
            }

            // Save inbound message
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              direction: "inbound",
              content: text,
              sender_name: contactName,
              external_id: waMessageId,
              media_type: mediaType || null,
              media_url: mediaUrl || null,
            });

            // Update conversation
            await supabase
              .from("conversations")
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: text.slice(0, 100),
                unread_count: 1,
              })
              .eq("id", conversationId);

            // Call flow-engine instead of chatbot-reply (fire and forget)
            fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                message_text: text,
                message_type: msg.type,
                interactive_response: interactiveResponse,
              }),
            }).catch((e) => console.error("[WA-WEBHOOK] Flow engine error:", e));

            // Forward to Bitrix24 (fire and forget)
            fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                message: text,
                contactName,
                contactId: from,
                channel: "whatsapp",
                conversationId,
              }),
            }).catch((e) => console.error("[WA-WEBHOOK] Bitrix24 forward error:", e));
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[WA-WEBHOOK] Error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
