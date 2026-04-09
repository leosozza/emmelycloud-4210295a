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

// Fix #11: SHA-256 hash to prevent collisions
async function computeHash(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Constants ───
const RECENT_MSG_COUNT = 15;
const HISTORY_LIMIT = 30;
const MAX_CHUNKS = 20;
const RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUSES = [429, 502, 503];

// ─── Cost estimation per model (per 1M tokens, approximate USD) ───
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "google/gemini-2.5-flash-lite": { input: 0.075, output: 0.3 },
  "google/gemini-3-flash-preview": { input: 0.15, output: 0.6 },
  "google/gemini-3.1-pro-preview": { input: 1.25, output: 10.0 },
  "openai/gpt-5": { input: 2.0, output: 8.0 },
  "openai/gpt-5-mini": { input: 0.4, output: 1.6 },
  "openai/gpt-5-nano": { input: 0.1, output: 0.4 },
  "openai/gpt-5.2": { input: 3.0, output: 12.0 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

// Fix #12: Accumulator for auxiliary LLM call tokens
interface TokenAccumulator {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  aux_calls: number;
}

function newTokenAccumulator(): TokenAccumulator {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, aux_calls: 0 };
}

function accumulateUsage(acc: TokenAccumulator, usage: any) {
  acc.prompt_tokens += usage?.prompt_tokens || 0;
  acc.completion_tokens += usage?.completion_tokens || 0;
  acc.total_tokens += usage?.total_tokens || 0;
  acc.aux_calls++;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Fix #12: track all auxiliary LLM calls
  const auxTokens = newTokenAccumulator();

  try {
    const body = await req.json();
    const {
      conversation_id,
      message_text,
      agent_id,
      skip_send,
      // ─── intention_mode: coleta estruturada de campos via IA ───
      intention_mode,
      intention_fields,
      intention_collected,
      intention_turn,
    } = body;

    if (!message_text) {
      return new Response(JSON.stringify({ error: "message_text required" }), { status: 400, headers: jsonHeaders });
    }

    // ─── INTENTION MODE: extrai campos estruturados com tool calling ───────────
    if (intention_mode && intention_fields && Array.isArray(intention_fields)) {
      const result = await processIntentionMode(
        supabase,
        conversation_id,
        message_text,
        intention_fields,
        intention_collected || {},
        intention_turn || 1,
        auxTokens
      );
      return new Response(JSON.stringify(result), { headers: jsonHeaders });
    }
    // ────────────────────────────────────────────────────────────────────────────

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

      // Fix #9: Single query for channel settings (was 2 separate queries)
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
      // Store channelSetting for reuse below
      (conversation as any)._channelSetting = channelSetting;
    }

    // 4. Find agent (with multi-agent routing support)
    let agent: any = null;
    if (agent_id) {
      const { data } = await supabase.from("ai_agents").select("*").eq("id", agent_id).eq("is_active", true).single();
      agent = data;
    }
    // Fix #9: Reuse channelSetting from above instead of querying again
    if (!agent && conversation) {
      const cs = (conversation as any)._channelSetting;
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

    // 4b. Multi-agent routing — if agent has sub_agent_ids, classify intent and delegate
    if (agent.sub_agent_ids && agent.sub_agent_ids.length > 0 && conversation) {
      const routedAgent = await routeToSubAgent(supabase, agent, conversation, message_text, auxTokens);
      if (routedAgent) {
        console.log(`[AI-PROCESS] Routed to sub-agent: ${routedAgent.name}`);
        agent = routedAgent;
      }
    }

    // 5. Get conversation history (expanded to 30 messages)
    const historyResult = conversation_id ? await supabase
      .from("messages")
      .select("direction, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT) : { data: null };
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

    // 6. Get knowledge base context — try FTS, then fallback to sequential
    let knowledgeContext = "";
    const { data: linkedDocs } = await supabase
      .from("agent_knowledge_documents")
      .select("document_id")
      .eq("agent_id", agent.id);

    if (linkedDocs && linkedDocs.length > 0) {
      const docIds = linkedDocs.map((d: any) => d.document_id);
      let chunks: any[] = [];

      // Fix #1 + #8: Use native PostgreSQL FTS instead of fake LLM embeddings
      chunks = await ftsSearch(supabase, message_text, docIds);

      // Final fallback to sequential
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

    // 6a-CLAW. Inject compact history summary (inspired by compact_messages_if_needed from Claw Code)
    // When a conversation has >30 messages, the history compactor generates a structured summary
    // of older messages and injects it into the system prompt, keeping the context window lean.
    let compactSummaryContext = "";
    if (conversation_id) {
      try {
        const compactRes = await fetch(`${supabaseUrl}/functions/v1/ai-history-compactor`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ action: "get_compact_context", conversation_id }),
        });
        if (compactRes.ok) {
          const compactData = await compactRes.json();
          if (compactData.has_summary && compactData.context_prompt) {
            compactSummaryContext = `\n\n${compactData.context_prompt}\n`;
            console.log(`[AI-PROCESS] Compact context injected (${compactData.summary?.messages_summarized || 0} msgs summarized)`);
          }
          // Trigger async compaction if needed (fire-and-forget)
          fetch(`${supabaseUrl}/functions/v1/ai-history-compactor`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({ action: "compact_if_needed", conversation_id }),
          }).catch(() => {});
        }
      } catch (e) {
        console.log("[AI-PROCESS] History compactor unavailable, using inline compression");
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

    // 6c. Sentiment analysis on incoming message
    let sentimentFlag = "";
    if (conversation) {
      const sentiment = await analyzeSentiment(message_text, recentMessages, auxTokens);
      if (sentiment === "frustrated") {
        const botState = conversation.bot_state || {};
        const prevSentiment = botState.last_sentiment;
        if (prevSentiment === "frustrated") {
          console.log("[AI-PROCESS] Double frustration detected, auto-transferring to human");
          await supabase.from("conversations").update({ attendance_mode: "human" }).eq("id", conversation.id);
          const transferMsg = agent.fallback_message || "Vou transferir-te para um dos nossos atendentes. Um momento, por favor.";
          if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, transferMsg);
          await supabase.from("conversation_feedback").insert({
            conversation_id: conversation.id,
            issue_type: "auto_escalation_frustrated",
            rating: 1,
            comment: "Auto-escalated: 2x consecutive frustrated sentiment",
          }).then(() => {});
          return new Response(JSON.stringify({ transferred: "human", reason: "double_frustration" }), { headers: jsonHeaders });
        }
        await supabase.from("conversations").update({
          bot_state: { ...botState, last_sentiment: "frustrated" },
        }).eq("id", conversation.id);
        sentimentFlag = "\n⚠️ O cliente parece frustrado. Responde com empatia e oferece soluções concretas.\n";
      } else if (conversation.bot_state?.last_sentiment === "frustrated") {
        await supabase.from("conversations").update({
          bot_state: { ...conversation.bot_state, last_sentiment: null },
        }).eq("id", conversation.id);
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

    // ─── Personality Engine injection ───
    let personalityPrompt = "";
    if (agent.personality_style || agent.communication_tone || agent.strategic_objective) {
      const styleMap: Record<string, string> = {
        professional: "Comunica de forma profissional, estruturada e confiável.",
        friendly: "Comunica de forma amigável, acessível e próxima.",
        formal: "Comunica de forma formal, respeitosa e institucional.",
        casual: "Comunica de forma casual, descontraída e natural.",
        technical: "Comunica de forma técnica, precisa e detalhada.",
        persuasive: "Comunica de forma persuasiva, convincente e orientada a resultados.",
      };
      const toneMap: Record<string, string> = {
        empathetic: "Tom empático: demonstra compreensão e sensibilidade.",
        direct: "Tom directo: vai ao ponto sem rodeios.",
        encouraging: "Tom encorajador: motiva e transmite confiança.",
        neutral: "Tom neutro: equilibrado e imparcial.",
        assertive: "Tom assertivo: firme mas respeitoso.",
        warm: "Tom caloroso: acolhedor e humano.",
      };
      personalityPrompt = "\n\nPERSONALIDADE:\n";
      if (agent.personality_style && styleMap[agent.personality_style]) personalityPrompt += `- ${styleMap[agent.personality_style]}\n`;
      if (agent.communication_tone && toneMap[agent.communication_tone]) personalityPrompt += `- ${toneMap[agent.communication_tone]}\n`;
      if (agent.strategic_objective) personalityPrompt += `- OBJECTIVO ESTRATÉGICO: ${agent.strategic_objective}\n`;
    }

    // Use compact summary if available, otherwise fall back to inline compressed history
    const historySection = compactSummaryContext || compressedHistory;
    const systemPrompt = (agent.system_prompt || "") + personalityPrompt + knowledgeContext + memoryContext + historySection + contactContext + antiRepetitionPrompt + sentimentFlag + autoLangPrompt;

    console.log(`[AI-PROCESS] Context: recent=${recentMessages.length}, older=${olderMessages.length}, kb=${linkedDocs?.length || 0}, memory=${memoryContext ? "yes" : "no"}`);

    // 9. Build tools from agent_tools table (dynamic registry)
    let tools: any[] | undefined;
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
    const { apiUrl, fetchHeaders } = await resolveProvider(supabase, agent);

    if (!apiUrl) {
      const fallbackReply = agent.fallback_message || "Desculpe, não consigo responder agora.";
      if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, fallbackReply);
      await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider, 0, 0, 0, Date.now() - startTime, true, "no_api_url", auxTokens);
      return new Response(JSON.stringify({ reply: fallbackReply, fallback: true }), { headers: jsonHeaders });
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

    // ─── AI API call with retry for 429/502/503 ───
    let aiResponse: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify(aiBody),
      });

      if (aiResponse.ok || !RETRYABLE_STATUSES.includes(aiResponse.status)) break;

      console.log(`[AI-PROCESS] Retryable error ${aiResponse.status}, attempt ${attempt + 1}/2, waiting ${RETRY_DELAY_MS}ms`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    if (!aiResponse || !aiResponse.ok) {
      const errText = aiResponse ? await aiResponse.text() : "no response";
      console.error("[AI-PROCESS] AI API error:", aiResponse?.status, errText);
      const fallbackReply = agent.fallback_message || "Desculpe, não consigo responder agora.";
      if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, fallbackReply);
      await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider, 0, 0, 0, Date.now() - startTime, true, `API ${aiResponse?.status}`, auxTokens);
      return new Response(JSON.stringify({ reply: fallbackReply, fallback: true }), { headers: jsonHeaders });
    }

    const result = await aiResponse.json();

    // Handle tool calls (dynamic registry)
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

      // Fix #5: Tool follow-up with retry (same pattern as main call)
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

      let followUp: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        followUp = await fetch(apiUrl, {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify(followUpBody),
        });
        if (followUp.ok || !RETRYABLE_STATUSES.includes(followUp.status)) break;
        console.log(`[AI-PROCESS] Tool follow-up retry ${attempt + 1}/2, waiting ${RETRY_DELAY_MS}ms`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }

      if (followUp && followUp.ok) {
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

    // Fix #2: Self-evaluation opt-in per agent
    if (agent.enable_self_eval) {
      replyText = await selfEvaluate(replyText, message_text, systemPrompt, apiUrl, fetchHeaders, agent, auxTokens);
    }

    // Fix #11: SHA-256 duplicate detection
    const replyHash = await computeHash(replyText);
    const lastSent = recentBotMessages[0];
    if (lastSent && (await computeHash(lastSent)) === replyHash) {
      console.log("[AI-PROCESS] Duplicate response detected, skipping");
      return new Response(JSON.stringify({ skipped: "duplicate_response" }), { headers: jsonHeaders });
    }

    // 12. Log usage (observability) — Fix #12: includes auxiliary tokens
    const usage = result.usage || {};
    const latencyMs = Date.now() - startTime;
    console.log(`[AI-PROCESS] Usage: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}, aux_calls=${auxTokens.aux_calls}, aux_tokens=${auxTokens.total_tokens}, latency=${latencyMs}ms`);

    await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider,
      usage.prompt_tokens || 0, usage.completion_tokens || 0, usage.total_tokens || 0, latencyMs, false, null, auxTokens);

    // 13. Send the reply (Fix #10: pass supabase client)
    if (!skip_send) {
      await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, replyText);
    }

    return new Response(JSON.stringify({ reply: replyText, agent_id: agent.id, usage, content: replyText }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[AI-PROCESS] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── Fix #1 + #8: Native PostgreSQL Full-Text Search via RPC ───
async function ftsSearch(supabase: any, queryText: string, docIds: string[]): Promise<any[]> {
  try {
    // Simple tokenization — no LLM call needed
    const searchTerms = queryText
      .replace(/[^\w\sáàâãéèêíìîóòôõúùûçñ]/gi, " ")
      .split(/\s+/)
      .filter(t => t.length > 2)
      .slice(0, 10)
      .join(" ");

    if (!searchTerms) return [];

    const { data: results, error } = await supabase.rpc("search_chunks_fts", {
      search_query: searchTerms,
      doc_ids: docIds,
      max_results: MAX_CHUNKS,
    });

    if (error) {
      console.log("[AI-PROCESS] FTS search error:", error.message);
      return [];
    }

    if (results && results.length > 0) {
      console.log(`[AI-PROCESS] FTS search: ${results.length} chunks found`);
      return results;
    }
  } catch (e) {
    console.log("[AI-PROCESS] FTS search failed:", e);
  }
  return [];
}

// ─── Multi-agent router (optimized for legal domain) ───
async function routeToSubAgent(supabase: any, parentAgent: any, conversation: any, messageText: string, auxTokens: TokenAccumulator): Promise<any | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  const botState = conversation.bot_state || {};

  const { data: subAgents } = await supabase
    .from("ai_agents")
    .select("id, name, description")
    .in("id", parentAgent.sub_agent_ids)
    .eq("is_active", true);

  if (!subAgents || subAgents.length === 0) return null;

  if (botState.active_sub_agent_id) {
    const cached = subAgents.find((a: any) => a.id === botState.active_sub_agent_id);
    if (cached) {
      const shouldReroute = await detectTopicChange(apiKey, messageText, cached, subAgents);
      if (!shouldReroute) {
        const { data: fullAgent } = await supabase.from("ai_agents").select("*").eq("id", cached.id).single();
        return fullAgent;
      }
      console.log("[AI-PROCESS] Topic change detected, re-routing...");
    }
  }

  const agentList = subAgents.map((a: any) => `- "${a.name}": ${a.description || "sem descrição"}`).join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `És um router de intenções para um escritório de advocacia em Portugal e Brasil, especializado em imigração, cidadania e previdência.

Analisa a mensagem do cliente e escolhe o agente mais adequado.

Agentes disponíveis:
${agentList}

REGRAS DE ROUTING:
- Vistos, residência, AIMA, Golden Visa, cidadania, nacionalidade, passaporte → Vistos & Cidadania
- Aposentadoria, INSS, reforma, pensão, benefício social, segurança social, contribuição → Previdência & Segurança Social
- Pagamento, honorário, fatura, contrato, parcela, valor, preço, recibo → Financeiro & Contratos
- Agendamento, horário, dúvida geral, primeiro contacto, "quero saber mais", saudação → Suporte Geral & Atendimento
- Se ambíguo ou saudação simples → Suporte Geral & Atendimento`,
          },
          { role: "user", content: messageText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "route_to_agent",
            description: "Route the client message to the most appropriate specialist agent",
            parameters: {
              type: "object",
              properties: {
                agent_name: {
                  type: "string",
                  description: "The exact name of the chosen agent",
                  enum: subAgents.map((a: any) => a.name),
                },
                confidence: { type: "number", description: "Confidence score from 0 to 1" },
                detected_topic: { type: "string", description: "Brief topic detected in the message" },
              },
              required: ["agent_name", "confidence", "detected_topic"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "route_to_agent" } },
        temperature: 0,
      }),
    });

    if (!res.ok) return null;
    const result = await res.json();
    // Fix #12: Track router usage
    accumulateUsage(auxTokens, result.usage);

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const content = (result.choices?.[0]?.message?.content || "").trim();
      const chosen = subAgents.find((a: any) => content.toLowerCase().includes(a.name.toLowerCase()));
      if (chosen) return await activateSubAgent(supabase, chosen, botState, conversation, null);
      return null;
    }

    let args: any = {};
    try { args = JSON.parse(toolCall.function.arguments || "{}"); } catch {}

    const chosen = subAgents.find((a: any) => a.name === args.agent_name);
    if (chosen) {
      console.log(`[AI-PROCESS] Router: "${args.detected_topic}" → ${chosen.name} (confidence: ${args.confidence})`);
      return await activateSubAgent(supabase, chosen, botState, conversation, args.detected_topic);
    }
  } catch (e) {
    console.log("[AI-PROCESS] Router failed:", e);
  }
  return null;
}

