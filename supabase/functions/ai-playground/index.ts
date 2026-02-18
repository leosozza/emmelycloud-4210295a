import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Get linked knowledge documents for context
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
        knowledgeContext = "\n\n--- BASE DE CONHECIMENTO ---\n" +
          chunks.map((c: any) => c.content).join("\n\n") +
          "\n--- FIM DA BASE DE CONHECIMENTO ---\n";
      }
    }

    const systemPrompt = (agent.system_prompt || "") + knowledgeContext;

    // Determine API URL and key
    let apiUrl: string;
    let apiKey: string;
    let authHeader = "Authorization";
    let authPrefix = "Bearer";

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
      authHeader = provider?.auth_header || "Authorization";
      authPrefix = provider?.auth_prefix || "Bearer";

      // Get API key from integration_credentials
      const credKey = agent.ai_api_key_credential || provider?.credential_key;
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

    // Call AI API
    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        [authHeader]: `${authPrefix} ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: agent.ai_model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: agent.temperature || 0.7,
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
