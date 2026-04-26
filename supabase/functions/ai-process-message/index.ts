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
const MAX_REACT_ITERATIONS = 5;

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

// ─── ReACT Step Tracking ───
interface ReACTStep {
  type: "thought" | "tool_call" | "tool_result" | "reflection";
  content: string;
  tool?: string;
  params?: any;
  duration_ms?: number;
  timestamp: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const auxTokens = newTokenAccumulator();
  const reactSteps: ReACTStep[] = [];

  try {
    const body = await req.json();
    const {
      conversation_id,
      message_text,
      agent_id,
      skip_send,
      intention_mode,
      intention_fields,
      intention_collected,
      intention_turn,
      delegation_depth = 0,
    } = body;

    if (!message_text) {
      return new Response(JSON.stringify({ error: "message_text required" }), { status: 400, headers: jsonHeaders });
    }

    // ─── INTENTION MODE ───
    if (intention_mode && intention_fields && Array.isArray(intention_fields)) {
      const result = await processIntentionMode(
        supabase, conversation_id, message_text, intention_fields,
        intention_collected || {}, intention_turn || 1, auxTokens
      );
      return new Response(JSON.stringify(result), { headers: jsonHeaders });
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
      (conversation as any)._channelSetting = channelSetting;

      // Phase 4: HITL — check if there's a pending action awaiting confirmation
      const botState = conv.bot_state as any;
      if (botState?.pending_action) {
        const normalizedMsg = message_text.trim().toLowerCase();
        const isConfirm = ["sim", "yes", "confirmo", "ok", "confirmar", "s"].includes(normalizedMsg);
        const isDeny = ["não", "nao", "no", "cancelar", "n", "cancel"].includes(normalizedMsg);

        if (isConfirm || isDeny) {
          const pending = botState.pending_action;
          // Clear pending action
          const { pending_action, ...cleanState } = botState;
          await supabase.from("conversations").update({ bot_state: cleanState }).eq("id", conversation_id);

          if (isConfirm) {
            console.log(`[AI-PROCESS] HITL confirmed: executing ${pending.tool}`);
            const toolResult = await executeReACTTool(supabase, supabaseUrl, serviceKey, conv, null, pending.tool, pending.args, []);
            const confirmReply = `✅ Ação executada: ${pending.tool}. Resultado: ${JSON.stringify(toolResult).substring(0, 300)}`;
            if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conv, null, confirmReply);
            return new Response(JSON.stringify({ reply: confirmReply, hitl_executed: true }), { headers: jsonHeaders });
          } else {
            const denyReply = "❌ Ação cancelada. Como posso ajudá-lo de outra forma?";
            if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conv, null, denyReply);
            return new Response(JSON.stringify({ reply: denyReply, hitl_cancelled: true }), { headers: jsonHeaders });
          }
        }
      }
    }

    // 4. Find agent
    let agent: any = null;
    if (agent_id) {
      const { data } = await supabase.from("ai_agents").select("*").eq("id", agent_id).eq("is_active", true).single();
      agent = data;
    }
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

    // 4b. Budget enforcement
    if (agent.monthly_budget_usd && agent.monthly_budget_usd > 0) {
      try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const { data: costData } = await supabase.rpc("get_monthly_cost_by_agent", {
          p_agent_id: agent.id,
          p_month: monthStart.toISOString().slice(0, 10),
        });
        const currentCost = costData?.cost_usd || 0;
        if (currentCost >= agent.monthly_budget_usd) {
          console.log(`[AI-PROCESS] Budget exceeded for agent ${agent.name}: $${currentCost}/$${agent.monthly_budget_usd}`);
          const budgetMsg = agent.fallback_message || "Desculpe, o agente atingiu o limite de utilização. Tente novamente mais tarde.";
          if (!skip_send && conversation) await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, budgetMsg);
          return new Response(JSON.stringify({ reply: budgetMsg, budget_exceeded: true }), { headers: jsonHeaders });
        }
      } catch (e) {
        console.log("[AI-PROCESS] Budget check failed (non-blocking):", e);
      }
    }

    // 4c. Load agent skills to determine available ReACT tools
    const { data: agentSkills } = await supabase
      .from("agent_skills")
      .select("skill_type, skill_config, requires_confirmation, output_schema")
      .eq("agent_id", agent.id)
      .eq("is_enabled", true);

    // 4d. Hierarchical routing — manager agent dispatches to sub-agents
    // BUG FIX: Check governance before routing — restricted agents should not delegate
    const isAgentRestricted = agent.governance_mode === "restricted";
    if (!isAgentRestricted && agent.routing_mode === "hierarchical" && agent.sub_agent_ids?.length > 0 && delegation_depth === 0) {
      console.log(`[AI-PROCESS] Hierarchical mode: manager ${agent.name} will delegate`);
      // In hierarchical mode, the manager prompt is augmented to delegate
    } else if (!isAgentRestricted && agent.sub_agent_ids && agent.sub_agent_ids.length > 0 && conversation && agent.routing_mode !== "hierarchical") {
      const routedAgent = await routeToSubAgent(supabase, agent, conversation, message_text, auxTokens);
      if (routedAgent) {
        console.log(`[AI-PROCESS] Routed to sub-agent: ${routedAgent.name}`);
        agent = routedAgent;
      }
    }

    // 5. Get conversation history
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

    // 6. Get knowledge base context
    let knowledgeContext = "";
    const { data: linkedDocs } = await supabase
      .from("agent_knowledge_documents")
      .select("document_id")
      .eq("agent_id", agent.id);

    if (linkedDocs && linkedDocs.length > 0) {
      const docIds = linkedDocs.map((d: any) => d.document_id);
      let chunks: any[] = [];
      chunks = await ftsSearch(supabase, message_text, docIds);
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

    // 6a. Compact history summary
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
          }
          fetch(`${supabaseUrl}/functions/v1/ai-history-compactor`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({ action: "compact_if_needed", conversation_id }),
          }).catch(() => {});
        }
      } catch (e) {
        console.log("[AI-PROCESS] History compactor unavailable");
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

    // 6c. Sentiment analysis
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

    const historySection = compactSummaryContext || compressedHistory;
    // BUG FIX: Inject base_prompt (Persona Trainer) before system_prompt (Manual)
    const combinedPrompt = [(agent.base_prompt || "").trim(), (agent.system_prompt || "").trim()].filter(Boolean).join("\n\n");
    const systemPrompt = combinedPrompt + personalityPrompt + knowledgeContext + memoryContext + historySection + contactContext + antiRepetitionPrompt + sentimentFlag + autoLangPrompt;

    console.log(`[AI-PROCESS] Context: recent=${recentMessages.length}, older=${olderMessages.length}, kb=${linkedDocs?.length || 0}, memory=${memoryContext ? "yes" : "no"}`);

    // 9. Build tools — combine agent_tools + built-in ReACT tools based on skills
    const allTools: any[] = [];

    // 9a. Load dynamic tools from agent_tools table
    const { data: agentTools } = await supabase
      .from("agent_tools")
      .select("tool_name, tool_description, tool_parameters")
      .eq("agent_id", agent.id)
      .eq("is_active", true);

    if (agentTools && agentTools.length > 0) {
      for (const t of agentTools) {
        allTools.push({
          type: "function",
          function: {
            name: t.tool_name,
            description: t.tool_description || t.tool_name,
            parameters: t.tool_parameters || { type: "object", properties: {} },
          },
        });
      }
    }

    // 9b. Add built-in ReACT tools based on agent skills
    const skillTypes = new Set((agentSkills || []).map((s: any) => s.skill_type));

    // Always available: search_knowledge (if agent has KB docs)
    if (linkedDocs && linkedDocs.length > 0) {
      allTools.push({
        type: "function",
        function: {
          name: "search_knowledge",
          description: "Pesquisar na base de conhecimento do agente por informações relevantes",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Termos de pesquisa" },
            },
            required: ["query"],
          },
        },
      });
    }

    // CRM tools (if skill crm is enabled)
    if (skillTypes.has("crm") || skillTypes.has("leads")) {
      allTools.push({
        type: "function",
        function: {
          name: "query_crm",
          description: "Pesquisar leads, propostas e contratos no CRM. Pode buscar por nome, telefone, email ou área jurídica.",
          parameters: {
            type: "object",
            properties: {
              entity: { type: "string", enum: ["lead", "proposal", "contract", "case"], description: "Tipo de entidade" },
              search_term: { type: "string", description: "Nome, telefone, email ou outro termo" },
            },
            required: ["entity"],
          },
        },
      });
    }

    // Knowledge Graph navigation — gated behind crm/graph skill
    if (skillTypes.has("crm") || skillTypes.has("leads") || skillTypes.has("graph")) {
      allTools.push({
        type: "function",
        function: {
          name: "navigate_graph",
          description: "Navegar o grafo de entidades para encontrar relações entre leads, propostas, contratos e pagamentos. Ex: dado um lead, encontrar todos os contratos e pagamentos associados.",
          parameters: {
            type: "object",
            properties: {
              entity_type: { type: "string", enum: ["lead", "proposal", "contract", "case", "financial", "conversation"], description: "Tipo da entidade de partida" },
              entity_id: { type: "string", description: "ID da entidade" },
              depth: { type: "number", description: "Profundidade de navegação (1-3)", default: 2 },
            },
            required: ["entity_type", "entity_id"],
          },
        },
      });
    }

    // Payment tools
    if (skillTypes.has("payments") || skillTypes.has("financial")) {
      allTools.push({
        type: "function",
        function: {
          name: "check_payments",
          description: "Verificar pagamentos e parcelas de um contrato ou cliente",
          parameters: {
            type: "object",
            properties: {
              contract_id: { type: "string", description: "ID do contrato (opcional)" },
              status: { type: "string", enum: ["pendente", "paga", "atrasada", "cancelada"], description: "Filtrar por status" },
            },
          },
        },
      });
    }

    // Services listing
    if (skillTypes.has("services") || skillTypes.has("proposals")) {
      allTools.push({
        type: "function",
        function: {
          name: "list_services",
          description: "Listar serviços jurídicos disponíveis com preços",
          parameters: { type: "object", properties: {} },
        },
      });
    }

    // Always available: transfer to human
    allTools.push({
      type: "function",
      function: {
        name: "transfer_to_human",
        description: "Transferir a conversa para atendimento humano quando o cliente solicita ou quando não consegue resolver",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Motivo da transferência" },
          },
        },
      },
    });

    // Phase 1: Delegation tool — only if agent has sub-agents and not already delegated
    if (agent.sub_agent_ids?.length > 0 && delegation_depth < 1) {
      // Load sub-agent names for the tool description
      const { data: subAgents } = await supabase
        .from("ai_agents")
        .select("id, name, description")
        .in("id", agent.sub_agent_ids)
        .eq("is_active", true);
      const subAgentList = (subAgents || []).map((a: any) => `${a.id}: ${a.name} — ${a.description || "sem descrição"}`).join("\n");
      allTools.push({
        type: "function",
        function: {
          name: "delegate_to_agent",
          description: `Delegar uma sub-tarefa a um agente especializado. Agentes disponíveis:\n${subAgentList}`,
          parameters: {
            type: "object",
            properties: {
              agent_id: { type: "string", description: "ID do sub-agente" },
              task: { type: "string", description: "Descrição da tarefa a delegar" },
            },
            required: ["agent_id", "task"],
          },
        },
      });
    }

    // Check governance mode — restricted agents get no tools
    const isRestricted = agent.governance_mode === "restricted";
    const tools = isRestricted ? undefined : (allTools.length > 0 ? allTools : undefined);

    // 10. ReACT Loop — iterative reasoning with tool calling
    const { apiUrl, fetchHeaders } = await resolveProvider(supabase, agent);

    if (!apiUrl) {
      const fallbackReply = agent.fallback_message || "Desculpe, não consigo responder agora.";
      if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, fallbackReply);
      await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider, 0, 0, 0, Date.now() - startTime, true, "no_api_url", auxTokens, reactSteps);
      return new Response(JSON.stringify({ reply: fallbackReply, fallback: true }), { headers: jsonHeaders });
    }

    // ─── Pré-aquecimento Ollama (replica comportamento do OpenWebUI) ───
    // Garante que o modelo está em memória ANTES de inferir; suporta swap automático.
    if (agent.ai_provider !== "lovable") {
      try {
        const warmRes = await supabase.functions.invoke("ollama-warm-model", {
          body: { model: agent.ai_model },
        });
        const warmData = warmRes.data as any;
        if (warmData && warmData.ready === false) {
          const friendly = warmData.error
            || `Não foi possível preparar o modelo ${agent.ai_model} no servidor Ollama.`;
          if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, friendly);
          await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider, 0, 0, 0, Date.now() - startTime, true, "model_warmup_failed", auxTokens, reactSteps);
          return new Response(JSON.stringify({ reply: friendly, fallback: true, error: "model_warmup_failed" }), { headers: jsonHeaders });
        }
        console.log(`[AI-PROCESS] warm-up: ${agent.ai_model} ready=${warmData?.ready} was_loaded=${warmData?.was_loaded} load_ms=${warmData?.load_time_ms}`);
      } catch (warmErr) {
        console.warn("[AI-PROCESS] warm-up call failed (continuing anyway):", warmErr);
      }
    }

    // ReACT system prompt injection
    let reactSystemAddendum = tools ? `\n\nREACT MODE: Podes usar ferramentas para buscar informação antes de responder. Se precisares de dados, chama a ferramenta apropriada. Quando tiveres informação suficiente, responde diretamente ao cliente sem chamar mais ferramentas. Nunca exponhas detalhes internos das ferramentas ao cliente.\n` : "";

    // Hierarchical manager prompt
    if (agent.routing_mode === "hierarchical" && agent.sub_agent_ids?.length > 0 && delegation_depth === 0) {
      reactSystemAddendum += `\n\nHIERARCHICAL MODE: És o agente manager. Analisa a mensagem do cliente e delega sub-tarefas aos agentes especialistas via 'delegate_to_agent'. Depois consolida as respostas numa resposta final coerente. Se a mensagem é simples, podes responder directamente.\n`;
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt + reactSystemAddendum },
      ...recentMessages,
    ];

    let replyText = "";
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (let iteration = 0; iteration < MAX_REACT_ITERATIONS; iteration++) {
      const iterStart = Date.now();

      const aiBody: any = {
        model: agent.ai_model,
        messages,
        temperature: Math.min(1, Math.max(0, agent.temperature || 0.7)),
      };
      if (tools && iteration < MAX_REACT_ITERATIONS - 1) aiBody.tools = tools;

      // AI API call with retry
      let aiResponse: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        aiResponse = await fetch(apiUrl, {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify(aiBody),
        });
        if (aiResponse.ok || !RETRYABLE_STATUSES.includes(aiResponse.status)) break;
        console.log(`[AI-PROCESS] Retryable error ${aiResponse.status}, attempt ${attempt + 1}/2`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }

      if (!aiResponse || !aiResponse.ok) {
        const errText = aiResponse ? await aiResponse.text() : "no response";
        console.error("[AI-PROCESS] AI API error:", aiResponse?.status, errText);
        reactSteps.push({ type: "reflection", content: `API error: ${aiResponse?.status}`, timestamp: new Date().toISOString() });
        break;
      }

      const result = await aiResponse.json();
      const usage = result.usage || {};
      totalUsage.prompt_tokens += usage.prompt_tokens || 0;
      totalUsage.completion_tokens += usage.completion_tokens || 0;
      totalUsage.total_tokens += usage.total_tokens || 0;

      const choice = result.choices?.[0]?.message;
      const toolCalls = choice?.tool_calls;
      const content = choice?.content || "";

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls — this is the final response
        replyText = content;
        if (content) {
          reactSteps.push({
            type: "thought",
            content: `Final response (iteration ${iteration + 1})`,
            duration_ms: Date.now() - iterStart,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      // Process tool calls
      console.log(`[AI-PROCESS] ReACT iteration ${iteration + 1}: ${toolCalls.length} tool calls`);

      // Add assistant message with tool calls to conversation
      messages.push(choice);

      // Build skill lookup for HITL checks — map tool names to skill types
      const TOOL_TO_SKILL: Record<string, string> = {
        query_crm: "crm",
        navigate_graph: "crm",
        check_payments: "payments",
        list_services: "services",
        search_knowledge: "search_knowledge",
        transfer_to_human: "transfer",
        delegate_to_agent: "delegation",
      };
      const skillMap = new Map((agentSkills || []).map((s: any) => [s.skill_type, s]));

      for (const tc of toolCalls) {
        const toolStart = Date.now();
        const fnName = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}

        reactSteps.push({
          type: "tool_call",
          tool: fnName,
          params: args,
          content: `Calling ${fnName}`,
          timestamp: new Date().toISOString(),
        });

        // Phase 4: HITL — check if skill requires confirmation (using tool-to-skill mapping)
        const skillType = TOOL_TO_SKILL[fnName] || fnName;
        const matchingSkill = skillMap.get(skillType);
        if (matchingSkill?.requires_confirmation && conversation && agent.governance_mode !== "autonomous") {
          console.log(`[AI-PROCESS] HITL: tool ${fnName} requires confirmation`);
          // Save pending action in bot_state
          const pendingAction = { tool: fnName, args, tool_call_id: tc.id, iteration };
          await supabase.from("conversations").update({
            bot_state: { ...(conversation.bot_state || {}), pending_action: pendingAction },
          }).eq("id", conversation.id);

          const confirmMsg = `⏸️ **Confirmação necessária**: Pretendo executar a ação *${fnName}* com os dados: ${JSON.stringify(args)}. Responda **sim** para confirmar ou **não** para cancelar.`;
          if (!skip_send) await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, confirmMsg);

          reactSteps.push({
            type: "reflection",
            content: `HITL: awaiting confirmation for ${fnName}`,
            duration_ms: Date.now() - toolStart,
            timestamp: new Date().toISOString(),
          });

          await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider,
            totalUsage.prompt_tokens, totalUsage.completion_tokens, totalUsage.total_tokens, Date.now() - startTime, false, null, auxTokens, reactSteps);

          return new Response(JSON.stringify({ reply: confirmMsg, hitl_pending: true, agent_id: agent.id }), { headers: jsonHeaders });
        }

        // Phase 1: Delegation tool execution
        let toolResult: any;
        if (fnName === "delegate_to_agent") {
          console.log(`[AI-PROCESS] Delegating to sub-agent ${args.agent_id}`);
          try {
            const delegateRes = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                message_text: args.task,
                agent_id: args.agent_id,
                conversation_id: conversation?.id || null,
                skip_send: true,
                delegation_depth: delegation_depth + 1,
              }),
            });
            const delegateData = await delegateRes.json();
            toolResult = { response: delegateData.reply || delegateData.content || "Sem resposta do sub-agente" };
            // Accumulate sub-agent usage
            if (delegateData.usage) {
              totalUsage.prompt_tokens += delegateData.usage.prompt_tokens || 0;
              totalUsage.completion_tokens += delegateData.usage.completion_tokens || 0;
              totalUsage.total_tokens += delegateData.usage.total_tokens || 0;
            }
          } catch (e: any) {
            toolResult = { error: `Delegation failed: ${e.message}` };
          }
        } else {
          toolResult = await executeReACTTool(supabase, supabaseUrl, serviceKey, conversation, agent, fnName, args, linkedDocs || []);
        }

        // Phase 2: Apply output_schema validation if defined
        if (matchingSkill?.output_schema && typeof toolResult === "object") {
          toolResult = { _structured: true, ...toolResult };
        }

        const resultStr = JSON.stringify(toolResult);
        reactSteps.push({
          type: "tool_result",
          tool: fnName,
          content: resultStr.substring(0, 500),
          duration_ms: Date.now() - toolStart,
          timestamp: new Date().toISOString(),
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultStr,
        });
      }

      // If this was the last allowed iteration, force a response on next loop
      if (iteration === MAX_REACT_ITERATIONS - 2) {
        console.log("[AI-PROCESS] ReACT: approaching max iterations, next call without tools");
      }
    }

    if (!replyText) {
      replyText = agent.fallback_message || "";
    }
    if (!replyText) {
      return new Response(JSON.stringify({ skipped: "empty_response" }), { headers: jsonHeaders });
    }

    // Self-evaluation (opt-in)
    if (agent.enable_self_eval) {
      replyText = await selfEvaluate(replyText, message_text, systemPrompt, apiUrl, fetchHeaders, agent, auxTokens);
    }

    // Duplicate detection
    const replyHash = await computeHash(replyText);
    const lastSent = recentBotMessages[0];
    if (lastSent && (await computeHash(lastSent)) === replyHash) {
      console.log("[AI-PROCESS] Duplicate response detected, skipping");
      return new Response(JSON.stringify({ skipped: "duplicate_response" }), { headers: jsonHeaders });
    }

    // Log usage with step_details
    const latencyMs = Date.now() - startTime;
    console.log(`[AI-PROCESS] ReACT complete: ${reactSteps.length} steps, ${totalUsage.total_tokens} tokens, ${latencyMs}ms`);

    await logUsage(supabase, conversation_id, agent.id, agent.ai_model, agent.ai_provider,
      totalUsage.prompt_tokens, totalUsage.completion_tokens, totalUsage.total_tokens, latencyMs, false, null, auxTokens, reactSteps);

    // Send the reply
    if (!skip_send) {
      await sendReply(supabase, supabaseUrl, serviceKey, conversation, agent, replyText);
    }

    return new Response(JSON.stringify({ reply: replyText, agent_id: agent.id, usage: totalUsage, content: replyText, react_steps: reactSteps.length }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[AI-PROCESS] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── ReACT Tool Execution ───
async function executeReACTTool(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, agent: any, fnName: string, args: any, linkedDocs: any[]
): Promise<any> {
  console.log(`[AI-PROCESS] Executing ReACT tool: ${fnName}`, args);

  try {
    switch (fnName) {
      case "search_knowledge": {
        if (!linkedDocs || linkedDocs.length === 0) return { results: [] };
        const docIds = linkedDocs.map((d: any) => d.document_id);
        const results = await ftsSearch(supabase, args.query || "", docIds);
        return { results: results.slice(0, 5).map((r: any) => ({ content: r.content, rank: r.rank })) };
      }

      case "query_crm": {
        const entity = args.entity || "lead";
        const search = args.search_term || "";
        
        if (entity === "lead") {
          const query = supabase.from("leads").select("id, name, phone, email, funnel_stage, legal_area, ai_score, created_at").limit(5);
          if (search) query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
          const { data } = await query;
          return { leads: data || [] };
        }
        if (entity === "proposal") {
          const query = supabase.from("proposals").select("id, title, status, value, client_name, created_at").limit(5);
          if (search) query.or(`title.ilike.%${search}%,client_name.ilike.%${search}%`);
          const { data } = await query;
          return { proposals: data || [] };
        }
        if (entity === "contract") {
          const query = supabase.from("contracts").select("id, status, signer_name, signed_at, created_at").limit(5);
          if (search) query.ilike("signer_name", `%${search}%`);
          const { data } = await query;
          return { contracts: data || [] };
        }
        if (entity === "case") {
          const query = supabase.from("cases").select("id, title, status, legal_area, viability, updated_at").limit(5);
          if (search) query.ilike("title", `%${search}%`);
          const { data } = await query;
          return { cases: data || [] };
        }
        return { error: "Unknown entity type" };
      }

      case "navigate_graph": {
        const depth = Math.min(args.depth || 2, 3);
        const visited = new Set<string>();
        const results: any[] = [];

        async function traverse(type: string, id: string, currentDepth: number) {
          const key = `${type}:${id}`;
          if (visited.has(key) || currentDepth > depth) return;
          visited.add(key);

          const { data: edges } = await supabase
            .from("entity_graph")
            .select("*")
            .or(`and(source_type.eq.${type},source_id.eq.${id}),and(target_type.eq.${type},target_id.eq.${id})`)
            .limit(20);

          if (!edges) return;

          for (const edge of edges) {
            results.push({
              from: `${edge.source_type}:${edge.source_id}`,
              to: `${edge.target_type}:${edge.target_id}`,
              relation: edge.relation,
              metadata: edge.metadata,
            });

            const nextType = edge.source_type === type && edge.source_id === id ? edge.target_type : edge.source_type;
            const nextId = edge.source_type === type && edge.source_id === id ? edge.target_id : edge.source_id;
            await traverse(nextType, nextId, currentDepth + 1);
          }
        }

        await traverse(args.entity_type, args.entity_id, 1);
        return { graph: results, nodes_visited: visited.size };
      }

      case "check_payments": {
        const query = supabase.from("financial_records")
          .select("id, total_value, status, due_date, paid_at, installment_number, total_installments")
          .order("due_date", { ascending: true })
          .limit(10);
        if (args.contract_id) query.eq("contract_id", args.contract_id);
        if (args.status) query.eq("status", args.status);
        const { data } = await query;
        return { payments: data || [] };
      }

      case "list_services": {
        const { data } = await supabase.from("proposal_templates")
          .select("id, name, description, template_type")
          .eq("is_active", true)
          .limit(20);
        return { services: data || [] };
      }

      case "transfer_to_human": {
        if (conversation) {
          await supabase.from("conversations").update({ attendance_mode: "human" }).eq("id", conversation.id);
        }
        return { success: true, message: "Conversa transferida para atendimento humano." };
      }

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
          return await res.json();
        } catch (e: any) {
          return { error: e.message || "Payment creation failed" };
        }
      }

      case "schedule_callback": {
        return { success: true, message: `Callback agendado para ${args.datetime || "a definir"} — ${args.reason || "contacto de retorno"}` };
      }

      default: {
        // Try webhook-based tools from agent_tools
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

// ─── FTS Search ───
async function ftsSearch(supabase: any, queryText: string, docIds: string[]): Promise<any[]> {
  try {
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
    if (error) { console.log("[AI-PROCESS] FTS error:", error.message); return []; }
    if (results && results.length > 0) {
      console.log(`[AI-PROCESS] FTS: ${results.length} chunks found`);
      return results;
    }
  } catch (e) { console.log("[AI-PROCESS] FTS failed:", e); }
  return [];
}

// ─── Multi-agent router ───
async function routeToSubAgent(supabase: any, parentAgent: any, conversation: any, messageText: string, auxTokens: TokenAccumulator): Promise<any | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const botState = conversation.bot_state || {};
  const { data: subAgents } = await supabase
    .from("ai_agents").select("id, name, description")
    .in("id", parentAgent.sub_agent_ids).eq("is_active", true);
  if (!subAgents || subAgents.length === 0) return null;

  if (botState.active_sub_agent_id) {
    const cached = subAgents.find((a: any) => a.id === botState.active_sub_agent_id);
    if (cached) {
      const shouldReroute = await detectTopicChange(apiKey, messageText, cached, subAgents);
      if (!shouldReroute) {
        const { data: fullAgent } = await supabase.from("ai_agents").select("*").eq("id", cached.id).single();
        return fullAgent;
      }
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
          { role: "system", content: `És um router de intenções para um escritório de advocacia em Portugal e Brasil, especializado em imigração, cidadania e previdência.\n\nAgentes disponíveis:\n${agentList}\n\nREGRAS DE ROUTING:\n- Vistos, residência, AIMA, Golden Visa, cidadania, nacionalidade, passaporte → Vistos & Cidadania\n- Aposentadoria, INSS, reforma, pensão, benefício social, segurança social → Previdência\n- Pagamento, honorário, fatura, contrato, parcela, valor, preço → Financeiro\n- Agendamento, dúvida geral, saudação → Suporte Geral` },
          { role: "user", content: messageText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "route_to_agent",
            description: "Route to specialist",
            parameters: {
              type: "object",
              properties: {
                agent_name: { type: "string", enum: subAgents.map((a: any) => a.name) },
                confidence: { type: "number" },
                detected_topic: { type: "string" },
              },
              required: ["agent_name", "confidence", "detected_topic"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "route_to_agent" } },
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const result = await res.json();
    accumulateUsage(auxTokens, result.usage);
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const content = (result.choices?.[0]?.message?.content || "").trim();
      const chosen = subAgents.find((a: any) => content.toLowerCase().includes(a.name.toLowerCase()));
      if (chosen) return await activateSubAgent(supabase, chosen, botState, conversation, null);
      return null;
    }
    let tArgs: any = {};
    try { tArgs = JSON.parse(toolCall.function.arguments || "{}"); } catch {}
    const chosen = subAgents.find((a: any) => a.name === tArgs.agent_name);
    if (chosen) {
      console.log(`[AI-PROCESS] Router: "${tArgs.detected_topic}" → ${chosen.name} (confidence: ${tArgs.confidence})`);
      return await activateSubAgent(supabase, chosen, botState, conversation, tArgs.detected_topic);
    }
  } catch (e) { console.log("[AI-PROCESS] Router failed:", e); }
  return null;
}

async function activateSubAgent(supabase: any, chosen: any, botState: any, conversation: any, topic: string | null): Promise<any> {
  const { data: fullAgent } = await supabase.from("ai_agents").select("*").eq("id", chosen.id).single();
  await supabase.from("conversations").update({
    bot_state: { ...botState, active_sub_agent_id: chosen.id, routed_topic: topic, routed_at: new Date().toISOString() },
  }).eq("id", conversation.id);
  return fullAgent;
}

async function detectTopicChange(apiKey: string, messageText: string, currentAgent: any, _allAgents: any[]): Promise<boolean> {
  if (messageText.length < 10) return false;
  const greetings = ["olá", "oi", "bom dia", "boa tarde", "boa noite", "hello", "hi", "obrigado", "obrigada", "ok", "sim", "não"];
  if (greetings.some(g => messageText.toLowerCase().trim() === g)) return false;
  const topicKeywords: Record<string, string[]> = {
    "Vistos & Cidadania": ["visto", "cidadania", "residência", "aima", "golden visa", "passaporte", "nacionalidade"],
    "Previdência & Segurança Social": ["aposentadoria", "inss", "reforma", "pensão", "benefício", "previdência"],
    "Financeiro & Contratos": ["pagamento", "honorário", "fatura", "parcela", "valor", "contrato", "pagar"],
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

// ─── Sentiment analysis ───
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
  } catch { return hasFrustratedWords ? "frustrated" : "neutral"; }
}

// ─── Self-evaluation ───
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
          { role: "system", content: "You are a quality evaluator. Rate the AI response 1-10 for: accuracy, completeness, tone. Return ONLY JSON: {score: number, issue: string|null}." },
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
    if (evaluation.score >= 7) return reply;
    console.log(`[AI-PROCESS] Self-eval: ${evaluation.score}/10 — regenerating. Issue: ${evaluation.issue}`);
    const regenRes = await fetch(apiUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify({
        model: agent.ai_model,
        messages: [
          { role: "system", content: systemPrompt + `\n\n⚠️ CORRECÇÃO: "${evaluation.issue}". Melhora a qualidade.` },
          { role: "user", content: userMessage },
        ],
        temperature: Math.min(1, Math.max(0, (agent.temperature || 0.7) * 0.8)),
      }),
    });
    if (regenRes.ok) {
      const regenResult = await regenRes.json();
      accumulateUsage(auxTokens, regenResult.usage);
      const improved = regenResult.choices?.[0]?.message?.content;
      if (improved && improved.length > 10) return improved;
    }
  } catch (e) { console.log("[AI-PROCESS] Self-eval error:", e); }
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
        .from("integration_credentials").select("credential_value")
        .eq("provider", agent.ai_provider).eq("credential_key", "OLLAMA_BASE_URL").single();
      if (urlOverride?.credential_value) {
        let baseUrl = urlOverride.credential_value.replace(/\/+$/, "");
        if (!baseUrl.endsWith("/v1/chat/completions")) baseUrl += "/v1/chat/completions";
        apiUrl = baseUrl;
      }
    }
    const credKey = agent.ai_api_key_credential || (provider?.credential_key !== "base_url" ? provider?.credential_key : null);
    if (credKey) {
      const { data: cred } = await supabase
        .from("integration_credentials").select("credential_value")
        .eq("provider", agent.ai_provider).eq("credential_key", credKey).single();
      apiKey = cred?.credential_value || "";
    }
  }

  const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader && apiKey) fetchHeaders[authHeader] = `${authPrefix || ""} ${apiKey}`.trim();
  return { apiUrl, fetchHeaders };
}

