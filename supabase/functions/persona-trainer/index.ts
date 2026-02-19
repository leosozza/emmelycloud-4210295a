import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, agent_id, instruction, training_id } = await req.json();

    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load agent
    const { data: agent, error: agentErr } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PREVIEW ──────────────────────────────────────────────────────────────
    if (action === "preview") {
      if (!instruction) {
        return new Response(JSON.stringify({ error: "instruction is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const generated_rule = await generateRule(agent, instruction, supabase);

      return new Response(JSON.stringify({ generated_rule }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── TRAIN ─────────────────────────────────────────────────────────────────
    if (action === "train") {
      if (!instruction) {
        return new Response(JSON.stringify({ error: "instruction is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const generated_rule = await generateRule(agent, instruction, supabase);

      // Append rule to system_prompt
      const separator = "\n\n---\n";
      const ruleBlock = `[Regra de Treinamento] ${generated_rule}`;
      const newSystemPrompt = (agent.system_prompt || "") + separator + ruleBlock;

      const { error: updateErr } = await supabase
        .from("ai_agents")
        .update({ system_prompt: newSystemPrompt })
        .eq("id", agent_id);

      if (updateErr) throw updateErr;

      // Record training history
      const { data: historyRow, error: historyErr } = await supabase
        .from("persona_training_history")
        .insert({
          agent_id,
          instruction,
          generated_rule,
        })
        .select()
        .single();

      if (historyErr) throw historyErr;

      return new Response(
        JSON.stringify({ training_id: historyRow.id, generated_rule }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── REVERT ────────────────────────────────────────────────────────────────
    if (action === "revert") {
      if (!training_id) {
        return new Response(JSON.stringify({ error: "training_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: history, error: histErr } = await supabase
        .from("persona_training_history")
        .select("*")
        .eq("id", training_id)
        .eq("agent_id", agent_id)
        .single();

      if (histErr || !history) {
        return new Response(JSON.stringify({ error: "Training record not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove the rule block from system_prompt
      const ruleBlock = `\n\n---\n[Regra de Treinamento] ${history.generated_rule}`;
      const newSystemPrompt = (agent.system_prompt || "").replace(ruleBlock, "");

      const { error: updateErr } = await supabase
        .from("ai_agents")
        .update({ system_prompt: newSystemPrompt })
        .eq("id", agent_id);

      if (updateErr) throw updateErr;

      // Mark as reverted
      await supabase
        .from("persona_training_history")
        .update({ reverted_at: new Date().toISOString() })
        .eq("id", training_id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("persona-trainer error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateRule(agent: any, instruction: string, supabase: any): Promise<string> {
  // Use Lovable AI gateway to generate a concise behavioral rule
  const apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";

  const systemMessage = `Você é um especialista em configuração de assistentes de IA.
Dado um prompt de sistema de um assistente e uma instrução de treinamento em linguagem natural,
gere uma regra comportamental concisa e clara (1-2 frases) que será adicionada ao comportamento da IA.
A regra deve ser específica, acionável e escrita em terceira pessoa como instrução ao agente.
Responda APENAS com a regra, sem explicações adicionais.`;

  const userMessage = `Prompt de sistema atual do agente:
${agent.system_prompt || "(sem prompt)"}

Instrução de treinamento:
${instruction}

Gere a regra comportamental:`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    // Fallback: use instruction as-is
    return instruction;
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim() || instruction;
}
