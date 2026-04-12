import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StepDetail {
  type: "thought" | "tool_call" | "tool_result" | "reflection";
  content: string;
  tool?: string;
  params?: any;
  duration_ms?: number;
  timestamp: string;
}

interface ReactLog {
  id: string;
  agent_id: string | null;
  agent_name: string;
  step_count: number;
  tool_calls: number;
  steps: StepDetail[];
  latency_ms: number | null;
  cost_estimate: number | null;
  created_at: string;
}

interface AiMetrics {
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  totalRequests: number;
  fallbackRate: number;
  errorRate: number;
  avgFeedbackRating: number;
  feedbackCount: number;
  byAgent: {
    agentId: string;
    agentName: string;
    requests: number;
    tokens: number;
    cost: number;
    avgLatency: number;
    fallbacks: number;
    monthlyBudget: number | null;
    monthlyCost: number;
  }[];
  byModel: {
    model: string;
    requests: number;
    tokens: number;
    cost: number;
  }[];
  dailyUsage: {
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }[];
  sessions: {
    session_id: string;
    agent_id: string | null;
    agent_name: string;
    status: string;
    turn_count: number;
    total_tokens: number;
    total_cost_usd: number;
    avg_latency_ms: number | null;
    created_at: string;
    completed_at: string | null;
  }[];
  auditLogs: {
    id: string;
    overall_status: string;
    errors_count: number;
    warnings_count: number;
    created_at: string;
  }[];
  summaries: {
    id: string;
    conversation_id: string;
    summary_text: string;
    messages_summarized: number;
    created_at: string;
  }[];
  reactLogs: ReactLog[];
}

export function useAiObservability(periodDays = 30) {
  const [metrics, setMetrics] = useState<AiMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, [periodDays]);

  async function loadMetrics() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const sinceStr = since.toISOString();

    const [logsRes, feedbackRes, agentsRes, sessionsRes, auditRes, summariesRes] = await Promise.all([
      supabase
        .from("ai_usage_logs")
        .select("*")
        .gte("created_at", sinceStr)
        .order("created_at", { ascending: true }),
      supabase
        .from("conversation_feedback")
        .select("rating, created_at")
        .gte("created_at", sinceStr)
        .not("rating", "is", null),
      supabase
        .from("ai_agents")
        .select("id, name, monthly_budget_usd"),
      supabase
        .from("ai_sessions")
        .select("*")
        .gte("created_at", sinceStr)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("ai_audit_logs")
        .select("id, overall_status, errors_count, warnings_count, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("conversation_summaries")
        .select("id, conversation_id, summary_text, messages_summarized, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const logs = (logsRes.data || []) as any[];
    const feedback = (feedbackRes.data || []) as any[];
    const agents = (agentsRes.data || []) as any[];
    const agentMap = new Map(agents.map((a: any) => [a.id, a.name]));
    const budgetMap = new Map(agents.map((a: any) => [a.id, a.monthly_budget_usd]));

    const monthlyCostMap = new Map<string, number>();
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    for (const log of logs) {
      const logDate = new Date(log.created_at);
      if (logDate >= currentMonth && log.agent_id) {
        monthlyCostMap.set(log.agent_id, (monthlyCostMap.get(log.agent_id) || 0) + (Number(log.cost_estimate) || 0));
      }
    }

    let totalTokens = 0, totalCost = 0, totalLatency = 0, fallbacks = 0, errors = 0;
    const agentAgg: Record<string, any> = {};
    const modelAgg: Record<string, any> = {};
    const dailyAgg: Record<string, any> = {};
    const reactLogs: ReactLog[] = [];

    for (const log of logs) {
      totalTokens += log.total_tokens || 0;
      totalCost += Number(log.cost_estimate) || 0;
      totalLatency += log.latency_ms || 0;
      if (log.was_fallback) fallbacks++;
      if (log.error) errors++;

      const aid = log.agent_id || "unknown";
      if (!agentAgg[aid]) agentAgg[aid] = { requests: 0, tokens: 0, cost: 0, latency: 0, fallbacks: 0 };
      agentAgg[aid].requests++;
      agentAgg[aid].tokens += log.total_tokens || 0;
      agentAgg[aid].cost += Number(log.cost_estimate) || 0;
      agentAgg[aid].latency += log.latency_ms || 0;
      if (log.was_fallback) agentAgg[aid].fallbacks++;

      const model = log.model || "unknown";
      if (!modelAgg[model]) modelAgg[model] = { requests: 0, tokens: 0, cost: 0 };
      modelAgg[model].requests++;
      modelAgg[model].tokens += log.total_tokens || 0;
      modelAgg[model].cost += Number(log.cost_estimate) || 0;

      const day = (log.created_at || "").substring(0, 10);
      if (day) {
        if (!dailyAgg[day]) dailyAgg[day] = { requests: 0, tokens: 0, cost: 0 };
        dailyAgg[day].requests++;
        dailyAgg[day].tokens += log.total_tokens || 0;
        dailyAgg[day].cost += Number(log.cost_estimate) || 0;
      }

      // Collect ReACT logs (logs with step_details)
      if (log.step_details && Array.isArray(log.step_details) && log.step_details.length > 0) {
        const steps = log.step_details as StepDetail[];
        reactLogs.push({
          id: log.id,
          agent_id: log.agent_id,
          agent_name: agentMap.get(log.agent_id) || "Desconhecido",
          step_count: steps.length,
          tool_calls: steps.filter(s => s.type === "tool_call").length,
          steps,
          latency_ms: log.latency_ms,
          cost_estimate: log.cost_estimate,
          created_at: log.created_at,
        });
      }
    }

    const totalRequests = logs.length;
    const ratings = feedback.filter((f: any) => f.rating != null).map((f: any) => f.rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;

    const sessions = (sessionsRes.data || []).map((s: any) => ({
      ...s,
      agent_name: agentMap.get(s.agent_id) || "Desconhecido",
    }));

    setMetrics({
      totalTokens,
      totalCost,
      avgLatency: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
      totalRequests,
      fallbackRate: totalRequests > 0 ? (fallbacks / totalRequests) * 100 : 0,
      errorRate: totalRequests > 0 ? (errors / totalRequests) * 100 : 0,
      avgFeedbackRating: Math.round(avgRating * 10) / 10,
      feedbackCount: ratings.length,
      byAgent: Object.entries(agentAgg).map(([id, a]: [string, any]) => ({
        agentId: id,
        agentName: agentMap.get(id) || "Desconhecido",
        requests: a.requests,
        tokens: a.tokens,
        cost: a.cost,
        avgLatency: a.requests > 0 ? Math.round(a.latency / a.requests) : 0,
        fallbacks: a.fallbacks,
        monthlyBudget: budgetMap.get(id) ?? null,
        monthlyCost: monthlyCostMap.get(id) || 0,
      })).sort((a, b) => b.requests - a.requests),
      byModel: Object.entries(modelAgg).map(([model, a]: [string, any]) => ({
        model,
        requests: a.requests,
        tokens: a.tokens,
        cost: a.cost,
      })).sort((a, b) => b.tokens - a.tokens),
      dailyUsage: Object.entries(dailyAgg).map(([date, a]: [string, any]) => ({
        date,
        requests: a.requests,
        tokens: a.tokens,
        cost: a.cost,
      })).sort((a, b) => a.date.localeCompare(b.date)),
      sessions,
      auditLogs: (auditRes.data || []) as any[],
      summaries: (summariesRes.data || []) as any[],
      reactLogs: reactLogs.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50),
    });
    setLoading(false);
  }

  return { metrics, loading, reload: loadMetrics };
}
