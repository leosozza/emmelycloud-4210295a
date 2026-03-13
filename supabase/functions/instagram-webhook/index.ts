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
      console.log("[IG-WEBHOOK] Verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ─── POST: Incoming Instagram messages ───
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("[IG-WEBHOOK] Payload:", JSON.stringify(body).substring(0, 500));

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);

      // Process Instagram messaging entries
      const entries = body.entry || [];
      for (const entry of entries) {
        const messaging = entry.messaging || [];

        for (const event of messaging) {
          // Handle delivery status updates (Instagram sends them as event.delivery)
          if (event.delivery) {
            try {
              const mids = event.delivery?.mids || [];
              for (const mid of mids) {
                await supabase.from("messages")
                  .update({ delivery_status: "delivered" })
                  .eq("external_id", mid);

                // Badge: emmely_msg_delivered
                const { data: msgRow } = await supabase
                  .from("messages")
                  .select("conversation_id")
                  .eq("external_id", mid)
                  .maybeSingle();

                if (msgRow?.conversation_id) {
                  const { data: lead } = await supabase
                    .from("leads")
                    .select("bitrix24_id")
                    .eq("conversation_id", msgRow.conversation_id)
                    .not("bitrix24_id", "is", null)
                    .maybeSingle();

                  if (lead?.bitrix24_id) {
                    const { data: integration } = await supabase
                      .from("bitrix24_integrations")
                      .select("client_endpoint, access_token")
                      .order("created_at", { ascending: false })
                      .limit(1)
                      .maybeSingle();

                    if (integration?.client_endpoint && integration?.access_token) {
                      const ep = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
                      await fetch(`${ep}crm.activity.configurable.add`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          auth: integration.access_token,
                          ownerTypeId: 2,
                          ownerId: parseInt(lead.bitrix24_id),
                          fields: { completed: true, isIncomingChannel: "N", responsibleId: 1, badgeCode: "emmely_msg_delivered" },
                          layout: {
                            icon: { code: "done" },
                            header: { title: "Entregue" },
                            body: { logo: { code: "robot" }, blocks: {
                              channel: { type: "text", properties: { value: "Instagram" } },
                            } },
                          },
                        }),
                      });
                      console.log(`[IG-WEBHOOK] Badge emmely_msg_delivered for deal ${lead.bitrix24_id}`);
                    }
                  }
                }
              }
            } catch (deliveryErr) {
              console.error("[IG-WEBHOOK] Delivery badge error:", deliveryErr);
            }
            continue;
          }

          // Handle read receipts
          if (event.read) continue;

          // Only process messages (not reactions, reads, etc.)
          if (!event.message || event.message.is_echo) continue;

          const senderId = event.sender?.id;
          const text = event.message?.text || "";
          const igMessageId = event.message?.mid;

          if (!senderId || !text) continue;

          // Find or create conversation
          let conversationId: string;

          const { data: existing } = await supabase
            .from("conversations")
            .select("id")
            .eq("channel", "instagram")
            .eq("contact_instagram", senderId)
            .maybeSingle();

          if (existing) {
            conversationId = existing.id;
          } else {
            // Try to get sender name from Instagram API
            let senderName = senderId;
            try {
              // Resolve IG token from instances or env
              let igToken = "";
              const { data: igInst } = await supabase
                .from("channel_instances")
                .select("config")
                .eq("channel_type", "instagram")
                .eq("status", "active")
                .order("created_at")
                .limit(1);
              if (igInst?.[0]?.config) {
                const cfg = igInst[0].config as Record<string, any>;
                igToken = cfg.access_token || cfg.ig_access_token || "";
              }
              if (!igToken) {
                igToken = Deno.env.get("META_PAGE_ACCESS_TOKEN")?.trim() || "";
              }
              if (igToken) {
                const profileRes = await fetch(
                  `https://graph.instagram.com/v24.0/${senderId}?fields=name,username&access_token=${igToken}`
                );
                if (profileRes.ok) {
                  const profile = await profileRes.json();
                  senderName = profile.name || profile.username || senderId;
                }
              }
            } catch (_e) {
              // ignore profile fetch errors
            }

            const { data: newConv, error: convErr } = await supabase
              .from("conversations")
              .insert({
                channel: "instagram",
                contact_name: senderName,
                contact_instagram: senderId,
                status: "aberta",
              })
              .select("id")
              .single();

            if (convErr || !newConv) {
              console.error("[IG-WEBHOOK] Failed to create conversation:", convErr);
              continue;
            }
            conversationId = newConv.id;
          }

          // Check for duplicate
          const { data: dupCheck } = await supabase
            .from("messages")
            .select("id")
            .eq("external_id", igMessageId)
            .maybeSingle();

          if (dupCheck) {
            console.log("[IG-WEBHOOK] Duplicate message, skipping:", igMessageId);
            continue;
          }

          // Save inbound message
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            direction: "inbound",
            content: text,
            sender_name: senderId,
            external_id: igMessageId,
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

          // Fire and forget: flow-engine (unified pipeline)
          fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              conversation_id: conversationId,
              message_text: text,
            }),
          }).catch((e) => console.error("[IG-WEBHOOK] Flow engine error:", e));

          // Fire and forget: forward to Bitrix24
          fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              message: text,
              contactName: senderId,
              contactId: senderId,
              channel: "instagram",
              conversationId,
            }),
          }).catch((e) => console.error("[IG-WEBHOOK] Bitrix24 forward error:", e));
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[IG-WEBHOOK] Error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
