import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Persona Trainer — Arquitetura Profissional ───────────────────────────────
//
// PROBLEMA ANTERIOR:
//   As regras de treinamento eram concatenadas diretamente no system_prompt
//   como strings. Isso tornava impossível rever, reordenar ou remover regras
//   individualmente sem regex frágil. O modelo estava hardcoded.
//
// NOVA ARQUITETURA:
//   1. Regras são armazenadas em `persona_training_history` como registros
//      relacionais com prioridade, categoria e estado (ativo/revertido).
//   2. O system_prompt do agente é reconstruído dinamicamente a partir das
//      regras ativas, em vez de acumular strings.
//   3. O modelo usa o agente padrão configurado (não hardcoded).
//   4. Novas actions: list_rules, reorder_rules, bulk_revert.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── Resolve AI config from default agent (sem hardcode) ─────────────────────
async function resolveAI(supabase: any): Promise<{ url: string; key: string; model: string }> {
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("ai_provider, ai_model")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  const provider = agent?.ai_provider || "lovable";
  const model = agent?.ai_model || "google/gemini-2.5-flash";

  if (provider === "lovable") {
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: Deno.env.get("LOVABLE_API_KEY") || "",
      model,
    };
  }

  // Provedor customizado
  const { data: cred } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", provider)
    .neq("credential_key", "base_url")
    .maybeSingle();

  const { data: provRow } = await supabase
    .from("ai_providers")
    .select("base_url")
    .eq("slug", provider)
    .single();

  return {
    url: provRow?.base_url || "https://ai.gateway.lovable.dev/v1/chat/completions",
    key: cred?.credential_value || Deno.env.get("LOVABLE_API_KEY") || "",
    model,
  };
}