// ─── Log usage with step_details ───
async function logUsage(
  supabase: any, conversationId: string | null, agentId: string, model: string, provider: string,
  promptTokens: number, completionTokens: number, totalTokens: number, latencyMs: number,
  wasFallback: boolean, error: string | null, auxTokens?: TokenAccumulator, steps?: ReACTStep[]
) {
  try {
    const totalPrompt = promptTokens + (auxTokens?.prompt_tokens || 0);
    const totalCompletion = completionTokens + (auxTokens?.completion_tokens || 0);
    const totalAll = totalTokens + (auxTokens?.total_tokens || 0);
    const costEstimate = estimateCost(model, totalPrompt, totalCompletion);

    const logEntry: any = {
      conversation_id: conversationId || null,
      agent_id: agentId,
      model, provider,
      prompt_tokens: totalPrompt,
      completion_tokens: totalCompletion,
      total_tokens: totalAll,
      latency_ms: latencyMs,
      cost_estimate: costEstimate,
      was_fallback: wasFallback,
      error,
    };

    if (steps && steps.length > 0) {
      logEntry.step_details = steps;
    }

    await supabase.from("ai_usage_logs").insert(logEntry);
  } catch (e) {
    console.error("[AI-PROCESS] Failed to log usage:", e);
  }
}

