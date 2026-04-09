/**
 * AI Session Runtime — EmmelyCloud
 *
 * Inspirado no padrão QueryEnginePort + PortRuntime do Claw Code:
 * - Separação clara entre contexto, roteamento, execução e persistência
 * - TurnResult tipado com stop_reason explícito (como Claw Code)
 * - Budget de tokens por sessão (max_budget_tokens)
 * - Transcript compactável e persistível
 * - HistoryLog de eventos auditáveis por sessão
 * - Tool registry com permissões (inspirado em ToolPermissionContext do Claw)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Tipos inspirados no Claw Code ───────────────────────────────────────────

/** Resultado de um turno de conversa (espelho do TurnResult do Claw) */
interface TurnResult {
  session_id: string;
  turn: number;
  prompt: string;
  output: string;
  stop_reason: "completed" | "max_turns_reached" | "max_budget_reached" | "human_escalation" | "error" | "duplicate_skipped";
  matched_tools: string[];
  denied_tools: string[];
  usage: UsageSummary;
  latency_ms: number;
  agent_id: string;
  routed_sub_agent?: string;
}

/** Resumo de uso de tokens (espelho do UsageSummary do Claw) */
interface UsageSummary {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  aux_calls: number;
  estimated_cost_usd: number;
}

/** Evento de histórico auditável (espelho do HistoryEvent do Claw) */
interface SessionHistoryEvent {
  title: string;
  detail: string;
  timestamp: string;
}

/** Configuração do engine de sessão (espelho do QueryEngineConfig do Claw) */
interface SessionEngineConfig {
  max_turns: number;           // Máximo de turnos por sessão (default: 50)
  max_budget_tokens: number;   // Budget máximo de tokens por sessão (default: 100_000)
  compact_after_turns: number; // Compactar histórico após N turnos (default: 20)
  enable_self_eval: boolean;   // Habilitar auto-avaliação (default: false)
  enable_sentiment: boolean;   // Habilitar análise de sentimento (default: true)
  enable_memory: boolean;      // Habilitar extração de memória (default: true)
}

/** Sessão de runtime completa (espelho do RuntimeSession do Claw) */
interface RuntimeSession {
  session_id: string;
  conversation_id: string;
  agent_id: string;
  config: SessionEngineConfig;
  turn_count: number;
  total_usage: UsageSummary;
  history_events: SessionHistoryEvent[];
  last_turn_result?: TurnResult;
  created_at: string;
  updated_at: string;
}

/** Ferramenta registrada com permissões (inspirado em ToolPermissionContext do Claw) */
interface RegisteredTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  is_active: boolean;
  requires_human_approval: boolean; // Ferramentas destrutivas precisam de aprovação
  category: "crm" | "payment" | "knowledge" | "communication" | "system" | "custom";
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SessionEngineConfig = {
  max_turns: 50,
  max_budget_tokens: 100_000,
  compact_after_turns: 20,
  enable_self_eval: false,
  enable_sentiment: true,
  enable_memory: true,
};

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "google/gemini-2.5-flash-lite": { input: 0.075, output: 0.3 },
  "openai/gpt-5": { input: 2.0, output: 8.0 },
  "openai/gpt-5-mini": { input: 0.4, output: 1.6 },
};

// ─── Funções de persistência de sessão (inspirado em session_store.py do Claw) ─

