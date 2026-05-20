// ai-chain-executor — Motor "Emmely Chat Chain" inspirado em ChatDev
//
// Executa uma ai_chain: itera fases sequencialmente, cada fase é um mini-diálogo
// instrutor↔assistente com critério de sucesso, reviewer opcional ao fim, e
// quality gate global. Tudo auditado em ai_chain_executions + ai_phase_executions.
//
// Body: { chain_id | chain_name, conversation_id?, lead_id?, input?: object, triggered_by? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEHALLUCINATION_PROMPT = `
REGRAS ANTI-ALUCINAÇÃO (obrigatórias):
1. Só afirme fatos sobre cliente/contrato/valor/prazo se estiverem explicitamente no CONTEXTO fornecido.
2. Se um dado crítico (valor, data, nome, CPF/NIF, processo) NÃO estiver no contexto, NÃO invente — em vez disso, retorne um JSON com {"needs_clarification": true, "missing_fields": [...], "question_to_user": "..."} e pare.
3. Nunca prometa resultado jurídico. Use linguagem condicional ("pode", "tipicamente").
4. Pense passo a passo antes de responder e cite a fonte (campo do contexto) ao afirmar um fato.
`.trim();

async function callAgent(params: {
  agent_id?: string;
  role: string;
  goal: string;
  context: Record<string, unknown>;
  conversation_id?: string;
  max_turns: number;
}): Promise<{ output: string; tokens: number; cost: number; halluc_flags: any[] }> {
  const systemPrompt =
    `Você é um agente no papel "${params.role}".\n` +
    `OBJETIVO DESTA FASE: ${params.goal}\n\n` +
    DEHALLUCINATION_PROMPT +
    `\n\nCONTEXTO:\n${JSON.stringify(params.context, null, 2)}`;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-process-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      agent_id: params.agent_id,
      system_override: systemPrompt,
      message_text: `Execute a fase "${params.role}" e retorne o resultado.`,
      conversation_id: params.conversation_id,
      skip_send: true,
      max_iterations: params.max_turns,
    }),
  });

  const data = await res.json().catch(() => ({}));
  const output = data?.reply || data?.content || JSON.stringify(data);
  const tokens = data?.usage?.total_tokens || 0;
  const cost = data?.cost_estimate || 0;

  // Detecção simples de pedido de clarificação
  const halluc_flags: any[] = [];
  if (typeof output === "string" && /needs_clarification.*true/i.test(output)) {
    halluc_flags.push({ type: "clarification_requested" });
  }

  return { output: String(output), tokens, cost, halluc_flags };
}

async function reviewPhase(params: {
  reviewer_agent_id?: string;
  phase_role: string;
  phase_output: string;
  context: Record<string, unknown>;
}): Promise<{ score: number; feedback: string; tokens: number; cost: number }> {
  const reviewerPrompt = `
Você é um Revisor Jurídico Sênior. Avalie o output da fase "${params.phase_role}".
Critérios:
- coerência factual (compare com o contexto fornecido)
- tom profissional e empático
- compliance (LGPD/RGPD, sem promessas de resultado)
- ausência de alucinações (dados não presentes no contexto)

CONTEXTO ORIGINAL:
${JSON.stringify(params.context, null, 2)}

OUTPUT A REVISAR:
${params.phase_output}

