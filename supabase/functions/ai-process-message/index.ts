import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ─── Token optimization utilities (TOON-inspired) ───

// Serializa chunks da KB em formato tabular compacto (reduz ~35% vs texto livre)
function chunksToToon(chunks: { content: string }[]): string {
  if (chunks.length === 0) return "";
  const rows = chunks.map((c, i) =>
    `  ${i + 1},${c.content.replace(/,/g, ";").replace(/\n+/g, " ").trim().substring(0, 500)}`
  );
  return `KB[${chunks.length}]{idx,content}:\n${rows.join("\n")}`;
}

// Comprime histórico antigo em bloco tabular para o system prompt (reduz ~50% vs incluir tudo)
function compressOldHistory(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return "";
  const rows = messages.map((m, i) =>
    `  ${i + 1},${m.role === "user" ? "U" : "A"},${m.content.replace(/,/g, ";").replace(/\n+/g, " ").trim().substring(0, 200)}`
  );
  return `\n\nCONTEXTO_ANTERIOR[${messages.length}]{idx,role,msg}:\n${rows.join("\n")}\n`;
}

// Simple hash for duplicate detection
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// ─── Constants ───
const RECENT_MSG_COUNT = 5; // mensagens reais no messages[] (protocolo OpenAI)
const MAX_CHUNKS = 20;      // chunks máximos da KB

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { conversation_id, message_text, agent_id, skip_send } = await req.json();
    if (!message_text) {
      return new Response(JSON.stringify({ error: "message_text required" }), { status: 400, headers: jsonHeaders });
    }

    // Modo "sem conversa": skip_send=true e sem conversation_id → vai direto à IA
    const noConversationMode = !conversation_id && skip_send;

    let conversation: any = null;
    if (!noConversationMode) {
      if (!conversation_id) {
        return new Response(JSON.stringify({ error: "conversation_id required when skip_send is false" }), { status: 400, headers: jsonHeaders });
      }

      // 1. Get conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, channel, contact_phone, contact_instagram, contact_email, contact_name, attendance_mode, bot_state")
        .eq("id", conversation_id)
        .single();

      if (!conv) {
        return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: jsonHeaders });
      }

      // 2. Check human mode
      if (conv.attendance_mode === "human") {
        return new Response(JSON.stringify({ skipped: "human_mode" }), { headers: jsonHeaders });
      }

      // 3. Check chatbot_channel_settings — respect per-channel enable/disable
      const { data: channelSetting } = await supabase
        .from("chatbot_channel_settings")
        .select("enabled, agent_id")
        .eq("channel", conv.channel)
        .maybeSingle();

      if (channelSetting && !channelSetting.enabled) {
        console.log(`[AI-PROCESS] Chatbot disabled for channel: ${conv.channel}`);
        return new Response(JSON.stringify({ skipped: "chatbot_disabled_for_channel" }), { headers: jsonHeaders });
      }

      conversation = conv;
    }

    // 4. Find agent — use channel-specific agent if configured, otherwise explicit or default
    let agent: any = null;
    if (agent_id) {
      const { data } = await supabase.from("ai_agents").select("*").eq("id", agent_id).eq("is_active", true).single();
      agent = data;
    }
    if (!agent && conversation) {
      const { data: cs } = await supabase.from("chatbot_channel_settings").select("agent_id").eq("channel", conversation.channel).maybeSingle();
      if (cs?.agent_id) {
        const { data } = await supabase.from("ai_agents").select("*").eq("id", cs.agent_id).eq("is_active", true).maybeSingle();
        agent = data;
      }
    }
    if (!agent) {
      const { data } = await supabase.from("ai_agents").select("*").eq("is_default", true).eq("is_active", true).maybeSingle();
      agent = data;
    }
    if (!agent) {
      console.log("[AI-PROCESS] No active agent found");
      return new Response(JSON.stringify({ skipped: "no_active_agent" }), { headers: jsonHeaders });
    }

    // 5. Get conversation history (last 15 raw messages for context split) — skip in noConversationMode
    const historyResult = conversation_id ? await supabase
      .from("messages")
      .select("direction, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(15) : { data: null };
    const history = historyResult.data;

    // ── TOON Técnica 2: dividir histórico em recente (messages[]) + antigo (TOON comprimido) ──
    const allHistory = (history || []).reverse(); // ordem cronológica

    const recentMessages = allHistory.slice(-RECENT_MSG_COUNT).map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content,
    }));

    const olderMessages = allHistory.slice(0, Math.max(0, allHistory.length - RECENT_MSG_COUNT)).map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content,
    }));

    const compressedHistory = compressOldHistory(olderMessages);

    // 6. Get knowledge base context — TOON Técnica 1
    let knowledgeContext = "";
    const { data: linkedDocs } = await supabase
      .from("agent_knowledge_documents")
      .select("document_id")
      .eq("agent_id", agent.id);

    if (linkedDocs && linkedDocs.length > 0) {
      const docIds = linkedDocs.map((d: any) => d.document_id);
      const { data: chunks } = await supabase
        .from("knowledge_chunks")
        .select("content")
        .in("document_id", docIds)
        .order("chunk_index")
        .limit(MAX_CHUNKS);

      if (chunks && chunks.length > 0) {
        const kbToon = chunksToToon(chunks);
        knowledgeContext = `\n\n--- BASE DE CONHECIMENTO ---\n${kbToon}\n--- FIM ---\n`;
      }
    }

    // 7. Build anti-repetition context (TOON Técnica 3: truncar a 50 chars)
    const recentBotMessages = (history || [])
      .filter((m: any) => m.direction === "outbound")
      .slice(0, 3)
      .map((m: any) => m.content);

    let antiRepetitionPrompt = "";
    if (recentBotMessages.length > 0) {
      antiRepetitionPrompt = "\n\nEVITAR repetir:\n" +
        recentBotMessages.map((m: string, i: number) => `${i + 1}."${m.substring(0, 50)}"`).join(" | ") +
        "\nVarIar respostas.\n";
    }

    // 8. Build system prompt with contact context
    const contactContext = conversation
      ? `\nContacto: ${conversation.contact_name || "?"} | Canal: ${conversation.channel}\n`
      : "";

    // System prompt final: KB (TOON) + histórico antigo (TOON) + contexto + anti-repetição
    const systemPrompt = (agent.system_prompt || "") + knowledgeContext + compressedHistory + contactContext + antiRepetitionPrompt;

    console.log(`[AI-PROCESS] Tokens context: recent_msgs=${recentMessages.length}, older_compressed=${olderMessages.length}, kb_chunks=${linkedDocs?.length || 0}`);

    // 9. Call AI API
    let apiUrl: string;
    let apiKey: string;
    let authHeader = "Authorization";
    let authPrefix = "Bearer";

    if (agent.ai_provider === "lovable") {
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    } else {
      const { data: provider } = await supabase.from("ai_providers").select("*").eq("slug", agent.ai_provider).single();
      apiUrl = agent.ai_base_url || provider?.base_url || "";
      authHeader = provider?.auth_header || "Authorization";
      authPrefix = provider?.auth_prefix || "Bearer";

      const credKey = agent.ai_api_key_credential || provider?.credential_key;
      if (credKey) {
        const { data: cred } = await supabase
          .from("integration_credentials")
          .select("credential_value")
          .eq("provider", agent.ai_provider)
          .eq("credential_key", credKey)
          .single();
        apiKey = cred?.credential_value || "";
      } else {
        apiKey = "";
      }
    }

    if (!apiUrl) {
      const fallbackReply = agent.fallback_message || "Desculpe, não consigo responder agora.";
      if (!skip_send) await sendReply(supabaseUrl, serviceKey, conversation, agent, fallbackReply);
      return new Response(JSON.stringify({ reply: fallbackReply, fallback: true }), { headers: jsonHeaders });
    }

    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { [authHeader]: `${authPrefix} ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: agent.ai_model,
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages, // apenas as 5 mensagens mais recentes
        ],
        temperature: Math.min(1, Math.max(0, agent.temperature || 0.7)),
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[AI-PROCESS] AI API error:", aiResponse.status, errText);
      const fallbackReply = agent.fallback_message || "Desculpe, não consigo responder agora.";
      if (!skip_send) await sendReply(supabaseUrl, serviceKey, conversation, agent, fallbackReply);
      return new Response(JSON.stringify({ reply: fallbackReply, fallback: true }), { headers: jsonHeaders });
    }

    const result = await aiResponse.json();
    const replyText = result.choices?.[0]?.message?.content || agent.fallback_message || "";

    if (!replyText) {
      return new Response(JSON.stringify({ skipped: "empty_response" }), { headers: jsonHeaders });
    }

    // 10. Duplicate detection
    const replyHash = simpleHash(replyText);
    const lastSent = recentBotMessages[0];
    if (lastSent && simpleHash(lastSent) === replyHash) {
      console.log("[AI-PROCESS] Duplicate response detected, skipping");
      return new Response(JSON.stringify({ skipped: "duplicate_response" }), { headers: jsonHeaders });
    }

    // 11. Log token usage
    const usage = result.usage || {};
    console.log(`[AI-PROCESS] Token usage: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}`);

    // 12. Send the reply (unless skip_send)
    if (!skip_send) {
      await sendReply(supabaseUrl, serviceKey, conversation, agent, replyText);
    }

    return new Response(JSON.stringify({ reply: replyText, agent_id: agent.id, usage }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[AI-PROCESS] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── Send reply via message-send + save to DB + forward to Bitrix24 ───
async function sendReply(supabaseUrl: string, serviceKey: string, conversation: any, agent: any, replyText: string) {
  const supabase = createClient(supabaseUrl, serviceKey);

  // Save outbound message
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    content: replyText,
    sender_name: agent.name || "EmmelyAI",
    delivery_status: "sent",
  });

  // Update conversation preview
  await supabase.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: replyText.slice(0, 100),
  }).eq("id", conversation.id);

  // Send to external channel
  if (conversation.channel === "instagram" || conversation.channel === "whatsapp") {
    fetch(`${supabaseUrl}/functions/v1/message-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ conversation_id: conversation.id, content: replyText, skip_db_save: true }),
    }).catch(e => console.error("[AI-PROCESS] message-send error:", e));
  }

  // Forward to Bitrix24
  const botMessage = `[b]${agent.name || "EmmelyAI"}[/b] - ${replyText}`;
  fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({
      message: botMessage,
      contactName: conversation.contact_name,
      contactId: conversation.contact_phone || conversation.contact_instagram || conversation.contact_email,
      channel: conversation.channel,
      conversationId: conversation.id,
    }),
  }).catch(e => console.error("[AI-PROCESS] Bitrix24 forward error:", e));
}
