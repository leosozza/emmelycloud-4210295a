import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // CORS preflight
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

    // The verify token is META_APP_SECRET for simplicity
    if (mode === "subscribe" && token === META_APP_SECRET) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ─── POST: Incoming messages ───
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Instagram webhook payload:", JSON.stringify(body));

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Process each entry from Meta
      for (const entry of body.entry ?? []) {
        for (const messaging of entry.messaging ?? []) {
          const senderId = messaging.sender?.id;
          const message = messaging.message;
          if (!senderId || !message?.text) continue;

          const igSenderId = String(senderId);
          const timestamp = messaging.timestamp
            ? new Date(messaging.timestamp * 1000).toISOString()
            : new Date().toISOString();

          // Find or create conversation
          let { data: conversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("channel", "instagram")
            .eq("contact_instagram", igSenderId)
            .maybeSingle();

          if (!conversation) {
            // Try to get sender name via Graph API
            let senderName = igSenderId;
            const PAGE_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN");
            try {
              const profileRes = await fetch(
                `https://graph.instagram.com/v21.0/${igSenderId}?fields=name,username&access_token=${PAGE_TOKEN}`
              );
              if (profileRes.ok) {
                const profile = await profileRes.json();
                senderName = profile.name || profile.username || igSenderId;
              }
            } catch {
              // fallback to ID
            }

            const { data: newConv, error } = await supabase
              .from("conversations")
              .insert({
                channel: "instagram",
                contact_name: senderName,
                contact_instagram: igSenderId,
                status: "aberta",
                last_message_at: timestamp,
                last_message_preview: message.text.slice(0, 100),
                unread_count: 1,
              })
              .select("id")
              .single();

            if (error) {
              console.error("Error creating conversation:", error);
              continue;
            }
            conversation = newConv;
          } else {
            // Update conversation
            await supabase
              .from("conversations")
              .update({
                last_message_at: timestamp,
                last_message_preview: message.text.slice(0, 100),
                unread_count: 1, // simplified
                status: "aberta",
              })
              .eq("id", conversation.id);
          }

          // Insert message
          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            direction: "inbound",
            content: message.text,
            sender_name: null,
            external_id: message.mid ?? null,
            media_url: message.attachments?.[0]?.payload?.url ?? null,
            media_type: message.attachments?.[0]?.type ?? null,
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
