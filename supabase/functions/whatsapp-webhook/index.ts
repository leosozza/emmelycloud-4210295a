import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

      // Process each entry
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== "messages") continue;

          const value = change.value || {};
          const messages = value.messages || [];
          const contacts = value.contacts || [];

          for (const msg of messages) {
            if (msg.type !== "text") continue;

            const from = msg.from; // phone number
            const text = msg.text?.body || "";
            const waMessageId = msg.id;
            const contactInfo = contacts.find((c: any) => c.wa_id === from);
            const contactName = contactInfo?.profile?.name || from;

            if (!text || !from) continue;

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
            });

            // Update conversation
            await supabase
              .from("conversations")
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: text.slice(0, 100),
                unread_count: 1, // simplified
              })
              .eq("id", conversationId);

            // Fire and forget: chatbot-reply
            fetch(`${supabaseUrl}/functions/v1/chatbot-reply`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                message_text: text,
              }),
            }).catch((e) => console.error("[WA-WEBHOOK] Chatbot error:", e));

            // Fire and forget: forward to Bitrix24
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
