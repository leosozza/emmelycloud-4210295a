import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ─── Token optimization utilities (TOON-inspired) ───

function chunksToToon(chunks: { content: string; similarity?: number }[]): string {
  if (chunks.length === 0) return "";
  const rows = chunks.map((c, i) =>
    `  ${i + 1},${c.content.replace(/,/g, ";").replace(/\n+/g, " ").trim().substring(0, 500)}`
  );
  return `KB[${chunks.length}]{idx,content}:\n${rows.join("\n")}`;
}

function compressOldHistory(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return "";
  const rows = messages.map((m, i) =>
    `  ${i + 1},${m.role === "user" ? "U" : "A"},${m.content.replace(/,/g, ";").replace(/\n+/g, " ").trim().substring(0, 200)}`
  );
  return `\n\nCONTEXTO_ANTERIOR[${messages.length}]{idx,role,msg}:\n${rows.join("\n")}\n`;
}

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
const RECENT_MSG_COUNT = 5;
const MAX_CHUNKS = 20;

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

    const noConversationMode = !conversation_id && skip_send;
    const startTime = Date.now();

    let conversation: any = null;
    if (!noConversationMode) {
      if (!conversation_id) {
        return new Response(JSON.stringify({ error: "conversation_id required when skip_send is false" }), { status: 400, headers: jsonHeaders });
      }

      const { data: conv } = await supabase
        .from("conversations")
        .select("id, channel, contact_phone, contact_instagram, contact_email, contact_name, attendance_mode, bot_state")
        .eq("id", conversation_id)
        .single();

      if (!conv) {
        return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: jsonHeaders });
      }

      if (conv.attendance_mode === "human") {
        return new Response(JSON.stringify({ skipped: "human_mode" }), { headers: jsonHeaders });
      }

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

    // 4. Find agent
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

    // 5. Get conversation history
    const historyResult = conversation_id ? await supabase
      .from("messages")
      .select("direction, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(15) : { data: null };
    const history = historyResult.data;

    const allHistory = (history || []).reverse();
    const recentMessages = allHistory.slice(-RECENT_MSG_COUNT).map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content,
    }));
    const olderMessages = allHistory.slice(0, Math.max(0, allHistory.length - RECENT_MSG_COUNT)).map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content,
    }));
    const compressedHistory = compressOldHistory(olderMessages);

    // 6. Get knowledge base context — try vector search first, fallback to sequential
    let knowledgeContext = "";
    const { data: linkedDocs } = await supabase
      .from("agent_knowledge_documents")
      .select("document_id")
      .eq("agent_id", agent.id);

    if (linkedDocs && linkedDocs.length > 0) {
      const docIds = linkedDocs.map((d: any) => d.document_id);
      let chunks: any[] = [];

      // Try vector search if embeddings exist
      try {
        const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Return ONLY the key search terms from this question, no explanation. Max 5 words." },
              { role: "user", content: message_text },
            ],
            temperature: 0,
          }),
        });

        if (embeddingResponse.ok) {
          // For now, use keyword-based chunk filtering until embeddings are generated
          const searchResult = await embeddingResponse.json();
          const searchTerms = (searchResult.choices?.[0]?.message?.content || message_text).toLowerCase().split(/\s+/);

          // Score chunks by keyword relevance
          const { data: allChunks } = await supabase
            .from("knowledge_chunks")
            .select("content, chunk_index")
            .in("document_id", docIds)
            .order("chunk_index")
            .limit(100);

          if (allChunks && allChunks.length > 0) {
            const scored = allChunks.map((c: any) => {
              const lower = c.content.toLowerCase();
              const score = searchTerms.reduce((acc: number, term: string) =>
                acc + (lower.includes(term) ? 1 : 0), 0);
              return { ...c, score };
            });
            scored.sort((a: any, b: any) => b.score - a.score);
            chunks = scored.slice(0, MAX_CHUNKS);
          }
        }
      } catch (e) {
        console.log("[AI-PROCESS] Smart chunk search failed, using sequential fallback:", e);
      }

      // Fallback to sequential
      if (chunks.length === 0) {
        const { data: seqChunks } = await supabase
          .from("knowledge_chunks")
          .select("content")
          .in("document_id", docIds)
          .order("chunk_index")
          .limit(MAX_CHUNKS);
        chunks = seqChunks || [];
      }

      if (chunks.length > 0) {
        const kbToon = chunksToToon(chunks);
        knowledgeContext = `\n\n--- BASE DE CONHECIMENTO ---\n${kbToon}\n--- FIM ---\n`;
      }
    }

    // 6b. Load long-term user memory
    let memoryContext = "";
    if (conversation) {
      const contactId = conversation.contact_phone || conversation.contact_instagram || conversation.contact_email;
      if (contactId) {
        const phoneCol = conversation.contact_phone ? "contact_phone" : conversation.contact_instagram ? "contact_instagram" : "contact_email";
        const { data: memories } = await supabase
          .from("user_memory")
          .select("key, value")
          .eq(phoneCol, contactId)
          .limit(20);

        if (memories && memories.length > 0) {
          memoryContext = "\n\nMEMÓRIA DO CONTACTO:\n" +
            memories.map((m: any) => `- ${m.key}: ${m.value}`).join("\n") + "\n";
        }
      }
    }

    // 7. Anti-repetition context
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

    // 8. Build system prompt
    const contactContext = conversation
      ? `\nContacto: ${conversation.contact_name || "?"} | Canal: ${conversation.channel}\n`
      : "";

    const autoLangPrompt = `\n\nIDIOMA: Deteta automaticamente o idioma da primeira mensagem do cliente e responde SEMPRE nesse mesmo idioma durante toda a conversa. Não perguntes o idioma — adapta-te silenciosamente. Suportas: Português, English, Español, Français, Deutsch, Italiano, 中文, 日本語, العربية, e outros.\n`;

    const systemPrompt = (agent.system_prompt || "") + knowledgeContext + memoryContext + compressedHistory + contactContext + antiRepetitionPrompt + autoLangPrompt;

    console.log(`[AI-PROCESS] Context: recent=${recentMessages.length}, older=${olderMessages.length}, kb=${linkedDocs?.length || 0}, memory=${memoryContext ? "yes" : "no"}`);

    // 9. Check for agent tools (tool calling)
    let tools: any[] | undefined;
    let toolChoice: any | undefined;
    const { data: agentTools } = await supabase
      .from("agent_tools")
      .select("tool_name, tool_description, tool_parameters")
      .eq("agent_id", agent.id)
      .eq("is_active", true);

    if (agentTools && agentTools.length > 0) {
      tools = agentTools.map((t: any) => ({
        type: "function",
        function: {
          name: t.tool_name,
          description: t.tool_description || t.tool_name,
          parameters: t.tool_parameters || { type: "object", properties: {} },
        },
      }));
    }

    // 10. Call AI API
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
      authHeader = provider?.auth_header || null;
      authPrefix = provider?.auth_prefix || null;

      if (provider?.credential_key === "base_url" || !authHeader) {
        const { data: urlOverride } = await supabase
          .from("integration_credentials")
          .select("credential_value")
          .eq("provider", agent.ai_provider)
          .eq("credential_key", "OLLAMA_BASE_URL")
          .single();
        if (urlOverride?.credential_value) {
          let baseUrl = urlOverride.credential_value.replace(/\/+$/, "");
          if (!baseUrl.endsWith("/v1/chat/completions")) baseUrl += "/v1/chat/completions";
          apiUrl = baseUrl;
        }
      }

      const credKey = agent.ai_api_key_credential || (provider?.credential_key !== "base_url" ? provider?.credential_key : null);
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
      await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider, 0, 0, 0, Date.now() - startTime, true, "no_api_url");
      return new Response(JSON.stringify({ reply: fallbackReply, fallback: true }), { headers: jsonHeaders });
    }

    const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader && apiKey) {
      fetchHeaders[authHeader] = `${authPrefix || ""} ${apiKey}`.trim();
    }

    const aiBody: any = {
      model: agent.ai_model,
      messages: [
        { role: "system", content: systemPrompt },
        ...recentMessages,
      ],
      temperature: Math.min(1, Math.max(0, agent.temperature || 0.7)),
    };
    if (tools) aiBody.tools = tools;
    if (toolChoice) aiBody.tool_choice = toolChoice;

    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(aiBody),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[AI-PROCESS] AI API error:", aiResponse.status, errText);
      const fallbackReply = agent.fallback_message || "Desculpe, não consigo responder agora.";
      if (!skip_send) await sendReply(supabaseUrl, serviceKey, conversation, agent, fallbackReply);
      await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider, 0, 0, 0, Date.now() - startTime, true, `API ${aiResponse.status}`);
      return new Response(JSON.stringify({ reply: fallbackReply, fallback: true }), { headers: jsonHeaders });
    }

    const result = await aiResponse.json();

    // Handle tool calls
    const toolCalls = result.choices?.[0]?.message?.tool_calls;
    let replyText = result.choices?.[0]?.message?.content || "";

    if (toolCalls && toolCalls.length > 0) {
      console.log("[AI-PROCESS] Tool calls detected:", toolCalls.map((t: any) => t.function.name));

      const toolResults: any[] = [];
      for (const tc of toolCalls) {
        const toolResult = await executeToolCall(supabase, supabaseUrl, serviceKey, conversation, tc);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Second call with tool results
      const followUpBody: any = {
        model: agent.ai_model,
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages,
          result.choices[0].message,
          ...toolResults,
        ],
        temperature: Math.min(1, Math.max(0, agent.temperature || 0.7)),
      };

      const followUp = await fetch(apiUrl, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify(followUpBody),
      });

      if (followUp.ok) {
        const followUpResult = await followUp.json();
        replyText = followUpResult.choices?.[0]?.message?.content || replyText;

        // Merge usage
        const fu = followUpResult.usage || {};
        const ou = result.usage || {};
        result.usage = {
          prompt_tokens: (ou.prompt_tokens || 0) + (fu.prompt_tokens || 0),
          completion_tokens: (ou.completion_tokens || 0) + (fu.completion_tokens || 0),
          total_tokens: (ou.total_tokens || 0) + (fu.total_tokens || 0),
        };
      }
    }

    if (!replyText) {
      replyText = agent.fallback_message || "";
    }

    if (!replyText) {
      return new Response(JSON.stringify({ skipped: "empty_response" }), { headers: jsonHeaders });
    }

    // 11. Duplicate detection
    const replyHash = simpleHash(replyText);
    const lastSent = recentBotMessages[0];
    if (lastSent && simpleHash(lastSent) === replyHash) {
      console.log("[AI-PROCESS] Duplicate response detected, skipping");
      return new Response(JSON.stringify({ skipped: "duplicate_response" }), { headers: jsonHeaders });
    }

    // 12. Log usage (observability)
    const usage = result.usage || {};
    const latencyMs = Date.now() - startTime;
    console.log(`[AI-PROCESS] Usage: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}, latency=${latencyMs}ms`);

    await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider,
      usage.prompt_tokens || 0, usage.completion_tokens || 0, usage.total_tokens || 0, latencyMs, false, null);

    // 13. Send the reply
    if (!skip_send) {
      await sendReply(supabaseUrl, serviceKey, conversation, agent, replyText);
    }

    return new Response(JSON.stringify({ reply: replyText, agent_id: agent.id, usage, content: replyText }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[AI-PROCESS] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── Tool execution ───
async function executeToolCall(supabase: any, supabaseUrl: string, serviceKey: string, conversation: any, toolCall: any): Promise<any> {
  const fnName = toolCall.function.name;
  let args: any = {};
  try { args = JSON.parse(toolCall.function.arguments || "{}"); } catch {}

  console.log(`[AI-PROCESS] Executing tool: ${fnName}`, args);

  try {
    switch (fnName) {
      case "create_lead": {
        const { data, error } = await supabase.from("leads").insert({
          name: args.name || "Sem nome",
          phone: args.phone || conversation?.contact_phone || null,
          email: args.email || conversation?.contact_email || null,
          legal_area: args.legal_area || "outro",
          country: args.country || "Portugal",
          notes: args.notes || null,
          conversation_id: conversation?.id || null,
          origin: conversation?.channel || "outro",
        }).select("id, name").single();
        return error ? { error: error.message } : { success: true, lead_id: data.id, name: data.name };
      }

      case "search_leads": {
        const query = supabase.from("leads").select("id, name, phone, email, funnel_stage, legal_area, ai_score").limit(5);
        if (args.name) query.ilike("name", `%${args.name}%`);
        if (args.phone) query.ilike("phone", `%${args.phone}%`);
        if (args.email) query.ilike("email", `%${args.email}%`);
        const { data } = await query;
        return { results: data || [] };
      }

      case "check_payment_status": {
        const { data } = await supabase.from("payment_transactions")
          .select("id, amount, currency, status, gateway, created_at")
          .order("created_at", { ascending: false })
          .limit(5);
        return { transactions: data || [] };
      }

      case "transfer_to_human": {
        if (conversation) {
          await supabase.from("conversations").update({ attendance_mode: "human" }).eq("id", conversation.id);
        }
        return { success: true, message: "Conversa transferida para atendimento humano." };
      }

      case "schedule_callback": {
        return { success: true, message: `Callback agendado para ${args.datetime || "a definir"} — ${args.reason || "contacto de retorno"}` };
      }

      default:
        return { error: `Tool "${fnName}" not implemented` };
    }
  } catch (e: any) {
    console.error(`[AI-PROCESS] Tool ${fnName} error:`, e);
    return { error: e.message || "Tool execution failed" };
  }
}

// ─── Observability: log AI usage ───
async function logUsage(
  supabase: any, conversationId: string | null, agentId: string, model: string, provider: string,
  promptTokens: number, completionTokens: number, totalTokens: number, latencyMs: number,
  wasFallback: boolean, error: string | null
) {
  try {
    await supabase.from("ai_usage_logs").insert({
      conversation_id: conversationId || null,
      agent_id: agentId,
      model,
      provider,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      latency_ms: latencyMs,
      was_fallback: wasFallback,
      error,
    });
  } catch (e) {
    console.error("[AI-PROCESS] Failed to log usage:", e);
  }
}

// ─── Send reply via message-send + save to DB + forward to Bitrix24 ───
async function sendReply(supabaseUrl: string, serviceKey: string, conversation: any, agent: any, replyText: string) {
  const supabase = createClient(supabaseUrl, serviceKey);

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    content: replyText,
    sender_name: agent.name || "EmmelyAI",
    delivery_status: "sent",
  });

  await supabase.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: replyText.slice(0, 100),
  }).eq("id", conversation.id);

  if (conversation.channel === "instagram" || conversation.channel === "whatsapp") {
    fetch(`${supabaseUrl}/functions/v1/message-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ conversation_id: conversation.id, content: replyText, skip_db_save: true }),
    }).catch(e => console.error("[AI-PROCESS] message-send error:", e));
  }

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

  // Extract and save user memory (async, fire and forget)
  extractUserMemory(supabaseUrl, serviceKey, conversation, replyText)
    .catch(e => console.error("[AI-PROCESS] Memory extraction error:", e));
}

// ─── Extract user memory from conversation ───
async function extractUserMemory(supabaseUrl: string, serviceKey: string, conversation: any, _lastReply: string) {
  const supabase = createClient(supabaseUrl, serviceKey);
  const contactId = conversation.contact_phone || conversation.contact_instagram || conversation.contact_email;
  if (!contactId) return;

  // Only extract every ~10 messages to avoid excessive API calls
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);

  if (!count || count % 10 !== 0) return;

  const { data: messages } = await supabase
    .from("messages")
    .select("content, direction")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!messages || messages.length < 3) return;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return;

  try {
    const formatted = messages.reverse().map((m: any) =>
      `[${m.direction === "inbound" ? "Cliente" : "Bot"}]: ${m.content}`
    ).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Extract key facts about the client from this conversation. Return ONLY a JSON array of {key, value} objects. Keys should be: name, company, product_interest, location, language, preference. Only include facts explicitly mentioned. Max 5 items." },
          { role: "user", content: formatted },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return;
    const result = await res.json();
    const content = result.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const facts = JSON.parse(jsonMatch[0]);
    const phoneCol = conversation.contact_phone ? "contact_phone" : conversation.contact_instagram ? "contact_instagram" : "contact_email";

    for (const fact of facts) {
      if (!fact.key || !fact.value) continue;
      await supabase.from("user_memory").upsert({
        [phoneCol]: contactId,
        key: fact.key,
        value: String(fact.value),
        updated_at: new Date().toISOString(),
      }, { onConflict: `${phoneCol},key` }).catch(() => {});
    }

    console.log(`[AI-PROCESS] Extracted ${facts.length} memory facts for ${contactId}`);
  } catch {}
}
