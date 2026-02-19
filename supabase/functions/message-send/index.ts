import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IG_GRAPH_URL = "https://graph.instagram.com/v24.0";
const WA_GRAPH_URL = "https://graph.facebook.com/v22.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversation_id, content, message_type, interactive_data, skip_db_save } = await req.json();
    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: "conversation_id and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get conversation details
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, channel, contact_phone, contact_instagram, contact_email, contact_name")
      .eq("id", conversation_id)
      .single();

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let externalMessageId: string | null = null;

    // ── Instagram: send via Meta Graph API ──
    if (conv.channel === "instagram") {
      const igToken = Deno.env.get("META_PAGE_ACCESS_TOKEN")?.trim().replace(/[\r\n\s]+/g, "");
      const igAccountId = Deno.env.get("META_IG_ACCOUNT_ID")?.trim();

      if (!igToken || !igAccountId) {
        return new Response(JSON.stringify({ error: "META_PAGE_ACCESS_TOKEN and META_IG_ACCOUNT_ID required" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!conv.contact_instagram) {
        return new Response(JSON.stringify({ error: "No Instagram contact identifier" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const igResponse = await fetch(`${IG_GRAPH_URL}/${igAccountId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${igToken}` },
        body: JSON.stringify({
          recipient: { id: conv.contact_instagram },
          message: { text: content },
        }),
      });

      const igResult = await igResponse.json();
      if (!igResponse.ok) {
        console.error("[MESSAGE-SEND] Instagram API error:", JSON.stringify(igResult));
        return new Response(JSON.stringify({ error: "Failed to send Instagram message", details: igResult }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      externalMessageId = igResult.message_id ?? null;

    // ── WhatsApp: send via WhatsApp Business API (Meta Cloud API) ──
    } else if (conv.channel === "whatsapp") {
      const waToken = Deno.env.get("META_WA_ACCESS_TOKEN")?.trim();
      const waPhoneId = Deno.env.get("META_WA_PHONE_NUMBER_ID")?.trim();

      if (!waToken || !waPhoneId) {
        return new Response(JSON.stringify({ error: "META_WA_ACCESS_TOKEN and META_WA_PHONE_NUMBER_ID required" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!conv.contact_phone) {
        return new Response(JSON.stringify({ error: "No phone number for WhatsApp contact" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = conv.contact_phone.replace(/[^0-9]/g, "");

      // Build WhatsApp message payload based on type
      let waPayload: any;

      if (message_type === "interactive_buttons" && interactive_data) {
        // Interactive buttons message
        const buttons = (interactive_data as any[]).slice(0, 3).map((btn: any, i: number) => ({
          type: "reply",
          reply: { id: btn.id || `btn_${i}`, title: (btn.title || btn.label || `Opção ${i + 1}`).substring(0, 20) },
        }));

        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: content },
            action: { buttons },
          },
        };
      } else if (message_type === "interactive_list" && interactive_data) {
        // Interactive list message
        const rows = (interactive_data as any[]).slice(0, 10).map((item: any, i: number) => ({
          id: item.id || `item_${i}`,
          title: (item.title || `Item ${i + 1}`).substring(0, 24),
          description: (item.description || "").substring(0, 72),
        }));

        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "interactive",
          interactive: {
            type: "list",
            body: { text: content },
            action: {
              button: "Selecionar",
              sections: [{ title: "Opções", rows }],
            },
          },
        };
      } else if (message_type === "image" && interactive_data) {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: { link: interactive_data.url || interactive_data, caption: content },
        };
      } else if (message_type === "document" && interactive_data) {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "document",
          document: { link: interactive_data.url || interactive_data, caption: content, filename: interactive_data.filename || "documento" },
        };
      } else if (message_type === "audio" && interactive_data) {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "audio",
          audio: { link: interactive_data.url || interactive_data },
        };
      } else if (message_type === "video" && interactive_data) {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "video",
          video: { link: interactive_data.url || interactive_data, caption: content },
        };
      } else if (message_type === "location" && interactive_data) {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "location",
          location: {
            latitude: interactive_data.latitude,
            longitude: interactive_data.longitude,
            name: interactive_data.name || "",
            address: interactive_data.address || "",
          },
        };
      } else if (message_type === "template" && interactive_data) {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: interactive_data.name,
            language: { code: interactive_data.language || "pt_BR" },
            components: interactive_data.components || [],
          },
        };
      } else if (message_type === "reaction" && interactive_data) {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "reaction",
          reaction: {
            message_id: interactive_data.message_id,
            emoji: interactive_data.emoji || "👍",
          },
        };
      } else {
        // Default: text message
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: content },
        };
      }

      const waResponse = await fetch(`${WA_GRAPH_URL}/${waPhoneId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${waToken}` },
        body: JSON.stringify(waPayload),
      });

      const waResult = await waResponse.json();
      if (!waResponse.ok) {
        console.error("[MESSAGE-SEND] WhatsApp API error:", JSON.stringify(waResult));
        return new Response(JSON.stringify({ error: "Failed to send WhatsApp message", details: waResult }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      externalMessageId = waResult.messages?.[0]?.id ?? null;
    }
    // email/webchat: just DB insert (no external send)

    // Save outbound message (unless skip_db_save)
    if (!skip_db_save) {
      await supabase.from("messages").insert({
        conversation_id,
        direction: "outbound",
        content,
        sender_name: "Atendente",
        external_id: externalMessageId,
        delivery_status: "sent",
        media_type: message_type && message_type !== "interactive_buttons" && message_type !== "interactive_list" ? message_type : null,
      });

      await supabase.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
      }).eq("id", conversation_id);
    }

    return new Response(JSON.stringify({ success: true, message_id: externalMessageId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[MESSAGE-SEND] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