// ─── Gerar regra comportamental via LLM ──────────────────────────────────────
async function generateRule(
  ai: { url: string; key: string; model: string },
  agentBasePrompt: string,
  existingRules: string[],
  instruction: string
): Promise<string> {
  const existingContext = existingRules.length > 0
    ? `\n\nRegras já existentes:\n${existingRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
    : "";

  const systemMessage = `Você é um especialista em configuração de assistentes de IA jurídicos.
Dado o prompt base de um assistente, as regras já existentes e uma nova instrução de treinamento,
gere uma regra comportamental concisa (1-3 frases) que:
- Seja específica e acionável
- Não contradiga as regras existentes (se contradizer, reformule para complementar)
- Seja escrita como instrução direta ao agente (ex: "Quando o cliente perguntar X, responda Y")
- Não repita o que já está no prompt base
Responda APENAS com a regra, sem explicações ou prefixos.`;

  const userMessage = `Prompt base do agente:
${agentBasePrompt || "(sem prompt base)"}
${existingContext}

Nova instrução de treinamento:
"${instruction}"

Gere a regra comportamental:`;

  const response = await fetch(ai.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ai.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ai.model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    console.error("[PERSONA-TRAINER] AI error:", response.status, await response.text());
    return instruction; // fallback: usar instrução como regra
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim() || instruction;
}

// ─── Reconstruir o system_prompt a partir das regras ativas ──────────────────
// Esta é a mudança arquitetural central: o system_prompt nunca é acumulado
// por concatenação. Ele é sempre reconstruído a partir das regras ativas.
async function rebuildSystemPrompt(
  supabase: any,
  agentId: string,
  basePrompt: string
): Promise<string> {
  const { data: activeRules } = await supabase
    .from("persona_training_history")
    .select("generated_rule, category, priority")
    .eq("agent_id", agentId)
    .is("reverted_at", null)
    .order("priority", { ascending: true })
    .order("applied_at", { ascending: true });

  if (!activeRules || activeRules.length === 0) {
    return basePrompt;
  }

  // Agrupar regras por categoria para melhor organização no prompt
  const byCategory: Record<string, string[]> = {};
  for (const rule of activeRules) {
    const cat = rule.category || "Comportamento";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(rule.generated_rule);
  }

  const rulesSection = Object.entries(byCategory)
    .map(([cat, rules]) => {
      const ruleLines = rules.map(r => `- ${r}`).join("\n");
      return `### ${cat}\n${ruleLines}`;
    })
    .join("\n\n");

  return `${basePrompt}\n\n---\n## Regras de Comportamento Treinadas\n\n${rulesSection}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, agent_id, instruction, training_id, category, priority, training_ids } = body;

    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id is required" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = getSupabase();

    const { data: agent, error: agentErr } = await supabase
      .from("ai_agents")
      .select("id, name, system_prompt, base_prompt")
      .eq("id", agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: jsonHeaders });
    }

    // O base_prompt é o prompt original sem as regras de treinamento.
    // Se não existir, usa o system_prompt atual como base.
    const basePrompt = agent.base_prompt || agent.system_prompt || "";

    // ── PREVIEW ────────────────────────────────────────────────────────────────
    if (action === "preview") {
      if (!instruction) {
        return new Response(JSON.stringify({ error: "instruction is required" }), { status: 400, headers: jsonHeaders });
      }

      // Buscar regras ativas para contexto
      const { data: activeRules } = await supabase
        .from("persona_training_history")
        .select("generated_rule")
        .eq("agent_id", agent_id)
        .is("reverted_at", null)
        .order("applied_at", { ascending: true });

      const existingRules = (activeRules || []).map((r: any) => r.generated_rule);
      const ai = await resolveAI(supabase);
      const generated_rule = await generateRule(ai, basePrompt, existingRules, instruction);

      return new Response(JSON.stringify({ generated_rule, model_used: ai.model }), { headers: jsonHeaders });
    }

    // ── TRAIN ──────────────────────────────────────────────────────────────────
    if (action === "train") {
      if (!instruction) {
        return new Response(JSON.stringify({ error: "instruction is required" }), { status: 400, headers: jsonHeaders });
      }

      // Buscar regras ativas para contexto
      const { data: activeRules } = await supabase
        .from("persona_training_history")
        .select("generated_rule, priority")
        .eq("agent_id", agent_id)
        .is("reverted_at", null)
        .order("priority", { ascending: true });

      const existingRules = (activeRules || []).map((r: any) => r.generated_rule);
      const maxPriority = activeRules && activeRules.length > 0
        ? Math.max(...activeRules.map((r: any) => r.priority || 0))
        : 0;

      const ai = await resolveAI(supabase);
      const generated_rule = await generateRule(ai, basePrompt, existingRules, instruction);

      // Salvar no histórico de treinamento com categoria e prioridade
      const { data: historyRow, error: historyErr } = await supabase
        .from("persona_training_history")
        .insert({
          agent_id,
          instruction,
          generated_rule,
          category: category || "Comportamento",
          priority: priority ?? (maxPriority + 10), // incrementa de 10 em 10 para facilitar reordenação
        })
        .select()
        .single();

      if (historyErr) throw historyErr;

      // Salvar o base_prompt se ainda não existir (primeira vez que treina)
      if (!agent.base_prompt) {
        await supabase.from("ai_agents")
          .update({ base_prompt: agent.system_prompt })
          .eq("id", agent_id);
      }

      // Reconstruir o system_prompt a partir das regras ativas
      const newSystemPrompt = await rebuildSystemPrompt(supabase, agent_id, basePrompt);

      const { error: updateErr } = await supabase
        .from("ai_agents")
        .update({ system_prompt: newSystemPrompt })
        .eq("id", agent_id);

      if (updateErr) throw updateErr;

      console.log(`[PERSONA-TRAINER] Trained agent ${agent.name}: rule added, system_prompt rebuilt (${newSystemPrompt.length} chars)`);

      return new Response(
        JSON.stringify({ training_id: historyRow.id, generated_rule, model_used: ai.model }),
        { headers: jsonHeaders }
      );
    }

    // ── REVERT (uma regra) ─────────────────────────────────────────────────────
    if (action === "revert") {
      if (!training_id) {
        return new Response(JSON.stringify({ error: "training_id is required" }), { status: 400, headers: jsonHeaders });
      }

      const { data: history, error: histErr } = await supabase
        .from("persona_training_history")
        .select("*")
        .eq("id", training_id)
        .eq("agent_id", agent_id)
        .single();

      if (histErr || !history) {
        return new Response(JSON.stringify({ error: "Training record not found" }), { status: 404, headers: jsonHeaders });
      }

      if (history.reverted_at) {
        return new Response(JSON.stringify({ error: "Rule already reverted" }), { status: 400, headers: jsonHeaders });
      }

      // Marcar como revertida
      await supabase
        .from("persona_training_history")
        .update({ reverted_at: new Date().toISOString() })
        .eq("id", training_id);

      // Reconstruir o system_prompt sem a regra revertida
      const newSystemPrompt = await rebuildSystemPrompt(supabase, agent_id, basePrompt);
      await supabase.from("ai_agents").update({ system_prompt: newSystemPrompt }).eq("id", agent_id);

      console.log(`[PERSONA-TRAINER] Reverted rule ${training_id} from agent ${agent.name}`);

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    // ── BULK_REVERT (múltiplas regras) ─────────────────────────────────────────
    if (action === "bulk_revert") {
      if (!training_ids || !Array.isArray(training_ids) || training_ids.length === 0) {
        return new Response(JSON.stringify({ error: "training_ids array is required" }), { status: 400, headers: jsonHeaders });
      }

      await supabase
        .from("persona_training_history")
        .update({ reverted_at: new Date().toISOString() })
        .in("id", training_ids)
        .eq("agent_id", agent_id);

      const newSystemPrompt = await rebuildSystemPrompt(supabase, agent_id, basePrompt);
      await supabase.from("ai_agents").update({ system_prompt: newSystemPrompt }).eq("id", agent_id);

      return new Response(JSON.stringify({ ok: true, reverted_count: training_ids.length }), { headers: jsonHeaders });
    }

    // ── LIST_RULES ─────────────────────────────────────────────────────────────
    if (action === "list_rules") {
      const { data: rules, error: rulesErr } = await supabase
        .from("persona_training_history")
        .select("id, instruction, generated_rule, category, priority, applied_at, reverted_at")
        .eq("agent_id", agent_id)
        .order("priority", { ascending: true })
        .order("applied_at", { ascending: true });

      if (rulesErr) throw rulesErr;

      const active = (rules || []).filter((r: any) => !r.reverted_at);
      const reverted = (rules || []).filter((r: any) => r.reverted_at);

      return new Response(
        JSON.stringify({ active, reverted, total: rules?.length || 0 }),
        { headers: jsonHeaders }
      );
    }

    // ── REORDER_RULES ──────────────────────────────────────────────────────────
    // Recebe um array de {id, priority} e atualiza as prioridades
    if (action === "reorder_rules") {
      const { rules: reorderList } = body;
      if (!reorderList || !Array.isArray(reorderList)) {
        return new Response(JSON.stringify({ error: "rules array is required" }), { status: 400, headers: jsonHeaders });
      }

      for (const item of reorderList) {
        if (!item.id || item.priority === undefined) continue;
        await supabase
          .from("persona_training_history")
          .update({ priority: item.priority })
          .eq("id", item.id)
          .eq("agent_id", agent_id);
      }

      // Reconstruir o system_prompt com a nova ordem
      const newSystemPrompt = await rebuildSystemPrompt(supabase, agent_id, basePrompt);
      await supabase.from("ai_agents").update({ system_prompt: newSystemPrompt }).eq("id", agent_id);

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    // ── RESET_TO_BASE ──────────────────────────────────────────────────────────
    // Remove todas as regras e restaura o prompt base
    if (action === "reset_to_base") {
      await supabase
        .from("persona_training_history")
        .update({ reverted_at: new Date().toISOString() })
        .eq("agent_id", agent_id)
        .is("reverted_at", null);

      await supabase.from("ai_agents")
        .update({ system_prompt: basePrompt })
        .eq("id", agent_id);

      console.log(`[PERSONA-TRAINER] Reset agent ${agent.name} to base prompt`);

      return new Response(JSON.stringify({ ok: true, system_prompt: basePrompt }), { headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Valid: preview, train, revert, bulk_revert, list_rules, reorder_rules, reset_to_base" }), {
      status: 400,
      headers: jsonHeaders,
    });
  } catch (e: any) {
    console.error("[PERSONA-TRAINER] Error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || "Internal error" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
