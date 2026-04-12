import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function callAI(messages: { role: string; content: string }[], model = "google/gemini-3-flash-preview") {
  const res = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.8 }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { simulation_id } = await req.json();
    if (!simulation_id) return new Response(JSON.stringify({ error: "simulation_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Load simulation
    const { data: sim, error: simErr } = await supabase
      .from("simulations")
      .select("*")
      .eq("id", simulation_id)
      .single();
    if (simErr || !sim) return new Response(JSON.stringify({ error: "Simulation not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Load personas
    const { data: personas } = await supabase
      .from("ai_agents")
      .select("id, name, system_prompt, personality_style, communication_tone")
      .in("id", sim.persona_ids);
    if (!personas?.length) return new Response(JSON.stringify({ error: "No personas found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Update status
    await supabase.from("simulations").update({ status: "running" }).eq("id", simulation_id);

    const conversationHistory: { role: string; content: string; persona: string }[] = [];

    for (let round = 1; round <= sim.rounds; round++) {
      for (const persona of personas) {
        const historyText = conversationHistory
          .map((m) => `[${m.persona}]: ${m.content}`)
          .join("\n");

        const systemPrompt = `Você é "${persona.name}" participando de uma simulação/debate.
Sua personalidade: ${persona.personality_style || "profissional"}.
Tom: ${persona.communication_tone || "neutro"}.
Instruções base: ${persona.system_prompt || "Responda de forma coerente com sua persona."}

CENÁRIO DA SIMULAÇÃO:
${sim.scenario_prompt}

Responda de forma concisa (máx 3 parágrafos). Reaja ao que os outros disseram. Rodada ${round} de ${sim.rounds}.`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...(historyText ? [{ role: "user", content: `Conversa até agora:\n${historyText}\n\nSua vez de contribuir:` }] : [{ role: "user", content: "Comece a discussão sobre o cenário apresentado." }]),
        ];

        const start = Date.now();
        const response = await callAI(messages);
        const latency = Date.now() - start;

        conversationHistory.push({ role: persona.name, content: response, persona: persona.name });

        await supabase.from("simulation_messages").insert({
          simulation_id,
          persona_id: persona.id,
          round,
          content: response,
          role: persona.name,
          metadata: { latency_ms: latency },
        });
      }
    }

    // Generate summary analysis
    const fullConvo = conversationHistory.map((m) => `[${m.persona}]: ${m.content}`).join("\n\n");
    const analysisPrompt = `Analise a seguinte simulação com ${personas.length} personas em ${sim.rounds} rodadas.

CENÁRIO: ${sim.scenario_prompt}

CONVERSA:
${fullConvo}

Gere um relatório em JSON com:
- "summary": resumo geral (2-3 parágrafos)
- "dominant_persona": nome da persona que mais influenciou
- "consensus_points": array de pontos de consenso
- "conflict_points": array de pontos de conflito
- "recommendations": array de recomendações práticas
- "sentiment_per_persona": objeto { nome: "positivo/neutro/negativo" }`;

    const analysisRaw = await callAI([
      { role: "system", content: "Responda APENAS em JSON válido." },
      { role: "user", content: analysisPrompt },
    ]);

    let results;
    try {
      const cleaned = analysisRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      results = JSON.parse(cleaned);
    } catch {
      results = { summary: analysisRaw, error: "Could not parse structured analysis" };
    }

    await supabase
      .from("simulations")
      .update({ status: "completed", results, completed_at: new Date().toISOString() })
      .eq("id", simulation_id);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
