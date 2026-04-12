import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const OLLAMA_URL = Deno.env.get("OLLAMA_URL") || "http://host.docker.internal:11434/v1/chat/completions";

async function callAI(messages: { role: string; content: string }[], model = "google/gemini-3-flash-preview") {
  const isOllama = model.startsWith("ollama");
  const apiUrl = isOllama 
    ? OLLAMA_URL 
    : "https://ai-gateway.lovable.dev/v1/chat/completions";
  
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!isOllama) headers["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: isOllama ? model.replace("ollama/", "") : model, messages, max_tokens: 1024, temperature: 0.8 }),
  });
  
  if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { simulation_id, action = "run" } = await req.json();
    if (!simulation_id) return new Response(JSON.stringify({ error: "simulation_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Load simulation
    const { data: sim, error: simErr } = await supabase
      .from("simulations")
      .select("*")
      .eq("id", simulation_id)
      .single();
    if (simErr || !sim) return new Response(JSON.stringify({ error: "Simulation not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Se a simulação já terminou e não é um restart, retorna erro
    if (sim.status === "completed" && action !== "restart") {
      return new Response(JSON.stringify({ error: "Simulation already completed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load personas
    const { data: personas } = await supabase
      .from("ai_agents")
      .select("id, name, system_prompt, personality_style, communication_tone, ai_model")
      .in("id", sim.persona_ids);
    if (!personas?.length) return new Response(JSON.stringify({ error: "No personas found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Update status e garantir current_round
    const startRound = sim.current_round || 1;
    await supabase.from("simulations").update({ status: "running" }).eq("id", simulation_id);

    const { data: existingMessages } = await supabase
      .from("simulation_messages")
      .select("round, role, content")
      .eq("simulation_id", simulation_id)
      .order("created_at", { ascending: true });

    const conversationHistory = (existingMessages || []).map(m => ({
      role: m.role,
      content: m.content,
      persona: m.role,
      round: m.round
    }));

    for (let round = startRound; round <= sim.rounds; round++) {
      // INTERVENÇÃO: Verificar se há uma pausa solicitada ou intervenção pendente
      const { data: currentSim } = await supabase.from("simulations").select("status, intervention_prompt").eq("id", simulation_id).single();
      if (currentSim?.status === "paused") {
        console.log(`[SIM-ENGINE] Simulation ${simulation_id} paused at round ${round}`);
        return new Response(JSON.stringify({ success: true, status: "paused", round }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      for (const persona of personas) {
        // Filtra história recente para não explodir contexto
        const recentHistory = conversationHistory.slice(-15);
        const historyText = recentHistory
          .map((m) => `[${m.persona}]: ${m.content}`)
          .join("\n");

        const systemPrompt = `Você é "${persona.name}" participando de uma simulação/debate.
Sua personalidade: ${persona.personality_style || "profissional"}.
Tom: ${persona.communication_tone || "neutro"}.
Instruções base: ${persona.system_prompt || "Responda de forma coerente com sua persona."}

CENÁRIO DA SIMULAÇÃO:
${sim.scenario_prompt}

${currentSim?.intervention_prompt ? `⚠️ INTERVENÇÃO DE VARIÁVEL: ${currentSim.intervention_prompt}` : ""}

Responda de forma concisa (máx 3 parágrafos). Reaja ao que os outros disseram. Rodada ${round} de ${sim.rounds}.`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...(historyText ? [{ role: "user", content: `Conversa até agora:\n${historyText}\n\nSua vez de contribuir:` }] : [{ role: "user", content: "Comece a discussão sobre o cenário apresentado." }]),
        ];

        const start = Date.now();
        // Priorizar Ollama se configurado na persona ou se for modo Simulação Global de Baixo Custo
        const modelToUse = persona.ai_model || (sim.metadata?.use_ollama ? "ollama/llama3" : "google/gemini-3-flash-preview");
        
        try {
          const response = await callAI(messages, modelToUse);
          const latency = Date.now() - start;

          conversationHistory.push({ role: persona.name, content: response, persona: persona.name, round });

          await supabase.from("simulation_messages").insert({
            simulation_id,
            persona_id: persona.id,
            round,
            content: response,
            role: persona.name,
            metadata: { latency_ms: latency, model: modelToUse },
          });
        } catch (e) {
          console.error(`[SIM-ENGINE] Error calling AI for persona ${persona.name}:`, (e as any).message);
        }
      }
      
      // Atualizar progresso da rodada
      await supabase.from("simulations").update({ current_round: round }).eq("id", simulation_id);
    }

    // Generate summary analysis
    const fullConvo = conversationHistory.map((m) => `[${m.persona}]: ${m.content}`).join("\n\n");
    const analysisPrompt = `Analise a seguinte simulação de enxame.
CENÁRIO: ${sim.scenario_prompt}
CONVERSA:
${fullConvo.substring(0, 10000)}

Gere um relatório em JSON estruturado com summary, dominant_persona, consensus_points (array), conflict_points (array) e recommendations (array).`;

    const analysisRaw = await callAI([
      { role: "system", content: "Responda APENAS em JSON válido." },
      { role: "user", content: analysisPrompt },
    ], "google/gemini-3.1-pro-preview"); // Usar um modelo melhor para a análise final

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
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