async function activateSubAgent(supabase: any, chosen: any, botState: any, conversation: any, topic: string | null): Promise<any> {
  const { data: fullAgent } = await supabase.from("ai_agents").select("*").eq("id", chosen.id).single();
  await supabase.from("conversations").update({
    bot_state: {
      ...botState,
      active_sub_agent_id: chosen.id,
      routed_topic: topic,
      routed_at: new Date().toISOString(),
    },
  }).eq("id", conversation.id);
  return fullAgent;
}

async function detectTopicChange(apiKey: string, messageText: string, currentAgent: any, allAgents: any[]): Promise<boolean> {
  if (messageText.length < 10) return false;
  const greetings = ["olá", "oi", "bom dia", "boa tarde", "boa noite", "hello", "hi", "obrigado", "obrigada", "ok", "sim", "não"];
  if (greetings.some(g => messageText.toLowerCase().trim() === g)) return false;

  const topicKeywords: Record<string, string[]> = {
    "Vistos & Cidadania": ["visto", "cidadania", "residência", "aima", "golden visa", "passaporte", "nacionalidade", "imigração"],
    "Previdência & Segurança Social": ["aposentadoria", "inss", "reforma", "pensão", "benefício", "previdência", "contribuição"],
    "Financeiro & Contratos": ["pagamento", "honorário", "fatura", "parcela", "valor", "contrato", "pagar", "recibo"],
    "Suporte Geral & Atendimento": ["agendar", "consulta", "horário", "endereço"],
  };

  const lower = messageText.toLowerCase();
  const currentTopicKey = Object.keys(topicKeywords).find(k => currentAgent.name.includes(k.split(" ")[0]));
  const otherTopics = Object.entries(topicKeywords).filter(([k]) => k !== currentTopicKey);

  for (const [, keywords] of otherTopics) {
    if (keywords.some(kw => lower.includes(kw))) return true;
  }

  return false;
}