// ─── Send reply ───
async function sendReply(supabase: any, supabaseUrl: string, serviceKey: string, conversation: any, agent: any, replyText: string) {
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
  if (msgResult.status === "rejected") console.error("[AI-PROCESS] Failed to save message:", msgResult.reason);

  if (conversation.channel === "instagram" || conversation.channel === "whatsapp") {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ conversation_id: conversation.id, content: replyText, skip_db_save: true }),
      });
      if (!res.ok) console.error(`[AI-PROCESS] message-send failed: ${res.status}`);
    } catch (e) { console.error("[AI-PROCESS] message-send error:", e); }
  }

  try {
    const agentDisplayName = agent.name || "EmmelyAI";
    const botMessage = `[b]${agentDisplayName}[/b] - ${replyText}`;
    const res = await fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        message: botMessage,
        contactName: conversation.contact_name,
        contactId: conversation.contact_phone || conversation.contact_instagram || conversation.contact_email,
        channel: conversation.channel,
        conversationId: conversation.id,
        agentName: agentDisplayName,
        silent: true,
      }),
    });
    if (!res.ok) console.error(`[AI-PROCESS] bitrix24-send failed: ${res.status}`);
  } catch (e) { console.error("[AI-PROCESS] Bitrix24 forward error:", e); }

  extractUserMemory(supabase, supabaseUrl, serviceKey, conversation, replyText)
    .catch(e => {
      console.error("[AI-PROCESS] Memory extraction error:", e);
      supabase.from("ai_usage_logs").insert({
        conversation_id: conversation.id, agent_id: null, model: "memory_extraction",
        provider: "system", error: `Memory extraction failed: ${e?.message || String(e)}`, latency_ms: 0,
      }).catch(() => {});
    });
}