async function loadSession(supabase: any, conversationId: string): Promise<RuntimeSession | null> {
  const { data } = await supabase
    .from("ai_sessions")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function saveSession(supabase: any, session: RuntimeSession): Promise<void> {
  await supabase
    .from("ai_sessions")
    .upsert({
      session_id: session.session_id,
      conversation_id: session.conversation_id,
      agent_id: session.agent_id,
      config: session.config,
      turn_count: session.turn_count,
      total_usage: session.total_usage,
      history_events: session.history_events,
      last_turn_result: session.last_turn_result,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id" });
}

function newSession(conversationId: string, agentId: string, configOverride?: Partial<SessionEngineConfig>): RuntimeSession {
  return {
    session_id: crypto.randomUUID(),
    conversation_id: conversationId,
    agent_id: agentId,
    config: { ...DEFAULT_CONFIG, ...configOverride },
    turn_count: 0,
    total_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, aux_calls: 0, estimated_cost_usd: 0 },
    history_events: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── HistoryLog (espelho do HistoryLog do Claw) ────────────────────────────────

function addHistoryEvent(session: RuntimeSession, title: string, detail: string): void {
  session.history_events.push({
    title,
    detail,
    timestamp: new Date().toISOString(),
  });
  // Manter apenas os últimos 100 eventos (compactação inspirada no Claw)
  if (session.history_events.length > 100) {
    session.history_events = session.history_events.slice(-100);
  }
}

// ─── Budget check (inspirado em max_budget_tokens do Claw) ────────────────────

function checkBudget(session: RuntimeSession, estimatedNewTokens: number): "ok" | "max_turns_reached" | "max_budget_reached" {
  if (session.turn_count >= session.config.max_turns) return "max_turns_reached";
  if (session.total_usage.total_tokens + estimatedNewTokens > session.config.max_budget_tokens) return "max_budget_reached";
  return "ok";
}

// ─── Tool Registry (inspirado em ToolPermissionContext do Claw) ────────────────

async function loadToolRegistry(supabase: any, agentId: string): Promise<RegisteredTool[]> {
  const { data: agentTools } = await supabase
    .from("agent_tools")
    .select("tool_name, tool_description, tool_parameters, is_active")
    .eq("agent_id", agentId)
    .eq("is_active", true);

  if (!agentTools || agentTools.length === 0) return [];

  return agentTools.map((t: any) => ({
    name: t.tool_name,
    description: t.tool_description || t.tool_name,
    parameters: t.tool_parameters || { type: "object", properties: {} },
    is_active: t.is_active,
    requires_human_approval: ["delete_lead", "delete_case", "send_payment_link"].includes(t.tool_name),
    category: inferToolCategory(t.tool_name),
  }));
}

function inferToolCategory(toolName: string): RegisteredTool["category"] {
  if (toolName.startsWith("create_") || toolName.startsWith("update_") || toolName.startsWith("search_lead") || toolName.startsWith("get_case")) return "crm";
  if (toolName.includes("payment") || toolName.includes("invoice")) return "payment";
  if (toolName.includes("knowledge") || toolName.includes("search_kb")) return "knowledge";
  if (toolName.includes("send_") || toolName.includes("transfer_") || toolName.includes("schedule_")) return "communication";
  return "custom";
}

function filterDeniedTools(tools: RegisteredTool[], agentPermissions: string[]): { allowed: RegisteredTool[]; denied: string[] } {
  const denied: string[] = [];
  const allowed = tools.filter(t => {
    if (t.requires_human_approval && !agentPermissions.includes(t.name)) {
      denied.push(t.name);
      return false;
    }
    return true;
  });
  return { allowed, denied };
}

// ─── Estimativa de custo ───────────────────────────────────────────────────────

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

function mergeUsage(session: RuntimeSession, usage: any, auxCalls: number = 0): void {
  const p = usage?.prompt_tokens || 0;
  const c = usage?.completion_tokens || 0;
  const t = usage?.total_tokens || 0;
  session.total_usage.prompt_tokens += p;
  session.total_usage.completion_tokens += c;
  session.total_usage.total_tokens += t;
  session.total_usage.aux_calls += auxCalls;
}

// ─── Endpoint principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { action, conversation_id, agent_id, config_override } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {

      // ── Inicializar ou retomar sessão ─────────────────────────────────────────
      case "init_session": {
        if (!conversation_id || !agent_id) {
          return new Response(JSON.stringify({ error: "conversation_id and agent_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Tentar retomar sessão existente (como from_saved_session do Claw)
        let session = await loadSession(supabase, conversation_id);
        if (!session || session.agent_id !== agent_id) {
          session = newSession(conversation_id, agent_id, config_override);
          addHistoryEvent(session, "session_created", `agent=${agent_id}, config=${JSON.stringify(session.config)}`);
        } else {
          addHistoryEvent(session, "session_resumed", `turn=${session.turn_count}, tokens=${session.total_usage.total_tokens}`);
        }

        // Carregar registry de ferramentas
        const tools = await loadToolRegistry(supabase, agent_id);
        const agentPermissions: string[] = []; // Pode ser expandido com permissões por agente
        const { allowed, denied } = filterDeniedTools(tools, agentPermissions);

        addHistoryEvent(session, "tools_loaded", `total=${tools.length}, allowed=${allowed.length}, denied=${denied.length}`);
        await saveSession(supabase, session);

        return new Response(JSON.stringify({
          session_id: session.session_id,
          turn_count: session.turn_count,
          total_usage: session.total_usage,
          config: session.config,
          tools_allowed: allowed.map(t => t.name),
          tools_denied: denied,
          budget_remaining: session.config.max_budget_tokens - session.total_usage.total_tokens,
          turns_remaining: session.config.max_turns - session.turn_count,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Registrar resultado de um turno ──────────────────────────────────────
      case "record_turn": {
        const { session_id, turn_result } = body;
        if (!session_id || !turn_result) {
          return new Response(JSON.stringify({ error: "session_id and turn_result required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: sessionData } = await supabase
          .from("ai_sessions")
          .select("*")
          .eq("session_id", session_id)
          .single();

        if (!sessionData) {
          return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const session: RuntimeSession = sessionData;
        session.turn_count++;
        mergeUsage(session, turn_result.usage, turn_result.usage?.aux_calls || 0);
        session.total_usage.estimated_cost_usd = estimateCost(
          turn_result.model || "google/gemini-2.5-flash",
          session.total_usage.prompt_tokens,
          session.total_usage.completion_tokens
        );
        session.last_turn_result = turn_result;
        session.updated_at = new Date().toISOString();

        addHistoryEvent(session, "turn_completed", `turn=${session.turn_count}, stop_reason=${turn_result.stop_reason}, tokens=${turn_result.usage?.total_tokens || 0}`);

        // Verificar budget após o turno (como compact_messages_if_needed do Claw)
        const budgetStatus = checkBudget(session, 0);
        if (budgetStatus !== "ok") {
          addHistoryEvent(session, "budget_limit", `reason=${budgetStatus}, total_tokens=${session.total_usage.total_tokens}`);
        }

        await saveSession(supabase, session);

        return new Response(JSON.stringify({
          session_id: session.session_id,
          turn_count: session.turn_count,
          total_usage: session.total_usage,
          budget_status: budgetStatus,
          turns_remaining: Math.max(0, session.config.max_turns - session.turn_count),
          budget_remaining: Math.max(0, session.config.max_budget_tokens - session.total_usage.total_tokens),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Obter resumo da sessão (como render_summary do Claw) ─────────────────
      case "get_summary": {
        const { session_id } = body;
        if (!session_id) {
          return new Response(JSON.stringify({ error: "session_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: session } = await supabase
          .from("ai_sessions")
          .select("*")
          .eq("session_id", session_id)
          .single();

        if (!session) {
          return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Renderizar como markdown (como render_summary do Claw)
        const markdown = renderSessionSummary(session);

        return new Response(JSON.stringify({
          session,
          markdown,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Listar sessões de uma conversa ────────────────────────────────────────
      case "list_sessions": {
        if (!conversation_id) {
          return new Response(JSON.stringify({ error: "conversation_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: sessions } = await supabase
          .from("ai_sessions")
          .select("session_id, agent_id, turn_count, total_usage, created_at, updated_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(10);

        return new Response(JSON.stringify({ sessions: sessions || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Verificar budget antes de um turno ────────────────────────────────────
      case "check_budget": {
        const { session_id, estimated_tokens } = body;
        if (!session_id) {
          return new Response(JSON.stringify({ error: "session_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: session } = await supabase
          .from("ai_sessions")
          .select("*")
          .eq("session_id", session_id)
          .single();

        if (!session) {
          return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const status = checkBudget(session, estimated_tokens || 1000);

        return new Response(JSON.stringify({
          status,
          can_proceed: status === "ok",
          turns_remaining: Math.max(0, session.config.max_turns - session.turn_count),
          budget_remaining: Math.max(0, session.config.max_budget_tokens - session.total_usage.total_tokens),
          total_usage: session.total_usage,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Obter analytics de sessões ────────────────────────────────────────────
      case "get_analytics": {
        const { start_date, end_date } = body;

        const query = supabase
          .from("ai_sessions")
          .select("agent_id, turn_count, total_usage, created_at");

        if (start_date) query.gte("created_at", start_date);
        if (end_date) query.lte("created_at", end_date);

        const { data: sessions } = await query.limit(1000);

        if (!sessions || sessions.length === 0) {
          return new Response(JSON.stringify({ analytics: null, message: "No sessions found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const analytics = {
          total_sessions: sessions.length,
          total_turns: sessions.reduce((sum: number, s: any) => sum + (s.turn_count || 0), 0),
          total_tokens: sessions.reduce((sum: number, s: any) => sum + (s.total_usage?.total_tokens || 0), 0),
          total_cost_usd: sessions.reduce((sum: number, s: any) => sum + (s.total_usage?.estimated_cost_usd || 0), 0),
          avg_turns_per_session: 0,
          avg_tokens_per_session: 0,
          by_agent: {} as Record<string, { sessions: number; turns: number; tokens: number; cost: number }>,
        };

        analytics.avg_turns_per_session = analytics.total_turns / analytics.total_sessions;
        analytics.avg_tokens_per_session = analytics.total_tokens / analytics.total_sessions;

        for (const s of sessions) {
          const agentId = s.agent_id || "unknown";
          if (!analytics.by_agent[agentId]) {
            analytics.by_agent[agentId] = { sessions: 0, turns: 0, tokens: 0, cost: 0 };
          }
          analytics.by_agent[agentId].sessions++;
          analytics.by_agent[agentId].turns += s.turn_count || 0;
          analytics.by_agent[agentId].tokens += s.total_usage?.total_tokens || 0;
          analytics.by_agent[agentId].cost += s.total_usage?.estimated_cost_usd || 0;
        }

        return new Response(JSON.stringify({ analytics }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[AI-SESSION-RUNTIME] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ─── Render session summary (como render_summary do Claw) ─────────────────────

function renderSessionSummary(session: RuntimeSession): string {
  const lines = [
    "# AI Session Summary",
    "",
    `**Session ID:** ${session.session_id}`,
    `**Conversation:** ${session.conversation_id}`,
    `**Agent:** ${session.agent_id}`,
    `**Created:** ${session.created_at}`,
    `**Updated:** ${session.updated_at}`,
    "",
    "## Usage",
    `- Turns: ${session.turn_count} / ${session.config.max_turns}`,
    `- Prompt tokens: ${session.total_usage.prompt_tokens}`,
    `- Completion tokens: ${session.total_usage.completion_tokens}`,
    `- Total tokens: ${session.total_usage.total_tokens} / ${session.config.max_budget_tokens}`,
    `- Aux LLM calls: ${session.total_usage.aux_calls}`,
    `- Estimated cost: $${session.total_usage.estimated_cost_usd.toFixed(6)} USD`,
    `- Budget remaining: ${Math.max(0, session.config.max_budget_tokens - session.total_usage.total_tokens)} tokens`,
    "",
    "## Configuration",
    `- Max turns: ${session.config.max_turns}`,
    `- Max budget tokens: ${session.config.max_budget_tokens}`,
    `- Compact after turns: ${session.config.compact_after_turns}`,
    `- Self-eval: ${session.config.enable_self_eval}`,
    `- Sentiment: ${session.config.enable_sentiment}`,
    `- Memory: ${session.config.enable_memory}`,
    "",
    "## Session History",
    ...(session.history_events || []).map(e => `- [${e.timestamp}] **${e.title}**: ${e.detail}`),
  ];

  if (session.last_turn_result) {
    lines.push(
      "",
      "## Last Turn",
      `- Stop reason: ${session.last_turn_result.stop_reason}`,
      `- Tools used: ${session.last_turn_result.matched_tools?.join(", ") || "none"}`,
      `- Tools denied: ${session.last_turn_result.denied_tools?.join(", ") || "none"}`,
    );
  }

  return lines.join("\n");
}