// ─── Sentiment analysis ─── Fix #12: tracks tokens
async function analyzeSentiment(messageText: string, recentMessages: any[], auxTokens: TokenAccumulator): Promise<string> {
  const frustratedWords = ["absurdo", "ridículo", "vergonha", "péssimo", "horrível", "lixo", "pior", "nunca mais", "inaceitável", "furioso", "raiva"];
  const lower = messageText.toLowerCase();
  const hasFrustratedWords = frustratedWords.some(w => lower.includes(w));

  if (!hasFrustratedWords && messageText.length < 200) return "neutral";

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return hasFrustratedWords ? "frustrated" : "neutral";

  try {
    const context = recentMessages.slice(-3).map(m => `[${m.role}]: ${m.content}`).join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Classify the customer sentiment in ONE word: positive, neutral, negative, frustrated. Only return the word." },
          { role: "user", content: `Recent context:\n${context}\n\nCurrent message: ${messageText}` },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) return hasFrustratedWords ? "frustrated" : "neutral";
    const result = await res.json();
    accumulateUsage(auxTokens, result.usage);
    return (result.choices?.[0]?.message?.content || "neutral").trim().toLowerCase();
  } catch {
    return hasFrustratedWords ? "frustrated" : "neutral";
  }
}

// ─── Self-evaluation / reflection ─── Fix #2: opt-in only + Fix #12: tracks tokens
async function selfEvaluate(reply: string, userMessage: string, systemPrompt: string, apiUrl: string, fetchHeaders: Record<string, string>, agent: any, auxTokens: TokenAccumulator): Promise<string> {
  if (reply.length < 50) return reply;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return reply;

  try {
    const evalRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a quality evaluator. Rate the AI response on a scale of 1-10 for: accuracy, completeness, tone appropriateness. Return ONLY a JSON object: {score: number, issue: string|null}. If score >= 7, issue should be null." },
          { role: "user", content: `User question: ${userMessage}\n\nAI response: ${reply}` },
        ],
        temperature: 0,
      }),
    });

    if (!evalRes.ok) return reply;
    const evalResult = await evalRes.json();
    accumulateUsage(auxTokens, evalResult.usage);
    const evalContent = evalResult.choices?.[0]?.message?.content || "";

    const jsonMatch = evalContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return reply;

    const evaluation = JSON.parse(jsonMatch[0]);
    if (evaluation.score >= 7) {
      console.log(`[AI-PROCESS] Self-eval score: ${evaluation.score}/10 — passed`);
      return reply;
    }

    console.log(`[AI-PROCESS] Self-eval score: ${evaluation.score}/10 — regenerating. Issue: ${evaluation.issue}`);

    const regenRes = await fetch(apiUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify({
        model: agent.ai_model,
        messages: [
          { role: "system", content: systemPrompt + `\n\n⚠️ CORRECÇÃO NECESSÁRIA: A resposta anterior teve problema: "${evaluation.issue}". Melhora a qualidade.` },
          { role: "user", content: userMessage },
        ],
        temperature: Math.min(1, Math.max(0, (agent.temperature || 0.7) * 0.8)),
      }),
    });

    if (regenRes.ok) {
      const regenResult = await regenRes.json();
      accumulateUsage(auxTokens, regenResult.usage);
      const improved = regenResult.choices?.[0]?.message?.content;
      if (improved && improved.length > 10) {
        console.log("[AI-PROCESS] Using improved response after self-eval");
        return improved;
      }
    }
  } catch (e) {
    console.log("[AI-PROCESS] Self-eval error:", e);
  }
  return reply;
}