Responda APENAS um JSON: {"score": 0.0-1.0, "feedback": "...", "issues": ["..."]}
`.trim();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-process-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      agent_id: params.reviewer_agent_id,
      system_override: reviewerPrompt,
      message_text: "Avalie e retorne o JSON.",
      skip_send: true,
      max_iterations: 1,
      response_format: "json",
    }),
  });
  const data = await res.json().catch(() => ({}));
  const raw = data?.reply || data?.content || "{}";

  let parsed: any = {};
  try {
    const match = String(raw).match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }

  return {
    score: typeof parsed.score === "number" ? parsed.score : 0.5,
    feedback: parsed.feedback || "Sem feedback estruturado.",
    tokens: data?.usage?.total_tokens || 0,
    cost: data?.cost_estimate || 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const {
      chain_id,
      chain_name,
      conversation_id = null,
      lead_id = null,
      input = {},
      triggered_by = "system",
    } = body;

    if (!chain_id && !chain_name) {
      return new Response(JSON.stringify({ error: "chain_id or chain_name required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // 1. Carregar chain
    const q = supabase.from("ai_chains").select("*").eq("is_active", true);
    const { data: chain, error: chainErr } = chain_id
      ? await q.eq("id", chain_id).single()
      : await q.eq("name", chain_name).single();

    if (chainErr || !chain) {
      return new Response(JSON.stringify({ error: "Chain not found", details: chainErr?.message }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    const phases: any[] = Array.isArray(chain.phases) ? chain.phases : [];
    if (phases.length === 0) {
      return new Response(JSON.stringify({ error: "Chain has no phases defined" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // 2. Criar registro de execução
    const { data: execRow, error: execErr } = await supabase
      .from("ai_chain_executions")
      .insert({
        chain_id: chain.id,
        conversation_id,
        lead_id,
        triggered_by,
        status: "running",
        metadata: { input },
      })
      .select()
      .single();

    if (execErr || !execRow) throw new Error(`Failed to create chain execution: ${execErr?.message}`);

    const executionId = execRow.id;
    let accumulatedContext: Record<string, unknown> = { ...input };
    let totalCost = 0;
    let totalTokens = 0;
    let finalStatus: "completed" | "failed" | "escalated" = "completed";
    let finalOutput: any = null;

    console.log(`[CHAIN] Starting chain "${chain.name}" (${phases.length} phases) execution=${executionId}`);

    // 3. Loop por fase
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const phaseStart = Date.now();

      const { data: phaseRow } = await supabase
        .from("ai_phase_executions")
        .insert({
          chain_execution_id: executionId,
          phase_index: i,
          phase_role: phase.role,
          phase_goal: phase.goal,
          agent_id: phase.agent_id || null,
          input_context: accumulatedContext,
          status: "running",
        })
        .select()
        .single();

      let attempt = 0;
      const maxAttempts = (chain.max_retries || 0) + 1;
      let phasePassed = false;
      let lastOutput = "";
      let lastReview: any = null;
      let lastHallucFlags: any[] = [];

      while (attempt < maxAttempts && !phasePassed) {
        attempt++;

        // 3a. Executa o agente da fase
        const agentRun = await callAgent({
          agent_id: phase.agent_id,
          role: phase.role,
          goal: phase.goal,
          context: accumulatedContext,
          conversation_id: conversation_id || undefined,
          max_turns: phase.max_turns || 3,
        });

        lastOutput = agentRun.output;
        lastHallucFlags = agentRun.halluc_flags;
        totalCost += agentRun.cost;
        totalTokens += agentRun.tokens;

        // 3b. Se pediu clarificação, escala (não tem operador no loop)
        if (agentRun.halluc_flags.some((f) => f.type === "clarification_requested")) {
          finalStatus = "escalated";
          phasePassed = false;
          break;
        }

        // 3c. Revisor (se a fase exigir)
        if (phase.requires_review) {
          lastReview = await reviewPhase({
            reviewer_agent_id: chain.reviewer_agent_id,
            phase_role: phase.role,
            phase_output: lastOutput,
            context: accumulatedContext,
          });
          totalCost += lastReview.cost;
          totalTokens += lastReview.tokens;

          if (lastReview.score >= chain.quality_threshold) {
            phasePassed = true;
          } else {
            console.log(`[CHAIN] Phase ${i} attempt ${attempt} score=${lastReview.score} < ${chain.quality_threshold}`);
          }
        } else {
          phasePassed = true;
        }
      }

      // 3d. Persistir fase
      await supabase
        .from("ai_phase_executions")
        .update({
          output_data: { result: lastOutput },
          turns_used: attempt,
          review_score: lastReview?.score ?? null,
          review_feedback: lastReview?.feedback ?? null,
          hallucination_flags: lastHallucFlags,
          tokens_used: totalTokens,
          cost_usd: totalCost,
          duration_ms: Date.now() - phaseStart,
          status: phasePassed ? "passed" : "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", phaseRow!.id);

      if (!phasePassed) {
        if (chain.on_failure === "escalate") {
          finalStatus = "escalated";
        } else if (chain.on_failure === "abort") {
          finalStatus = "failed";
        }
        break;
      }

      // 3e. Acumular contexto para próxima fase
      accumulatedContext = {
        ...accumulatedContext,
        [`phase_${i}_${phase.role}_output`]: lastOutput,
        last_phase_output: lastOutput,
      };
      finalOutput = lastOutput;

      // Atualizar índice atual
      await supabase
        .from("ai_chain_executions")
        .update({ current_phase_index: i + 1 })
        .eq("id", executionId);
    }

    // 4. Fechar execução
    await supabase
      .from("ai_chain_executions")
      .update({
        status: finalStatus,
        final_output: { result: finalOutput },
        total_cost_usd: totalCost,
        total_tokens: totalTokens,
        completed_at: new Date().toISOString(),
      })
      .eq("id", executionId);

    return new Response(
      JSON.stringify({
        success: finalStatus === "completed",
        execution_id: executionId,
        status: finalStatus,
        chain: chain.name,
        final_output: finalOutput,
        total_cost_usd: totalCost,
        total_tokens: totalTokens,
      }),
      { headers: jsonHeaders }
    );
  } catch (err: any) {
    console.error("[AI-CHAIN-EXECUTOR] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
