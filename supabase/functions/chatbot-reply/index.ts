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

  try {
    const { conversation_id, message_text } = await req.json();
    if (!conversation_id || !message_text) {
      return new Response(JSON.stringify({ error: "conversation_id and message_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Get conversation details first (need channel to check settings)
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, channel, contact_phone, contact_instagram, contact_email, contact_name, attendance_mode")
      .eq("id", conversation_id)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Check human mode
    if (conversation.attendance_mode === "human") {
      return new Response(JSON.stringify({ skipped: "human_mode" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Check chatbot_channel_settings — respect per-channel enable/disable and agent
    const { data: channelSetting } = await supabase
      .from("chatbot_channel_settings")
      .select("enabled, agent_id")
      .eq("channel", conversation.channel)
      .maybeSingle();

    // If a setting exists and chatbot is disabled for this channel, skip
    if (channelSetting && !channelSetting.enabled) {
      console.log(`[CHATBOT] Chatbot disabled for channel: ${conversation.channel}`);
      return new Response(JSON.stringify({ skipped: "chatbot_disabled_for_channel" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Find agent — use channel-specific agent if configured, otherwise default
    let agent: any = null;
    if (channelSetting?.agent_id) {
      const { data } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("id", channelSetting.agent_id)
        .eq("is_active", true)
        .maybeSingle();
      agent = data;
    }
    if (!agent) {
      const { data } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("is_default", true)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      agent = data;
    }

    if (!agent) {
      console.log("[CHATBOT] No default active agent found, skipping auto-reply");
      return new Response(JSON.stringify({ skipped: "no_active_agent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Get last 10 messages for context
    const { data: history } = await supabase
      .from("messages")
      .select("direction, content, sender_name, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const messages = (history || []).reverse().map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content,
    }));

    // 6. Call ai-playground to generate response
    const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-playground`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        agent_id: agent.id,
        messages,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[CHATBOT] AI playground error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiRes.json();
    const replyText = aiResult.content;

    if (!replyText) {
      console.log("[CHATBOT] Empty AI response, skipping");
      return new Response(JSON.stringify({ skipped: "empty_response" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Save outbound message
    await supabase.from("messages").insert({
      conversation_id,
      direction: "outbound",
      content: replyText,
      sender_name: agent.name || "EmmelyAI",
      delivery_status: "sent",
    });

    // Update conversation preview
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: replyText.slice(0, 100),
      })
      .eq("id", conversation_id);

    // 8. Send reply to the external channel via message-send (fire and forget)
    if (conversation.channel === "instagram" || conversation.channel === "whatsapp") {
      fetch(`${supabaseUrl}/functions/v1/message-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          conversation_id,
          content: replyText,
        }),
      }).catch((e) => console.error("[CHATBOT] message-send error:", e));
    }

    // 9. Forward to Bitrix24 as bot message (fire and forget)
    const botMessage = `[b]${agent.name || "EmmelyAI"}[/b] - ${replyText}`;
    fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        message: botMessage,
        contactName: conversation.contact_name,
        contactId: conversation.contact_phone || conversation.contact_instagram || conversation.contact_email,
        channel: conversation.channel,
        conversationId: conversation_id,
      }),
    }).catch((e) => console.error("[CHATBOT] Bitrix24 forward error:", e));

    return new Response(JSON.stringify({ success: true, reply: replyText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[CHATBOT] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