// ─── Resolve AI provider ───
async function resolveProvider(supabase: any, agent: any): Promise<{ apiUrl: string; fetchHeaders: Record<string, string> }> {
  let apiUrl = "";
  let apiKey = "";
  let authHeader = "Authorization";
  let authPrefix = "Bearer";

  if (agent.ai_provider === "lovable") {
    apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
  } else {
    const { data: provider } = await supabase.from("ai_providers").select("*").eq("slug", agent.ai_provider).single();
    apiUrl = agent.ai_base_url || provider?.base_url || "";
    authHeader = provider?.auth_header || "";
    authPrefix = provider?.auth_prefix || "";

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
    }
  }

  const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader && apiKey) {
    fetchHeaders[authHeader] = `${authPrefix || ""} ${apiKey}`.trim();
  }
  return { apiUrl, fetchHeaders };
}

// ─── Tool execution (dynamic registry) ───
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

      case "search_knowledge": {
        const { data: allDocs } = await supabase.from("agent_knowledge_documents").select("document_id").eq("agent_id", args.agent_id || "");
        if (!allDocs || allDocs.length === 0) return { results: [] };
        const docIds = allDocs.map((d: any) => d.document_id);
        const results = await ftsSearch(supabase, args.query || "", docIds);
        return { results: results.slice(0, 5).map((r: any) => ({ content: r.content, rank: r.rank })) };
      }

      case "get_case_status": {
        const query = supabase.from("cases").select("id, title, status, legal_area, viability, updated_at").limit(5);
        if (args.title) query.ilike("title", `%${args.title}%`);
        if (args.lead_id) query.eq("lead_id", args.lead_id);
        const { data } = await query;
        return { cases: data || [] };
      }

      case "send_payment_link": {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              amount: args.amount,
              description: args.description || "Pagamento",
              client_name: args.client_name || conversation?.contact_name,
              client_email: args.client_email || conversation?.contact_email,
            }),
          });
          const result = await res.json();
          return result;
        } catch (e: any) {
          return { error: e.message || "Payment creation failed" };
        }
      }

      default: {
        const { data: toolConfig } = await supabase.from("agent_tools")
          .select("tool_parameters")
          .eq("tool_name", fnName)
          .eq("is_active", true)
          .maybeSingle();

        if (toolConfig?.tool_parameters?.webhook_url) {
          try {
            const webhookRes = await fetch(toolConfig.tool_parameters.webhook_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: fnName, args, conversation_id: conversation?.id }),
            });
            return await webhookRes.json();
          } catch (e: any) {
            return { error: `Webhook tool error: ${e.message}` };
          }
        }
        return { error: `Tool "${fnName}" not implemented` };
      }
    }
  } catch (e: any) {
    console.error(`[AI-PROCESS] Tool ${fnName} error:`, e);
    return { error: e.message || "Tool execution failed" };
  }
}

