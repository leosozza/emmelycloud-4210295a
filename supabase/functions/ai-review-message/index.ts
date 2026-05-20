// ai-review-message — Quality Gate (Fase C)
// Avalia uma mensagem gerada por IA antes do envio ao cliente.
// Body: {
//   conversation_id?: string,
//   agent_id?: string,        // agente que produziu a mensagem
//   content: string,          // texto a revisar
//   context?: object,         // dados factuais (cliente, valores, etc)
//   threshold?: number        // override do limiar (default 0.75)
// }
// Retorna: { passed, score, feedback, issues, suggested_rewrite, review_id, blocked }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const DEFAULT_THRESHOLD = 0.75;

const REVIEWER_AGENT_NAME = "Revisor Jurídico (Quality Gate)";

interface ReviewResult {
  score: number;
  passed: boolean;
  feedback: string;
  issues: string[];
  suggested_rewrite: string | null;
}

async function callReviewerLLM(
  systemPrompt: string,
  model: string,
  content: string,
  context: Record<string, unknown>
): Promise<{ result: ReviewResult; tokens: number; cost: number }> {
  const userPrompt =
    `CONTEXTO:\n${JSON.stringify(context, null, 2)}\n\n` +
    `MENSAGEM A REVISAR:\n"""\n${content}\n"""\n\n` +
    `Avalie segundo os critérios e responda APENAS o JSON.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const data = await res.json().catch(() => ({}));
  const raw = data?.choices?.[0]?.message?.content || "{}";
  const tokens = data?.usage?.total_tokens || 0;
  // estimativa de custo (gemini flash ~ $0.0001 por 1k tokens)
  const cost = (tokens / 1000) * 0.0001;

  let parsed: any = {};
  try {
    const match = String(raw).match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }

  return {
    result: {
      score: typeof parsed.score === "number" ? parsed.score : 0.5,
      passed: parsed.passed === true,
      feedback: parsed.feedback || "Sem feedback estruturado.",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggested_rewrite: parsed.suggested_rewrite || null,
    },
    tokens,
    cost,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const {
      conversation_id = null,
      agent_id = null,
      content,
      context = {},
      threshold = DEFAULT_THRESHOLD,
    } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return new Response(JSON.stringify({ error: "content required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // Carrega revisor
    const { data: reviewer, error: revErr } = await supabase
      .from("ai_agents")
      .select("id, system_prompt, ai_model")
      .eq("name", REVIEWER_AGENT_NAME)
      .eq("is_active", true)
      .maybeSingle();

    if (revErr || !reviewer) {
      console.warn("[ai-review-message] Revisor não configurado, pulando gate", revErr?.message);
      return new Response(
        JSON.stringify({
          passed: true,
          score: 1,
          blocked: false,
          feedback: "Reviewer indisponível — gate ignorado.",
          issues: [],
          suggested_rewrite: null,
          review_id: null,
        }),
        { headers: jsonHeaders }
      );
    }

    // Chamada ao LLM revisor
    let reviewResult: ReviewResult;
    let tokens = 0;
    let cost = 0;
    try {
      const out = await callReviewerLLM(reviewer.system_prompt, reviewer.ai_model, content, context);
      reviewResult = out.result;
      tokens = out.tokens;
      cost = out.cost;
    } catch (e: any) {
      console.error("[ai-review-message] LLM error:", e?.message);
      // Falha do revisor não deve bloquear o envio — fail-open com aviso
      return new Response(
        JSON.stringify({
          passed: true,
          score: 0.5,
          blocked: false,
          feedback: `Falha técnica no revisor: ${e?.message}. Mensagem liberada por fail-open.`,
          issues: ["reviewer_error"],
          suggested_rewrite: null,
          review_id: null,
        }),
        { headers: jsonHeaders }
      );
    }

    const passed = reviewResult.score >= threshold;
    const decision = passed ? "auto_approved" : "pending";

    // Audita
    const { data: reviewRow } = await supabase
      .from("ai_message_reviews")
      .insert({
        conversation_id,
        agent_id,
        reviewer_agent_id: reviewer.id,
        original_content: content,
        revised_content: reviewResult.suggested_rewrite,
        score: reviewResult.score,
        threshold,
        passed,
        feedback: reviewResult.feedback,
        issues: reviewResult.issues,
        context_snapshot: context,
        decision,
        tokens_used: tokens,
        cost_usd: cost,
        latency_ms: Date.now() - startedAt,
      })
      .select("id")
      .single();

    return new Response(
      JSON.stringify({
        passed,
        blocked: !passed,
        score: reviewResult.score,
        threshold,
        feedback: reviewResult.feedback,
        issues: reviewResult.issues,
        suggested_rewrite: reviewResult.suggested_rewrite,
        review_id: reviewRow?.id ?? null,
      }),
      { headers: jsonHeaders }
    );
  } catch (err: any) {
    console.error("[ai-review-message] error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