// ─── Extract user memory ───
async function extractUserMemory(supabase: any, supabaseUrl: string, serviceKey: string, conversation: any, _lastReply: string) {
  const contactId = conversation.contact_phone || conversation.contact_instagram || conversation.contact_email;
  if (!contactId) return;
  const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversation.id);
  const isTransfer = conversation.attendance_mode === "human";
  const shouldExtract = isTransfer || (count && count >= 5 && count % 15 === 0);
  if (!shouldExtract) return;
  const { data: messages } = await supabase.from("messages").select("content, direction")
    .eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(10);
  if (!messages || messages.length < 3) return;
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return;
  const formatted = messages.reverse().map((m: any) => `[${m.direction === "inbound" ? "Cliente" : "Bot"}]: ${m.content}`).join("\n");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Extract key facts about the client. Return ONLY a JSON array of {key, value}. Keys: name, company, product_interest, location, language, preference. Max 5 items." },
        { role: "user", content: formatted },
      ],
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Memory extraction API error: ${res.status}`);
  const result = await res.json();
  const content = result.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return;
  const facts = JSON.parse(jsonMatch[0]);
  const channel = conversation.channel || "whatsapp";
  for (const fact of facts) {
    if (!fact.key || !fact.value) continue;
    const { error: upsertErr } = await supabase.rpc("upsert_user_memory", {
      p_contact_phone: conversation.contact_phone || null,
      p_contact_instagram: conversation.contact_instagram || null,
      p_contact_email: conversation.contact_email || null,
      p_channel: channel, p_key: fact.key, p_value: String(fact.value), p_source: "auto",
    });
    if (upsertErr) console.error(`[AI-PROCESS] Memory upsert error for "${fact.key}":`, upsertErr.message);
  }
  console.log(`[AI-PROCESS] Extracted ${facts.length} memory facts for ${contactId}`);
}

// ─── INTENTION MODE ───
async function processIntentionMode(
  supabase: any, conversationId: string, userMessage: string,
  fields: Array<{ name: string; label: string; type?: string; required?: boolean }>,
  alreadyCollected: Record<string, string>, turn: number, auxTokens: TokenAccumulator
): Promise<{ intention_completed: boolean; intention_collected: Record<string, string>; next_question?: string }> {
  const { data: agent } = await supabase.from("ai_agents").select("*").eq("is_default", true).eq("is_active", true).maybeSingle();
  const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const model = agent?.ai_model || "google/gemini-2.5-flash";
  const pendingFields = fields.filter(f => !alreadyCollected[f.name]);
  if (pendingFields.length === 0) return { intention_completed: true, intention_collected: alreadyCollected };

  const toolProperties: Record<string, any> = {};
  for (const field of pendingFields) {
    toolProperties[field.name] = { type: field.type === "number" ? "number" : "string", description: field.label };
  }

  let historyContext = "";
  if (conversationId) {
    const { data: recentMsgs } = await supabase.from("messages").select("direction, content")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(10);
    if (recentMsgs && recentMsgs.length > 0) {
      historyContext = `\n\nHISTÓRICO:\n${recentMsgs.reverse().map((m: any) => `${m.direction === "inbound" ? "Cliente" : "Assistente"}: ${m.content}`).join("\n")}\n`;
    }
  }

  const collectedContext = Object.keys(alreadyCollected).length > 0 ? `\n\nJÁ COLETADO: ${JSON.stringify(alreadyCollected)}\n` : "";

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `Você é um assistente de coleta de informações. Extraia dados da mensagem do cliente.${collectedContext}${historyContext}` },
          { role: "user", content: `Mensagem: "${userMessage}"\nCampos pendentes: ${pendingFields.map(f => `${f.name} (${f.label})`).join(", ")}` },
        ],
        temperature: 0.2,
        tools: [{
          type: "function",
          function: {
            name: "extract_fields",
            description: "Extrai campos da mensagem",
            parameters: {
              type: "object",
              properties: {
                extracted: { type: "object", properties: toolProperties },
                next_question: { type: "string" },
                all_collected: { type: "boolean" },
              },
              required: ["extracted", "all_collected"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_fields" } },
      }),
    });

    if (!res.ok) {
      return { intention_completed: false, intention_collected: alreadyCollected, next_question: `Pode informar o seu ${pendingFields[0]?.label}?` };
    }

    const result = await res.json();
    accumulateUsage(auxTokens, result.usage);
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return { intention_completed: false, intention_collected: alreadyCollected, next_question: `Pode informar o seu ${pendingFields[0]?.label}?` };
    }

    let tArgs: any = {};
    try { tArgs = JSON.parse(toolCall.function.arguments); } catch {}
    const newCollected = { ...alreadyCollected };
    const extracted = tArgs.extracted || {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && String(value).trim() !== "") newCollected[key] = String(value).trim();
    }
    const requiredFields = fields.filter(f => f.required !== false);
    const allRequiredCollected = requiredFields.every(f => newCollected[f.name]);
    const isCompleted = tArgs.all_collected === true || allRequiredCollected;
    return { intention_completed: isCompleted, intention_collected: newCollected, next_question: isCompleted ? undefined : tArgs.next_question };
  } catch (e) {
    console.error("[AI-PROCESS] Intention mode error:", e);
    return { intention_completed: false, intention_collected: alreadyCollected, next_question: `Pode informar o seu ${pendingFields[0]?.label}?` };
  }
}
