import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Token optimization utilities (TOON-inspired) ───

// Serializa chunks da KB em formato tabular compacto (reduz ~35% vs texto livre)
function chunksToToon(chunks: { content: string }[]): string {
  if (chunks.length === 0) return "";
  const rows = chunks.map((c, i) =>
    `  ${i + 1},${c.content.replace(/,/g, ";").replace(/\n+/g, " ").trim().substring(0, 500)}`
  );
  return `KB[${chunks.length}]{idx,content}:\n${rows.join("\n")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_id, messages } = await req.json();
    if (!agent_id || !messages) {
      return new Response(JSON.stringify({ error: "agent_id and messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get agent config
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

    // Get linked knowledge documents — serializar em TOON tabular
    const { data: linkedDocs } = await supabase
      .from("agent_knowledge_documents")
      .select("document_id")
      .eq("agent_id", agent_id);

    let knowledgeContext = "";
    if (linkedDocs && linkedDocs.length > 0) {
      const docIds = linkedDocs.map((d: any) => d.document_id);
      const { data: chunks } = await supabase
        .from("knowledge_chunks")
        .select("content")
        .in("document_id", docIds)
        .order("chunk_index")
        .limit(20);

      if (chunks && chunks.length > 0) {
        const kbToon = chunksToToon(chunks);
        knowledgeContext = `\n\n--- BASE DE CONHECIMENTO ---\n${kbToon}\n--- FIM ---\n`;
      }
    }

    const autoLangPrompt = `\n\nIDIOMA: Deteta automaticamente o idioma da primeira mensagem do utilizador e responde SEMPRE nesse mesmo idioma durante toda a conversa. Não perguntes o idioma — adapta-te silenciosamente. Suportas: Português, English, Español, Français, Deutsch, Italiano, 中文, 日本語, العربية, e outros.\n`;
    const systemPrompt = (agent.system_prompt || "") + knowledgeContext + autoLangPrompt;

    // Determine API URL and key
    let apiUrl: string;
    let apiKey: string;
    let authHeader: string | null = "Authorization";
    let authPrefix: string | null = "Bearer";

    if (agent.ai_provider === "lovable") {
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    } else {
      // Custom provider - get from ai_providers table or agent config
      const { data: provider } = await supabase
        .from("ai_providers")
        .select("*")
        .eq("slug", agent.ai_provider)
        .single();

      apiUrl = agent.ai_base_url || provider?.base_url || "";
      authHeader = provider?.auth_header || null;
      authPrefix = provider?.auth_prefix || null;

      // Check for dynamic base_url override in integration_credentials
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

      // Get API key from integration_credentials
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

    // Build request headers — skip auth for providers without auth_header (e.g. Ollama)
    const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader && apiKey) {
      fetchHeaders[authHeader] = `${authPrefix || ""} ${apiKey}`.trim();
    }

    // Call AI API
    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify({
        model: agent.ai_model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: Math.min(1, Math.max(0, agent.temperature || 0.7)),
      }),
    });

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

      return new Response(JSON.stringify({
        content: agent.fallback_message || "Erro ao processar.",
        error: "AI API error",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await aiResponse.json();
    const content = result.choices?.[0]?.message?.content || agent.fallback_message || "";
    const usage = result.usage || {};

    console.log(`[AI-PLAYGROUND] Token usage: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}`);

    return new Response(JSON.stringify({ content, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-playground error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
