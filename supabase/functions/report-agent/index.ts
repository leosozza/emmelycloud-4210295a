import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function callAI(messages: { role: string; content: string }[]) {
  const res = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      max_tokens: 2048,
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`AI error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const reportType = body.report_type || "daily_summary";
    const personaId = body.persona_id || null;

    const now = new Date();
    const periodEnd = now.toISOString();
    let periodStart: string;

    if (reportType === "weekly_analysis") {
      periodStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else {
      periodStart = new Date(now.getTime() - 86400000).toISOString();
    }

    // Gather metrics
    const [convRes, msgRes, feedbackRes, leadsRes, aiLogsRes] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact" }).gte("created_at", periodStart),
      supabase.from("messages").select("id", { count: "exact" }).gte("created_at", periodStart),
      supabase.from("conversation_feedback").select("*").gte("created_at", periodStart),
      supabase.from("leads").select("id, funnel_stage, legal_area", { count: "exact" }).gte("created_at", periodStart),
      supabase.from("ai_usage_logs").select("latency_ms, total_tokens, cost_estimate, error").gte("created_at", periodStart),
    ]);

    const conversationCount = convRes.count || 0;
    const messageCount = msgRes.count || 0;
    const feedbacks = feedbackRes.data || [];
    const negFeedback = feedbacks.filter((f: any) => f.rating !== null && f.rating <= 2).length;
    const avgRating = feedbacks.length ? (feedbacks.reduce((s: number, f: any) => s + (f.rating || 0), 0) / feedbacks.length).toFixed(1) : "N/A";
    const leadsCount = leadsRes.count || 0;
    const leads = leadsRes.data || [];
    const aiLogs = aiLogsRes.data || [];
    const avgLatency = aiLogs.length ? Math.round(aiLogs.reduce((s: number, l: any) => s + (l.latency_ms || 0), 0) / aiLogs.length) : 0;
    const totalCost = aiLogs.reduce((s: number, l: any) => s + (l.cost_estimate || 0), 0).toFixed(4);
    const aiErrors = aiLogs.filter((l: any) => l.error).length;

    // Legal area distribution
    const areaMap: Record<string, number> = {};
    leads.forEach((l: any) => { areaMap[l.legal_area || "outro"] = (areaMap[l.legal_area || "outro"] || 0) + 1; });

    const dataSnapshot = {
      period: { start: periodStart, end: periodEnd },
      conversations: conversationCount,
      messages: messageCount,
      leads: leadsCount,
      feedback: { total: feedbacks.length, negative: negFeedback, avg_rating: avgRating },
      ai: { calls: aiLogs.length, avg_latency_ms: avgLatency, total_cost_usd: totalCost, errors: aiErrors },
      lead_areas: areaMap,
    };

    const prompt = `Gere um relatório ${reportType === "weekly_analysis" ? "semanal" : "diário"} de performance do escritório jurídico.

DADOS DO PERÍODO (${periodStart.slice(0, 10)} a ${periodEnd.slice(0, 10)}):
${JSON.stringify(dataSnapshot, null, 2)}

Gere o relatório em Markdown com:
1. **Resumo Executivo** — 2-3 frases
2. **Métricas Chave** — tabela com os números
3. **Destaques** — o que correu bem
4. **Pontos de Atenção** — problemas ou anomalias
5. **Recomendações** — 3-5 ações sugeridas

Use emojis para tornar visual. Seja conciso e acionável.`;

    const content = await callAI([
      { role: "system", content: "Você é um analista de dados especializado em escritórios jurídicos. Gere relatórios claros e acionáveis em Markdown." },
      { role: "user", content: prompt },
    ]);

    const title = reportType === "weekly_analysis"
      ? `Relatório Semanal — ${new Date(periodStart).toLocaleDateString("pt-BR")} a ${now.toLocaleDateString("pt-BR")}`
      : `Relatório Diário — ${now.toLocaleDateString("pt-BR")}`;

    const { data: report, error: insertErr } = await supabase
      .from("swarm_reports")
      .insert({
        persona_id: personaId,
        report_type: reportType,
        title,
        content,
        data_snapshot: dataSnapshot,
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
