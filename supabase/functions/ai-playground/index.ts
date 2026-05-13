import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RAG_TOP_K = 8;

// ─── FTS search helper (mesma abordagem do ai-process-message) ───
async function ftsSearch(supabase: any, queryText: string, docIds: string[], topK: number): Promise<any[]> {
  try {
    const searchTerms = queryText
      .replace(/[^\w\sáàâãéèêíìîóòôõúùûçñ]/gi, " ")
      .split(/\s+/)
      .filter((t: string) => t.length > 2)
      .slice(0, 10)
      .join(" ");
    if (!searchTerms) return [];
    const { data: results, error } = await supabase.rpc("search_chunks_fts", {
      search_query: searchTerms,
      doc_ids: docIds,
      max_results: topK,
    });
    if (error) { console.log("[AI-PLAYGROUND] FTS error:", error.message); return []; }
    return results || [];
  } catch (e) {
    console.log("[AI-PLAYGROUND] FTS failed:", e);
    return [];
  }
}

function buildKnowledgeBlock(chunks: { content: string }[]): string {
  if (chunks.length === 0) return "";
  const rows = chunks
    .map((c, i) => `[Fonte ${i + 1}] ${(c.content || "").trim()}`)
    .join("\n\n");
  return `\n\n--- BASE DE CONHECIMENTO (especialista nesta área) ---\n${rows}\n--- FIM ---\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_id, messages, stream } = await req.json();
    if (!agent_id || !messages) {
      return new Response(JSON.stringify({ error: "agent_id and messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wantStream = stream === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: agent, error: agentErr } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RAG: buscar chunks relevantes para a última mensagem do utilizador ───
    const { data: linkedDocs } = await supabase
      .from("agent_knowledge_documents")
      .select("document_id")
      .eq("agent_id", agent_id);

    let knowledgeContext = "";
    let ragMethod: "fts" | "fallback" | "none" = "none";
    let ragChunkCount = 0;

    if (linkedDocs && linkedDocs.length > 0) {
      const docIds = linkedDocs.map((d: any) => d.document_id);

      // Última mensagem do utilizador como query
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
      const queryText: string = (lastUserMsg?.content || "").toString();
      const meaningfulWords = queryText
        .split(/\s+/)
        .filter((w) => w.length > 2).length;

      let chunks: any[] = [];

      if (meaningfulWords >= 2) {
        chunks = await ftsSearch(supabase, queryText, docIds, RAG_TOP_K);
        if (chunks.length > 0) ragMethod = "fts";
      }

      // Fallback sequencial se FTS não devolver nada (saudações, perguntas curtas)
      if (chunks.length === 0) {
        const { data: seqChunks } = await supabase
          .from("knowledge_chunks")
          .select("content")
          .in("document_id", docIds)
          .order("chunk_index")
          .limit(RAG_TOP_K);
        chunks = seqChunks || [];
        if (chunks.length > 0) ragMethod = "fallback";
      }

      if (chunks.length > 0) {
        knowledgeContext = buildKnowledgeBlock(chunks);
        ragChunkCount = chunks.length;
      }
    }

    // ─── Montagem do system prompt: persona (base_prompt) + instruções (system_prompt) + KB + regras ───
    const personaBlock = agent.base_prompt ? `${agent.base_prompt}\n\n` : "";
    const instructionsBlock = agent.system_prompt || "";

    const groundingRule = knowledgeContext
      ? `\n\nREGRA DE ESPECIALISTA:\n- Tu és especialista exclusivamente nesta área. Responde sempre dentro deste domínio.\n- Baseia as tuas respostas PRIORITARIAMENTE na BASE DE CONHECIMENTO acima. Não inventes factos que não estejam lá.\n- Quando usares informação da base, cita a fonte entre parêntesis: [Fonte 1], [Fonte 2], etc.\n- Se a pergunta sair do teu domínio ou a informação não estiver na base, diz claramente: "Não tenho essa informação na minha base de conhecimento" e oferece encaminhamento.\n`
      : "";

    const autoLangPrompt = `\n\nIDIOMA: Deteta automaticamente o idioma da primeira mensagem do utilizador e responde SEMPRE nesse mesmo idioma durante toda a conversa. Não perguntes o idioma — adapta-te silenciosamente. Suportas: Português, English, Español, Français, Deutsch, Italiano, 中文, 日本語, العربية, e outros.\n`;

    const systemPrompt = personaBlock + instructionsBlock + knowledgeContext + groundingRule + autoLangPrompt;

    console.log(`[AI-PLAYGROUND] agent="${agent.name}" model=${agent.ai_model} rag_method=${ragMethod} chunks=${ragChunkCount} ctx=${systemPrompt.length}chars`);

    let apiUrl: string;
    let apiKey: string;
    let authHeader: string | null = "Authorization";
    let authPrefix: string | null = "Bearer";

    if (agent.ai_provider === "lovable") {
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    } else {
      const { data: provider } = await supabase
        .from("ai_providers")
        .select("*")
        .eq("slug", agent.ai_provider)
        .single();

      apiUrl = agent.ai_base_url || provider?.base_url || "";
      authHeader = provider?.auth_header || null;
      authPrefix = provider?.auth_prefix || null;

      if (provider?.credential_key === "base_url" || !authHeader) {
        const { data: urlOverride } = await supabase
          .from("integration_credentials")
          .select("credential_value")
          .eq("provider", agent.ai_provider)
          .eq("credential_key", "OLLAMA_BASE_URL")
          .single();
        if (urlOverride?.credential_value) {
          let baseUrl = urlOverride.credential_value.replace(/\/+$/, "");
          if (!baseUrl.endsWith("/v1/chat/completions")) {
            baseUrl += "/v1/chat/completions";
          }
          apiUrl = baseUrl;
        }
      }

      const credKey = agent.ai_api_key_credential || (provider?.credential_key !== "base_url" ? provider?.credential_key : null);
      if (credKey) {
        const { data: cred } = await supabase
          .from("integration_credentials")
          .select("credential_value")
          .eq("provider", agent.ai_provider)
          .eq("credential_key", credKey)
          .single();
        apiKey = cred?.credential_value || "";
      } else {
        apiKey = "";
      }
    }

    if (!apiUrl) {
      return new Response(JSON.stringify({ error: "No API URL configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Pré-aquecimento Ollama (replica comportamento do OpenWebUI) ───
    // Para providers locais (não-Lovable), garantimos que o modelo está carregado
    // ANTES de tentar inferir. Isto evita erros "model failed to load" durante
    // o chat e suporta swap automático entre modelos no mesmo servidor.
    if (agent.ai_provider !== "lovable") {
      try {
        const warmRes = await supabase.functions.invoke("ollama-warm-model", {
          body: { model: agent.ai_model },
        });
        const warmData = warmRes.data as any;
        if (warmData && warmData.ready === false) {
          const friendly = warmData.error
            || `Não foi possível preparar o modelo **${agent.ai_model}** no servidor Ollama.`;
          return new Response(JSON.stringify({
            content: friendly,
            error: "model_warmup_failed",
            model: agent.ai_model,
            load_time_ms: warmData.load_time_ms,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        console.log(`[AI-PLAYGROUND] warm-up: ${agent.ai_model} ready=${warmData?.ready} was_loaded=${warmData?.was_loaded} load_ms=${warmData?.load_time_ms}`);
      } catch (warmErr) {
        console.warn("[AI-PLAYGROUND] warm-up call failed (continuing anyway):", warmErr);
      }
    }

    const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader && apiKey) {
      fetchHeaders[authHeader] = `${authPrefix || ""} ${apiKey}`.trim();
    }

    // Timeout (3 min) — após warm-up, a inferência em si é rápida
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: fetchHeaders,
      signal: controller.signal,
      body: JSON.stringify({
        model: agent.ai_model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: Math.min(1, Math.max(0, agent.temperature || 0.7)),
        stream: wantStream,
      }),
    }).catch((err) => {
      clearTimeout(timeoutId);
      throw err;
    });

    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Erros típicos do Ollama (modelo não cabe, modelo inexistente, etc.) ───
      const lower = errorText.toLowerCase();
      let friendly: string | null = null;
      if (lower.includes("model failed to load") || lower.includes("resource limitations")) {
        friendly = `O modelo **${agent.ai_model}** não cabe na memória do servidor Ollama (sem RAM/VRAM suficiente). Escolhe um modelo mais leve no agente, ou peça ao admin para libertar memória / reiniciar o serviço Ollama.`;
      } else if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist"))) {
        friendly = `O modelo **${agent.ai_model}** não está instalado neste servidor Ollama. Faz \`ollama pull ${agent.ai_model}\` no servidor ou escolhe outro modelo.`;
      } else if (aiResponse.status === 524 || lower.includes("timeout occurred") || lower.includes("error code 524")) {
        friendly = `O servidor Ollama remoto não respondeu dentro do limite (Cloudflare 524 — ~100s). O modelo **${agent.ai_model}** é demasiado pesado para este túnel. Use um modelo mais leve (ex: \`llama3.2:3b\`) ou aumente os recursos do servidor.`;
      }

      if (friendly) {
        return new Response(JSON.stringify({
          content: friendly,
          error: "model_unavailable",
          model: agent.ai_model,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        content: agent.fallback_message || "Erro ao processar.",
        error: "AI API error",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Streaming pass-through ───
    if (wantStream && aiResponse.body) {
      return new Response(aiResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ─── Non-streaming (legacy) ───
    const result = await aiResponse.json();
    const content = result.choices?.[0]?.message?.content || agent.fallback_message || "";
    const usage = result.usage || {};

    console.log(`[AI-PLAYGROUND] Token usage: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}`);

    return new Response(JSON.stringify({ content, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-playground error:", e);
    const isAbort = e?.name === "AbortError";
    return new Response(JSON.stringify({
      error: isAbort
        ? "O modelo não respondeu em 3 min. Verifica se o servidor Ollama está activo ou escolhe um modelo mais leve."
        : (e instanceof Error ? e.message : "Unknown error"),
    }), {
      status: isAbort ? 504 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
