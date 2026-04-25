import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER_SLUG = "qwen-local";
const MAX_MODELS_PER_RUN = 30;
const JUDGE_MODEL = "google/gemini-3-flash-preview";

// Prompts padronizados (pt-PT) — iguais para todos os modelos
const TEST_PROMPTS = [
  {
    category: "reasoning",
    prompt:
      "Um comboio sai de Lisboa às 09:00 a 80 km/h. Outro sai do Porto às 10:00 a 100 km/h, em sentido contrário, na mesma linha. A distância entre Lisboa e Porto é de 300 km. A que horas se cruzam? Mostra o raciocínio em 3 linhas no máximo.",
  },
  {
    category: "knowledge",
    prompt:
      "Em duas frases curtas, explica o que é o Regulamento Geral sobre a Proteção de Dados (RGPD) e a quem se aplica.",
  },
  {
    category: "instruction",
    prompt:
      'Responde APENAS com um objeto JSON válido com as chaves "titulo" (string) e "passos" (array de 3 strings curtas) descrevendo como configurar um servidor Ollama. Nada antes nem depois do JSON.',
  },
];

interface ModelResult {
  model: string;
  reasoning_score: number | null;
  knowledge_score: number | null;
  instruction_score: number | null;
  quality_score: number | null;
  avg_latency_ms: number;
  tokens_per_second: number;
  recommendation: string;
  error?: string;
  per_prompt: Array<{
    category: string;
    latency_ms: number;
    response_excerpt: string;
    score: number | null;
    judge_reason?: string;
  }>;
}

async function fetchModels(baseUrl: string): Promise<string[]> {
  const url = baseUrl.replace(/\/+$/, "") + "/api/tags";
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`/api/tags retornou ${resp.status}`);
  const data = await resp.json();
  return (data.models || []).map((m: any) => m.name).filter(Boolean);
}

