/**
 * AI Parity Audit — EmmelyCloud
 *
 * Inspirado no parity_audit.py do Claw Code:
 * - Verifica se a configuração do agente está consistente com a execução real
 * - Detecta discrepâncias entre o que foi configurado e o que está sendo executado
 * - Gera relatório de saúde do sistema de IA
 * - Verifica: modelos disponíveis, ferramentas registradas, fluxos ativos,
 *   credenciais de provedores, budget de tokens, integridade das migrações
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditCheck {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: any;
}

interface AuditReport {
  timestamp: string;
  overall_status: "healthy" | "degraded" | "critical";
  checks: AuditCheck[];
  summary: {
    total: number;
    ok: number;
    warnings: number;
    errors: number;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const body = await req.json().catch(() => ({}));
    const { action = "full_audit" } = body;

    switch (action) {

      // ── Auditoria completa do sistema ─────────────────────────────────────────
      case "full_audit": {
        const checks: AuditCheck[] = [];

        // 1. Verificar agentes ativos
        await auditAgents(supabase, checks);

        // 2. Verificar provedores de IA e credenciais
        await auditProviders(supabase, checks);

        // 3. Verificar fluxos ativos e consistência de nós
        await auditFlows(supabase, checks);

        // 4. Verificar ferramentas registradas
        await auditTools(supabase, checks);

        // 5. Verificar integrações Bitrix24
        await auditBitrix24(supabase, checks);

        // 6. Verificar saúde da fila de mensagens
        await auditMessageQueue(supabase, checks);

        // 7. Verificar budget de tokens
        await auditTokenBudget(supabase, checks);

        // 8. Verificar integridade das tabelas críticas
        await auditTableIntegrity(supabase, checks);

        // Calcular status geral
        const errors = checks.filter(c => c.status === "error").length;
        const warnings = checks.filter(c => c.status === "warning").length;
        const ok = checks.filter(c => c.status === "ok").length;

        const overall_status: AuditReport["overall_status"] =
          errors > 0 ? "critical" : warnings > 2 ? "degraded" : "healthy";

        const report: AuditReport = {
          timestamp: new Date().toISOString(),
          overall_status,
          checks,
          summary: { total: checks.length, ok, warnings, errors },
        };

        // Salvar relatório no banco
        await supabase.from("ai_audit_logs").insert({
          report,
          overall_status,
          errors_count: errors,
          warnings_count: warnings,
        }).catch(() => {});

        return new Response(JSON.stringify(report), { headers: jsonHeaders });
      }

      // ── Auditoria rápida (apenas checks críticos) ─────────────────────────────
      case "quick_audit": {
        const checks: AuditCheck[] = [];
        await auditAgents(supabase, checks);
        await auditMessageQueue(supabase, checks);
        await auditTokenBudget(supabase, checks);

        const errors = checks.filter(c => c.status === "error").length;
        const warnings = checks.filter(c => c.status === "warning").length;

        return new Response(JSON.stringify({
          overall_status: errors > 0 ? "critical" : warnings > 0 ? "degraded" : "healthy",
          checks,
          summary: { total: checks.length, ok: checks.filter(c => c.status === "ok").length, warnings, errors },
        }), { headers: jsonHeaders });
      }

      // ── Histórico de auditorias ───────────────────────────────────────────────
      case "get_history": {
        const { data: logs } = await supabase
          .from("ai_audit_logs")
          .select("id, overall_status, errors_count, warnings_count, created_at")
          .order("created_at", { ascending: false })
          .limit(20);

        return new Response(JSON.stringify({ history: logs || [] }), { headers: jsonHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: jsonHeaders });
    }
  } catch (err) {
    console.error("[PARITY-AUDIT] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── Checks de auditoria ──────────────────────────────────────────────────────

async function auditAgents(supabase: any, checks: AuditCheck[]) {
  const { data: agents, error } = await supabase
    .from("ai_agents")
    .select("id, name, is_active, is_default, ai_model, ai_provider, system_prompt");

  if (error) {
    checks.push({ name: "agents_table", status: "error", message: `Cannot read ai_agents: ${error.message}` });
    return;
  }

  const activeAgents = (agents || []).filter((a: any) => a.is_active);
  const defaultAgents = (agents || []).filter((a: any) => a.is_default && a.is_active);

  if (activeAgents.length === 0) {
    checks.push({ name: "agents_active", status: "error", message: "No active agents found — chatbot will not respond" });
  } else {
    checks.push({ name: "agents_active", status: "ok", message: `${activeAgents.length} active agent(s) found` });
  }

  if (defaultAgents.length === 0) {
    checks.push({ name: "agents_default", status: "error", message: "No default agent configured — fallback routing will fail" });
  } else if (defaultAgents.length > 1) {
    checks.push({ name: "agents_default", status: "warning", message: `${defaultAgents.length} default agents found — only one should be default`, details: defaultAgents.map((a: any) => a.name) });
  } else {
    checks.push({ name: "agents_default", status: "ok", message: `Default agent: "${defaultAgents[0].name}"` });
  }

  // Verificar agentes sem system_prompt
  const noPrompt = activeAgents.filter((a: any) => !a.system_prompt || a.system_prompt.length < 10);
  if (noPrompt.length > 0) {
    checks.push({ name: "agents_system_prompt", status: "warning", message: `${noPrompt.length} active agent(s) have no/empty system_prompt`, details: noPrompt.map((a: any) => a.name) });
  } else {
    checks.push({ name: "agents_system_prompt", status: "ok", message: "All active agents have system prompts" });
  }
}

async function auditProviders(supabase: any, checks: AuditCheck[]) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  if (!lovableKey) {
    checks.push({ name: "lovable_api_key", status: "error", message: "LOVABLE_API_KEY not set — primary AI gateway unavailable" });
  } else {
    checks.push({ name: "lovable_api_key", status: "ok", message: "LOVABLE_API_KEY is set" });
  }

  // Verificar credenciais de provedores customizados
  const { data: credentials } = await supabase
    .from("integration_credentials")
    .select("provider, credential_key, created_at");

  const credsByProvider: Record<string, number> = {};
  for (const cred of (credentials || [])) {
    credsByProvider[cred.provider] = (credsByProvider[cred.provider] || 0) + 1;
  }

  checks.push({
    name: "ai_provider_credentials",
    status: "ok",
    message: `${Object.keys(credsByProvider).length} provider(s) with credentials`,
    details: credsByProvider,
  });
}

async function auditFlows(supabase: any, checks: AuditCheck[]) {
  const { data: flows } = await supabase
    .from("flows")
    .select("id, name, is_active, nodes, edges");

  const activeFlows = (flows || []).filter((f: any) => f.is_active);

  if (activeFlows.length === 0) {
    checks.push({ name: "flows_active", status: "warning", message: "No active flows — only free-form AI responses will work" });
    return;
  }

  checks.push({ name: "flows_active", status: "ok", message: `${activeFlows.length} active flow(s)` });

  // Verificar nós sem implementação no engine
  const UNIMPLEMENTED_NODES: string[] = []; // Todos implementados após nossa refatoração
  let orphanNodes = 0;

  for (const flow of activeFlows) {
    const nodes = flow.nodes || [];
    for (const node of nodes) {
      if (UNIMPLEMENTED_NODES.includes(node.type)) {
        orphanNodes++;
      }
      // Verificar nós sem edges de saída (exceto nós de fim)
      const endTypes = ["end_flow", "transfer_human", "end"];
      if (!endTypes.includes(node.type)) {
        const edges = flow.edges || [];
        const hasOutgoing = edges.some((e: any) => e.source === node.id);
        if (!hasOutgoing && !endTypes.includes(node.type)) {
          orphanNodes++;
        }
      }
    }
  }

  if (orphanNodes > 0) {
    checks.push({ name: "flows_orphan_nodes", status: "warning", message: `${orphanNodes} node(s) with no outgoing edges found in active flows` });
  } else {
    checks.push({ name: "flows_orphan_nodes", status: "ok", message: "All flow nodes have proper connections" });
  }
}

async function auditTools(supabase: any, checks: AuditCheck[]) {
  const { data: tools } = await supabase
    .from("agent_tools")
    .select("tool_name, agent_id, is_active, tool_parameters");

  const activeTools = (tools || []).filter((t: any) => t.is_active);

  // Verificar ferramentas com webhook_url inválido
  const webhookTools = activeTools.filter((t: any) => t.tool_parameters?.webhook_url);
  const invalidWebhooks = webhookTools.filter((t: any) => {
    try { new URL(t.tool_parameters.webhook_url); return false; } catch { return true; }
  });

  if (invalidWebhooks.length > 0) {
    checks.push({ name: "tools_webhook_urls", status: "warning", message: `${invalidWebhooks.length} tool(s) have invalid webhook URLs`, details: invalidWebhooks.map((t: any) => t.tool_name) });
  } else {
    checks.push({ name: "tools_webhook_urls", status: "ok", message: `${activeTools.length} active tool(s), all webhook URLs valid` });
  }
}

async function auditBitrix24(supabase: any, checks: AuditCheck[]) {
  const { data: integrations } = await supabase
    .from("bitrix24_integrations")
    .select("id, domain, is_active, access_token_expires_at");

  const activeIntegrations = (integrations || []).filter((i: any) => i.is_active);

  if (activeIntegrations.length === 0) {
    checks.push({ name: "bitrix24_integrations", status: "warning", message: "No active Bitrix24 integrations" });
    return;
  }

  // Verificar tokens expirados
  const now = new Date();
  const expiredTokens = activeIntegrations.filter((i: any) => {
    if (!i.access_token_expires_at) return false;
    return new Date(i.access_token_expires_at) < now;
  });

  if (expiredTokens.length > 0) {
    checks.push({ name: "bitrix24_tokens", status: "warning", message: `${expiredTokens.length} Bitrix24 integration(s) have expired tokens`, details: expiredTokens.map((i: any) => i.domain) });
  } else {
    checks.push({ name: "bitrix24_tokens", status: "ok", message: `${activeIntegrations.length} active Bitrix24 integration(s) with valid tokens` });
  }
}

async function auditMessageQueue(supabase: any, checks: AuditCheck[]) {
  const { data: stuckJobs } = await supabase
    .from("message_queue")
    .select("id, status, created_at, conversation_id")
    .eq("status", "processing")
    .lt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()); // > 5 min

  if (stuckJobs && stuckJobs.length > 0) {
    checks.push({
      name: "message_queue_stuck",
      status: "warning",
      message: `${stuckJobs.length} job(s) stuck in "processing" for >5 minutes`,
      details: stuckJobs.map((j: any) => ({ id: j.id, conversation_id: j.conversation_id, created_at: j.created_at })),
    });
  } else {
    checks.push({ name: "message_queue_stuck", status: "ok", message: "No stuck jobs in message queue" });
  }

  // Verificar backlog
  const { count: pendingCount } = await supabase
    .from("message_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if ((pendingCount || 0) > 100) {
    checks.push({ name: "message_queue_backlog", status: "warning", message: `High queue backlog: ${pendingCount} pending jobs` });
  } else {
    checks.push({ name: "message_queue_backlog", status: "ok", message: `Queue backlog: ${pendingCount || 0} pending jobs` });
  }
}

async function auditTokenBudget(supabase: any, checks: AuditCheck[]) {
  // Verificar uso de tokens nas últimas 24h
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentUsage } = await supabase
    .from("ai_usage_logs")
    .select("total_tokens, cost_estimate, error")
    .gte("created_at", yesterday);

  if (!recentUsage || recentUsage.length === 0) {
    checks.push({ name: "token_usage_24h", status: "ok", message: "No AI usage in last 24h" });
    return;
  }

  const totalTokens = recentUsage.reduce((s: number, l: any) => s + (l.total_tokens || 0), 0);
  const totalCost = recentUsage.reduce((s: number, l: any) => s + (l.cost_estimate || 0), 0);
  const errorCount = recentUsage.filter((l: any) => l.error).length;
  const errorRate = errorCount / recentUsage.length;

  if (errorRate > 0.1) {
    checks.push({ name: "ai_error_rate", status: "error", message: `High AI error rate: ${(errorRate * 100).toFixed(1)}% in last 24h (${errorCount}/${recentUsage.length} calls)` });
  } else if (errorRate > 0.05) {
    checks.push({ name: "ai_error_rate", status: "warning", message: `Elevated AI error rate: ${(errorRate * 100).toFixed(1)}% in last 24h` });
  } else {
    checks.push({ name: "ai_error_rate", status: "ok", message: `AI error rate: ${(errorRate * 100).toFixed(1)}% (${recentUsage.length} calls in 24h)` });
  }

  checks.push({
    name: "token_usage_24h",
    status: totalTokens > 1_000_000 ? "warning" : "ok",
    message: `Last 24h: ${totalTokens.toLocaleString()} tokens, $${totalCost.toFixed(4)} USD`,
    details: { total_tokens: totalTokens, cost_usd: totalCost, calls: recentUsage.length },
  });
}

async function auditTableIntegrity(supabase: any, checks: AuditCheck[]) {
  const criticalTables = [
    "conversations", "messages", "ai_agents", "flows",
    "message_queue", "ai_usage_logs", "user_memory",
  ];

  const tableStatus: Record<string, "ok" | "error"> = {};

  for (const table of criticalTables) {
    const { error } = await supabase.from(table).select("id", { count: "exact", head: true }).limit(1);
    tableStatus[table] = error ? "error" : "ok";
  }

  const failedTables = Object.entries(tableStatus).filter(([, s]) => s === "error").map(([t]) => t);

  if (failedTables.length > 0) {
    checks.push({ name: "table_integrity", status: "error", message: `Cannot access critical tables: ${failedTables.join(", ")}`, details: tableStatus });
  } else {
    checks.push({ name: "table_integrity", status: "ok", message: `All ${criticalTables.length} critical tables accessible`, details: tableStatus });
  }
}