// ─── Observability: log AI usage with cost estimation ─── Fix #12: includes auxiliary tokens
async function logUsage(
  supabase: any, conversationId: string | null, agentId: string, model: string, provider: string,
  promptTokens: number, completionTokens: number, totalTokens: number, latencyMs: number,
  wasFallback: boolean, error: string | null, auxTokens?: TokenAccumulator
) {
  try {
    // Include auxiliary call tokens in the total
    const totalPrompt = promptTokens + (auxTokens?.prompt_tokens || 0);
    const totalCompletion = completionTokens + (auxTokens?.completion_tokens || 0);
    const totalAll = totalTokens + (auxTokens?.total_tokens || 0);
    const costEstimate = estimateCost(model, totalPrompt, totalCompletion);

    await supabase.from("ai_usage_logs").insert({
      conversation_id: conversationId || null,
      agent_id: agentId,
      model,
      provider,
      prompt_tokens: totalPrompt,
      completion_tokens: totalCompletion,
      total_tokens: totalAll,
      latency_ms: latencyMs,
      cost_estimate: costEstimate,
      was_fallback: wasFallback,
      error,
    });
  } catch (e) {
    console.error("[AI-PROCESS] Failed to log usage:", e);
  }
}

// ─── Send reply via message-send + save to DB + forward to Bitrix24 ───
// Fix #10: Accepts supabase client as parameter instead of creating new one
async function sendReply(supabase: any, supabaseUrl: string, serviceKey: string, conversation: any, agent: any, replyText: string) {
  // Save message and update conversation in parallel
  const [msgResult] = await Promise.allSettled([
    supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      content: replyText,
      sender_name: agent.name || "EmmelyAI",
      delivery_status: "sent",
    }),
    supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: replyText.slice(0, 100),
    }).eq("id", conversation.id),
  ]);

  if (msgResult.status === "rejected") {
    console.error("[AI-PROCESS] Failed to save message:", msgResult.reason);
  }

  // Send to external channel with error logging
  if (conversation.channel === "instagram" || conversation.channel === "whatsapp") {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ conversation_id: conversation.id, content: replyText, skip_db_save: true }),
      });
      if (!res.ok) console.error(`[AI-PROCESS] message-send failed: ${res.status}`);
    } catch (e) {
      console.error("[AI-PROCESS] message-send error:", e);
    }
  }

  // Forward to Bitrix24 with error logging
  try {
    const botMessage = `[b]${agent.name || "EmmelyAI"}[/b] - ${replyText}`;
    const res = await fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        message: botMessage,
        contactName: conversation.contact_name,
        contactId: conversation.contact_phone || conversation.contact_instagram || conversation.contact_email,
        channel: conversation.channel,
        conversationId: conversation.id,
      }),
    });
    if (!res.ok) console.error(`[AI-PROCESS] bitrix24-send failed: ${res.status}`);
  } catch (e) {
    console.error("[AI-PROCESS] Bitrix24 forward error:", e);
  }

  // Fix #3: Extract user memory with proper error logging (no silent catch)
  extractUserMemory(supabase, supabaseUrl, serviceKey, conversation, replyText)
    .catch(e => {
      console.error("[AI-PROCESS] Memory extraction error:", e);
      // Log to ai_usage_logs for observability
      supabase.from("ai_usage_logs").insert({
        conversation_id: conversation.id,
        agent_id: null,
        model: "memory_extraction",
        provider: "system",
        error: `Memory extraction failed: ${e?.message || String(e)}`,
        latency_ms: 0,
      }).catch(() => {});
    });
}

