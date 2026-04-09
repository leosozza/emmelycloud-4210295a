/**
 * AI Cost Tracker — EmmelyCloud
 *
 * Inspirado no cost_tracker.py do Claw Code:
 * - Rastreamento atômico de custos por sessão, agente e período
 * - Alertas de budget configuráveis (80% e 100% do limite)
 * - Relatórios de custo por modelo, agente e período
 * - Integração com ai_sessions para custo total por conversa
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Preços por modelo (USD por 1M tokens) ────────────────────────────────────
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-pro":         { input: 1.25,  output: 10.0  },
  "google/gemini-2.5-flash":       { input: 0.15,  output: 0.6   },
  "google/gemini-2.5-flash-lite":  { input: 0.075, output: 0.3   },
  "openai/gpt-5":                  { input: 2.0,   output: 8.0   },
  "openai/gpt-5-mini":             { input: 0.4,   output: 1.6   },
  "openai/gpt-4o":                 { input: 2.5,   output: 10.0  },
  "openai/gpt-4o-mini":            { input: 0.15,  output: 0.6   },
  "anthropic/claude-3-5-sonnet":   { input: 3.0,   output: 15.0  },
  "anthropic/claude-3-5-haiku":    { input: 0.8,   output: 4.0   },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 0.5, output: 1.5 }; // fallback genérico
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {

      // ── Registrar uso e calcular custo atomicamente ───────────────────────────
      case "record_usage": {
        const { agent_id, model, provider, prompt_tokens, completion_tokens, conversation_id, session_id, latency_ms, was_fallback, error } = body;

        if (!agent_id || !model) {
          return new Response(JSON.stringify({ error: "agent_id and model required" }), { status: 400, headers: jsonHeaders });
        }

        const totalTokens = (prompt_tokens || 0) + (completion_tokens || 0);
        const costUsd = estimateCost(model, prompt_tokens || 0, completion_tokens || 0);

        // Inserir log de uso
        const { data: log, error: logErr } = await supabase
          .from("ai_usage_logs")
          .insert({
            agent_id,
            model,
            provider: provider || "lovable",
            prompt_tokens: prompt_tokens || 0,
            completion_tokens: completion_tokens || 0,
            total_tokens: totalTokens,
            cost_estimate: costUsd,
            conversation_id: conversation_id || null,
            session_id: session_id || null,
            latency_ms: latency_ms || 0,
            was_fallback: was_fallback || false,
            error: error || null,
          })
          .select("id")
          .single();

        if (logErr) {
          console.error("[COST-TRACKER] Failed to record usage:", logErr.message);
          return new Response(JSON.stringify({ error: logErr.message }), { status: 500, headers: jsonHeaders });
        }

        // Verificar budget do agente e emitir alerta se necessário
        const budgetAlert = await checkAgentBudget(supabase, agent_id, costUsd);

        return new Response(JSON.stringify({
          log_id: log.id,
          cost_usd: costUsd,
          total_tokens: totalTokens,
          budget_alert: budgetAlert,
        }), { headers: jsonHeaders });
      }

      // ── Relatório de custo por período ────────────────────────────────────────
      case "get_cost_report": {
        const { start_date, end_date, group_by } = body;
        const start = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const end = end_date || new Date().toISOString();

        const { data: logs } = await supabase
          .from("ai_usage_logs")
          .select("agent_id, model, provider, prompt_tokens, completion_tokens, total_tokens, cost_estimate, latency_ms, was_fallback, created_at")
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false })
          .limit(10000);

        if (!logs || logs.length === 0) {
          return new Response(JSON.stringify({ report: null, message: "No usage data found" }), { headers: jsonHeaders });
        }

        const report = buildCostReport(logs, group_by || "model");

        return new Response(JSON.stringify({ report, period: { start, end } }), { headers: jsonHeaders });
      }

      // ── Custo total de uma conversa ────────────────────────────────────────────
      case "get_conversation_cost": {
        const { conversation_id } = body;
        if (!conversation_id) {
          return new Response(JSON.stringify({ error: "conversation_id required" }), { status: 400, headers: jsonHeaders });
        }

        const { data: logs } = await supabase
          .from("ai_usage_logs")
          .select("model, prompt_tokens, completion_tokens, total_tokens, cost_estimate, latency_ms, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: true });

        if (!logs || logs.length === 0) {
          return new Response(JSON.stringify({ cost_usd: 0, total_tokens: 0, calls: 0 }), { headers: jsonHeaders });
        }

        const summary = {
          cost_usd: logs.reduce((s: number, l: any) => s + (l.cost_estimate || 0), 0),
          total_tokens: logs.reduce((s: number, l: any) => s + (l.total_tokens || 0), 0),
          prompt_tokens: logs.reduce((s: number, l: any) => s + (l.prompt_tokens || 0), 0),
          completion_tokens: logs.reduce((s: number, l: any) => s + (l.completion_tokens || 0), 0),
          calls: logs.length,
          avg_latency_ms: logs.reduce((s: number, l: any) => s + (l.latency_ms || 0), 0) / logs.length,
          models_used: [...new Set(logs.map((l: any) => l.model))],
        };

        return new Response(JSON.stringify(summary), { headers: jsonHeaders });
      }

      // ── Preços dos modelos disponíveis ────────────────────────────────────────
      case "get_model_pricing": {
        const pricing = Object.entries(MODEL_PRICING).map(([model, prices]) => ({
          model,
          input_per_1m: prices.input,
          output_per_1m: prices.output,
          example_1k_tokens: estimateCost(model, 750, 250),
        }));

        return new Response(JSON.stringify({ pricing }), { headers: jsonHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: jsonHeaders });
    }
  } catch (err) {
    console.error("[COST-TRACKER] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── Verificar budget do agente e emitir alerta ────────────────────────────────

async function checkAgentBudget(supabase: any, agentId: string, newCostUsd: number): Promise<string | null> {
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("name, monthly_budget_usd")
    .eq("id", agentId)
    .single();

  if (!agent?.monthly_budget_usd) return null;

  // Custo do mês atual
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: logs } = await supabase
    .from("ai_usage_logs")
    .select("cost_estimate")
    .eq("agent_id", agentId)
    .gte("created_at", startOfMonth.toISOString());

  const currentMonthCost = (logs || []).reduce((s: number, l: any) => s + (l.cost_estimate || 0), 0) + newCostUsd;
  const budgetPct = (currentMonthCost / agent.monthly_budget_usd) * 100;

  if (budgetPct >= 100) {
    return `BUDGET_EXCEEDED: ${agent.name} atingiu 100% do budget mensal ($${agent.monthly_budget_usd})`;
  }
  if (budgetPct >= 80) {
    return `BUDGET_WARNING: ${agent.name} atingiu ${budgetPct.toFixed(0)}% do budget mensal ($${agent.monthly_budget_usd})`;
  }
  return null;
}

// ─── Construir relatório de custo agrupado ─────────────────────────────────────

function buildCostReport(logs: any[], groupBy: string) {
  const groups: Record<string, { calls: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number; avg_latency_ms: number }> = {};

  for (const log of logs) {
    const key = log[groupBy] || "unknown";
    if (!groups[key]) {
      groups[key] = { calls: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0, avg_latency_ms: 0 };
    }
    groups[key].calls++;
    groups[key].prompt_tokens += log.prompt_tokens || 0;
    groups[key].completion_tokens += log.completion_tokens || 0;
    groups[key].total_tokens += log.total_tokens || 0;
    groups[key].cost_usd += log.cost_estimate || 0;
    groups[key].avg_latency_ms += log.latency_ms || 0;
  }

  // Calcular médias
  for (const key of Object.keys(groups)) {
    groups[key].avg_latency_ms = groups[key].avg_latency_ms / groups[key].calls;
  }

  const totals = {
    calls: logs.length,
    total_tokens: logs.reduce((s, l) => s + (l.total_tokens || 0), 0),
    cost_usd: logs.reduce((s, l) => s + (l.cost_estimate || 0), 0),
    fallback_rate: logs.filter(l => l.was_fallback).length / logs.length,
    error_rate: logs.filter(l => l.error).length / logs.length,
  };

  return { group_by: groupBy, groups, totals };
}