async function callOllamaChat(
  baseUrl: string,
  model: string,
  prompt: string,
): Promise<{ text: string; latency_ms: number }> {
  const url = baseUrl.replace(/\/+$/, "") + "/api/chat";
  const start = Date.now();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
      options: { temperature: 0.2, num_predict: 400 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const latency_ms = Date.now() - start;
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Ollama ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data?.message?.content || data?.response || "";
  return { text, latency_ms };
}

async function judgeAnswer(
  apiKey: string,
  category: string,
  prompt: string,
  answer: string,
): Promise<{ score: number; reason: string }> {
  if (!answer || !answer.trim()) return { score: 0, reason: "Resposta vazia" };

  const systemPrompt = `És um avaliador rigoroso de respostas de modelos de IA. Avalia a qualidade da resposta numa escala de 0 a 100, considerando:
- Categoria "reasoning": correção do raciocínio matemático/lógico e da resposta final.
- Categoria "knowledge": precisão factual e clareza.
- Categoria "instruction": cumprimento estrito do formato pedido (ex.: JSON válido).
Penaliza fortemente respostas vazias, irrelevantes, incoerentes ou que não cumpram o formato pedido. Devolve uma nota inteira entre 0 e 100 e uma razão curta (máx. 100 caracteres).`;

  const userPrompt = `Categoria: ${category}
PERGUNTA:
${prompt}

RESPOSTA DO MODELO:
${answer.slice(0, 2000)}

Avalia.`;

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_score",
              description: "Submete a nota e a razão.",
              parameters: {
                type: "object",
                properties: {
                  score: { type: "integer", minimum: 0, maximum: 100 },
                  reason: { type: "string", maxLength: 200 },
                },
                required: ["score", "reason"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_score" } },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("RATE_LIMIT");
    if (resp.status === 402) throw new Error("CREDITS_EXHAUSTED");
    const t = await resp.text().catch(() => "");
    throw new Error(`Judge ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) return { score: 50, reason: "Sem tool_call" };
  try {
    const args = JSON.parse(tc.function.arguments);
    const score = Math.max(0, Math.min(100, Number(args.score) || 0));
    return { score, reason: String(args.reason || "").slice(0, 200) };
  } catch {
    return { score: 50, reason: "JSON inválido do juiz" };
  }
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.round(words * 1.3);
}

async function benchmarkOneModel(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<ModelResult> {
  const result: ModelResult = {
    model,
    reasoning_score: null,
    knowledge_score: null,
    instruction_score: null,
    quality_score: null,
    avg_latency_ms: 0,
    tokens_per_second: 0,
    recommendation: "Uso geral",
    per_prompt: [],
  };

  const latencies: number[] = [];
  const totalTokens: number[] = [];
  const scoresByCat: Record<string, number> = {};

  for (const tp of TEST_PROMPTS) {
    try {
      const { text, latency_ms } = await callOllamaChat(baseUrl, model, tp.prompt);
      latencies.push(latency_ms);
      totalTokens.push(estimateTokens(text));

      let score: number | null = null;
      let judge_reason = "";
      try {
        const j = await judgeAnswer(apiKey, tp.category, tp.prompt, text);
        score = j.score;
        judge_reason = j.reason;
        scoresByCat[tp.category] = j.score;
      } catch (e: any) {
        if (e.message === "RATE_LIMIT" || e.message === "CREDITS_EXHAUSTED") {
          throw e; // bubble up
        }
        judge_reason = `Erro juiz: ${e.message}`;
      }

      result.per_prompt.push({
        category: tp.category,
        latency_ms,
        response_excerpt: text.slice(0, 300),
        score,
        judge_reason,
      });
    } catch (e: any) {
      if (e.message === "RATE_LIMIT" || e.message === "CREDITS_EXHAUSTED") throw e;
      result.error = e.message?.slice(0, 300) || String(e);
      result.recommendation = "Indisponível";
      return result;
    }
  }

  result.reasoning_score = scoresByCat["reasoning"] ?? null;
  result.knowledge_score = scoresByCat["knowledge"] ?? null;
  result.instruction_score = scoresByCat["instruction"] ?? null;

  const validScores = Object.values(scoresByCat).filter((v) => typeof v === "number");
  if (validScores.length) {
    result.quality_score =
      Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100;
  }

  if (latencies.length) {
    result.avg_latency_ms = Math.round(
      latencies.reduce((a, b) => a + b, 0) / latencies.length,
    );
    const totalText = totalTokens.reduce((a, b) => a + b, 0);
    const totalSec = latencies.reduce((a, b) => a + b, 0) / 1000;
    result.tokens_per_second =
      totalSec > 0 ? Math.round((totalText / totalSec) * 100) / 100 : 0;
  }

  return result;
}

function assignRecommendations(results: ModelResult[]) {
  const usable = results.filter((r) => !r.error && r.quality_score !== null);
  if (!usable.length) return;

  let best = usable[0];
  let fastest = usable[0];
  let balanced = usable[0];
  let bestQ = -1;
  let bestSpeed = -1;
  let bestBal = -1;

  for (const r of usable) {
    if ((r.quality_score ?? 0) > bestQ) {
      bestQ = r.quality_score ?? 0;
      best = r;
    }
    if (r.tokens_per_second > bestSpeed) {
      bestSpeed = r.tokens_per_second;
      fastest = r;
    }
    const bal = (r.quality_score ?? 0) * Math.log10(Math.max(2, r.tokens_per_second + 1));
    if (bal > bestBal) {
      bestBal = bal;
      balanced = r;
    }
  }

  for (const r of usable) {
    if (r === best) r.recommendation = "🥇 Mais inteligente";
    else if (r === fastest) r.recommendation = "⚡ Mais rápido";
    else if (r === balanced) r.recommendation = "⚖️ Melhor custo/benefício";
    else r.recommendation = "Uso geral";
  }
}

async function runBenchmarkBackground(
  supabase: any,
  baseUrl: string,
  apiKey: string,
  toRun: string[],
  onlyModel: string | null,
) {
  // Marcar como "running" para feedback imediato no front
  for (const m of toRun) {
    await supabase
      .from("ollama_model_benchmarks")
      .upsert(
        {
          provider_slug: PROVIDER_SLUG,
          model_name: m,
          recommendation: "A avaliar…",
          error_message: "__running__",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_slug,model_name" },
      );
  }

  console.log(`[ollama-benchmark] BG: a avaliar ${toRun.length} modelo(s):`, toRun);

  const results: ModelResult[] = [];
  for (const m of toRun) {
    console.log(`[ollama-benchmark] BG -> ${m}`);
    let r: ModelResult;
    try {
      r = await benchmarkOneModel(baseUrl, apiKey, m);
    } catch (e: any) {
      const isRate = e.message === "RATE_LIMIT";
      const isCred = e.message === "CREDITS_EXHAUSTED";
      r = {
        model: m,
        reasoning_score: null,
        knowledge_score: null,
        instruction_score: null,
        quality_score: null,
        avg_latency_ms: 0,
        tokens_per_second: 0,
        recommendation: "Indisponível",
        error: isRate
          ? "Limite de pedidos Lovable AI atingido"
          : isCred
            ? "Créditos Lovable AI esgotados"
            : e.message?.slice(0, 300) || String(e),
        per_prompt: [],
      };
    }
    results.push(r);

    // Persistir individualmente para o front ver progresso
    await supabase
      .from("ollama_model_benchmarks")
      .upsert(
        {
          provider_slug: PROVIDER_SLUG,
          model_name: r.model,
          quality_score: r.quality_score,
          reasoning_score: r.reasoning_score,
          knowledge_score: r.knowledge_score,
          instruction_score: r.instruction_score,
          avg_latency_ms: r.avg_latency_ms || null,
          tokens_per_second: r.tokens_per_second || null,
          recommendation: r.recommendation,
          raw_results: { per_prompt: r.per_prompt },
          error_message: r.error || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_slug,model_name" },
      );
  }

  // Recalcular recomendações com base em TODAS as linhas (não só esta corrida)
  if (!onlyModel) {
    const { data: allRows } = await supabase
      .from("ollama_model_benchmarks")
      .select("model_name, quality_score, tokens_per_second, error_message")
      .eq("provider_slug", PROVIDER_SLUG);

    const usable: ModelResult[] = (allRows || [])
      .filter((r: any) => !r.error_message && r.quality_score !== null)
      .map((r: any) => ({
        model: r.model_name,
        quality_score: r.quality_score,
        tokens_per_second: r.tokens_per_second || 0,
        reasoning_score: null,
        knowledge_score: null,
        instruction_score: null,
        avg_latency_ms: 0,
        recommendation: "Uso geral",
        per_prompt: [],
      }));

    assignRecommendations(usable);
    for (const r of usable) {
      await supabase
        .from("ollama_model_benchmarks")
        .update({ recommendation: r.recommendation })
        .eq("provider_slug", PROVIDER_SLUG)
        .eq("model_name", r.model);
    }
  }

  console.log(`[ollama-benchmark] BG: concluído (${results.length} modelo(s))`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    let onlyModel: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.model) onlyModel = String(body.model);
      } catch {}
    }
    const u = new URL(req.url);
    if (!onlyModel && u.searchParams.get("model")) onlyModel = u.searchParams.get("model");

    // Ler URL
    const { data: cred, error: credErr } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", PROVIDER_SLUG)
      .eq("credential_key", "OLLAMA_BASE_URL")
      .maybeSingle();

    if (credErr || !cred?.credential_value) {
      return new Response(
        JSON.stringify({ ok: false, error: "URL do Ollama não configurada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const baseUrl = String(cred.credential_value).replace(/\/+$/, "");

    let models: string[];
    try {
      models = await fetchModels(baseUrl);
    } catch (e: any) {
      return new Response(
        JSON.stringify({ ok: false, error: `Falha ao listar modelos: ${e.message}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!models.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "Servidor Ollama não tem modelos." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let toRun = models;
    if (onlyModel) {
      if (!models.includes(onlyModel)) {
        return new Response(
          JSON.stringify({ ok: false, error: `Modelo "${onlyModel}" não existe no servidor.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      toRun = [onlyModel];
    } else if (toRun.length > MAX_MODELS_PER_RUN) {
      toRun = toRun.slice(0, MAX_MODELS_PER_RUN);
    }

    // ⚡ Corre em background — devolve imediatamente
    // @ts-ignore — EdgeRuntime existe no runtime Supabase
    EdgeRuntime.waitUntil(
      runBenchmarkBackground(supabase, baseUrl, apiKey, toRun, onlyModel).catch((e) =>
        console.error("[ollama-benchmark] BG falhou:", e),
      ),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        queued: true,
        evaluated: toRun.length,
        total_models: models.length,
        message:
          "Avaliação iniciada em background. A tabela atualiza-se à medida que cada modelo termina (5–60s por modelo).",
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[ollama-benchmark] error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e.message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