// ─── Extract user memory from conversation ───
// Fix #3: Proper error logging instead of silent catch
async function extractUserMemory(supabase: any, supabaseUrl: string, serviceKey: string, conversation: any, _lastReply: string) {
  const contactId = conversation.contact_phone || conversation.contact_instagram || conversation.contact_email;
  if (!contactId) return;

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);

  const isTransfer = conversation.attendance_mode === "human";
  const shouldExtract = isTransfer || (count && count >= 5 && count % 15 === 0);
  if (!shouldExtract) return;

  const { data: messages } = await supabase
    .from("messages")
    .select("content, direction")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!messages || messages.length < 3) return;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return;

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

  if (!res.ok) {
    throw new Error(`Memory extraction API error: ${res.status}`);
  }

  const result = await res.json();
  const content = result.choices?.[0]?.message?.content || "";

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log("[AI-PROCESS] Memory extraction: no JSON array found in response");
    return;
  }

  const facts = JSON.parse(jsonMatch[0]);
  const channel = conversation.channel || "whatsapp";

  for (const fact of facts) {
    if (!fact.key || !fact.value) continue;
    // Bug #3 fix: usa RPC upsert_user_memory com índices parciais por canal
    // em vez de ON CONFLICT genérico que falha para Instagram/Email
    const { error: upsertErr } = await supabase.rpc("upsert_user_memory", {
      p_contact_phone: conversation.contact_phone || null,
      p_contact_instagram: conversation.contact_instagram || null,
      p_contact_email: conversation.contact_email || null,
      p_channel: channel,
      p_key: fact.key,
      p_value: String(fact.value),
      p_source: "auto",
    });

    if (upsertErr) {
      console.error(`[AI-PROCESS] Memory upsert error for key "${fact.key}":`, upsertErr.message);
    }
  }

  console.log(`[AI-PROCESS] Extracted ${facts.length} memory facts for ${contactId}`);
}

// ─── INTENTION MODE: extrai campos estruturados via tool calling ─────────────
// Chamado pelo flow-engine quando um nó ai_intention está ativo.
// Usa o agente padrão para fazer uma chamada com tool calling forçado,
// extraindo os campos configurados no nó de forma conversacional.
async function processIntentionMode(
  supabase: any,
  conversationId: string,
  userMessage: string,
  fields: Array<{ name: string; label: string; type?: string; required?: boolean }>,
  alreadyCollected: Record<string, string>,
  turn: number,
  auxTokens: TokenAccumulator
): Promise<{
  intention_completed: boolean;
  intention_collected: Record<string, string>;
  next_question?: string;
}> {
  // 1. Carregar o agente padrão para usar o provedor configurado
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const model = agent?.ai_model || "google/gemini-2.5-flash";

  // 2. Identificar campos ainda não coletados
  const pendingFields = fields.filter(f => !alreadyCollected[f.name]);

  if (pendingFields.length === 0) {
    return { intention_completed: true, intention_collected: alreadyCollected };
  }

  // 3. Construir o schema de tool calling dinamicamente com base nos campos pendentes
  const toolProperties: Record<string, any> = {};
  const toolRequired: string[] = [];

  for (const field of pendingFields) {
    toolProperties[field.name] = {
      type: field.type === "number" ? "number" : "string",
      description: field.label,
    };
    // Não marcar como required para permitir extração parcial
  }

  // 4. Construir o contexto do histórico recente
  let historyContext = "";
  if (conversationId) {
    const { data: recentMsgs } = await supabase
      .from("messages")
      .select("direction, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentMsgs && recentMsgs.length > 0) {
      const msgs = recentMsgs.reverse().map((m: any) =>
        `${m.direction === "inbound" ? "Cliente" : "Assistente"}: ${m.content}`
      ).join("\n");
      historyContext = `\n\nHISTÓRICO RECENTE:\n${msgs}\n`;
    }
  }

  // 5. Campos já coletados para contexto
  const collectedContext = Object.keys(alreadyCollected).length > 0
    ? `\n\nJÁ COLETADO: ${JSON.stringify(alreadyCollected)}\n`
    : "";

  const systemPrompt = `Você é um assistente de coleta de informações.
Analise a mensagem do cliente e extraia os dados solicitados de forma natural.
Se o cliente forneceu algum dos campos pedidos, extraia-os.
Se não forneceu, gere uma pergunta natural e amigável para solicitar o próximo campo pendente.
${collectedContext}${historyContext}`;

  const userPrompt = `Mensagem do cliente: "${userMessage}"

Campos a coletar (ainda não preenchidos): ${pendingFields.map(f => `${f.name} (${f.label})`).join(", ")}

Extraia o que estiver presente na mensagem. Se não houver dados suficientes, gere a próxima pergunta.`;

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        tools: [
          {
            type: "function",
            function: {
              name: "extract_fields",
              description: "Extrai os campos coletados da mensagem do cliente",
              parameters: {
                type: "object",
                properties: {
                  extracted: {
                    type: "object",
                    description: "Campos extraídos da mensagem",
                    properties: toolProperties,
                    additionalProperties: false,
                  },
                  next_question: {
                    type: "string",
                    description: "Próxima pergunta a fazer ao cliente (se ainda há campos pendentes após esta extração)",
                  },
                  all_collected: {
                    type: "boolean",
                    description: "true se todos os campos obrigatórios foram coletados",
                  },
                },
                required: ["extracted", "all_collected"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_fields" } },
      }),
    });

    if (!res.ok) {
      console.error("[AI-PROCESS] Intention mode API error:", res.status);
      return {
        intention_completed: false,
        intention_collected: alreadyCollected,
        next_question: pendingFields[0]?.label
          ? `Pode informar o seu ${pendingFields[0].label}?`
          : undefined,
      };
    }

    const result = await res.json();
    accumulateUsage(auxTokens, result.usage);

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return {
        intention_completed: false,
        intention_collected: alreadyCollected,
        next_question: pendingFields[0]?.label
          ? `Pode informar o seu ${pendingFields[0].label}?`
          : undefined,
      };
    }

    let args: any = {};
    try { args = JSON.parse(toolCall.function.arguments); } catch {}

    // Mesclar campos extraídos com os já coletados
    const newCollected = { ...alreadyCollected };
    const extracted = args.extracted || {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        newCollected[key] = String(value).trim();
      }
    }

    // Verificar se todos os campos obrigatórios foram coletados
    const requiredFields = fields.filter(f => f.required !== false);
    const allRequiredCollected = requiredFields.every(f => newCollected[f.name]);
    const allOptionalCollected = fields.every(f => newCollected[f.name]);
    const isCompleted = args.all_collected === true || allRequiredCollected;

    console.log(`[AI-PROCESS] Intention turn ${turn}: extracted=${JSON.stringify(extracted)}, completed=${isCompleted}`);

    return {
      intention_completed: isCompleted,
      intention_collected: newCollected,
      next_question: isCompleted ? undefined : (args.next_question || undefined),
    };
  } catch (e) {
    console.error("[AI-PROCESS] Intention mode error:", e);
    return {
      intention_completed: false,
      intention_collected: alreadyCollected,
      next_question: pendingFields[0]?.label
        ? `Pode informar o seu ${pendingFields[0].label}?`
        : null,
    };
  }
}
// ─────────────────────────────────────────────────────────────────────────────
