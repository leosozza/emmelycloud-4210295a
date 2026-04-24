import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER_SLUG = "qwen-local";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Allow caller to optionally request persistence of fetched models
  let persist = false;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      persist = !!body?.persist;
    } catch {
      // ignore
    }
  } else {
    const url = new URL(req.url);
    persist = url.searchParams.get("persist") === "1";
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", PROVIDER_SLUG)
      .eq("credential_key", "OLLAMA_BASE_URL")
      .maybeSingle();

    if (error || !data?.credential_value) {
      return new Response(
        JSON.stringify({ ok: false, error: "Nenhuma URL do Ollama configurada na base de dados." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = data.credential_value.replace(/\/v1\/chat\/completions$/, "").replace(/\/+$/, "");

    let resp;
    try {
      resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
    } catch (fetchErr: any) {
      const msg = fetchErr.message || String(fetchErr);
      const isDns = msg.includes("dns") || msg.includes("lookup");
      return new Response(
        JSON.stringify({
          ok: false,
          url: baseUrl,
          error: isDns
            ? "Servidor Ollama inacessível — o túnel Cloudflare pode ter expirado."
            : `Erro de conexão: ${msg}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `Servidor respondeu com HTTP ${resp.status}`, url: baseUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tagsData = await resp.json();
    const modelObjs = (tagsData.models || []).map((m: any) => ({ name: m.name, display: m.name }));
    const models = modelObjs.map((m: any) => m.name);

    let persisted = false;
    let agents_updated = 0;
    if (persist && modelObjs.length > 0) {
      const fullChatUrl = `${baseUrl}/v1/chat/completions`;
      await supabase
        .from("ai_providers")
        .update({
          base_url: fullChatUrl,
          available_models: modelObjs,
          updated_at: new Date().toISOString(),
        })
        .eq("slug", PROVIDER_SLUG);

      // Clear stale ai_base_url on agents
      await supabase
        .from("ai_agents")
        .update({ ai_base_url: null })
        .eq("ai_provider", PROVIDER_SLUG);

      // Reassign ai_model where current model no longer exists
      const { data: agents } = await supabase
        .from("ai_agents")
        .select("id, ai_model")
        .eq("ai_provider", PROVIDER_SLUG);

      const fallback = models[0];
      for (const a of agents || []) {
        if (!models.includes(a.ai_model)) {
          await supabase.from("ai_agents").update({ ai_model: fallback }).eq("id", a.id);
          agents_updated++;
        }
      }

      persisted = true;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Conexão OK! Modelos: ${models.join(", ") || "nenhum encontrado"}`,
        url: baseUrl,
        models,
        persisted,
        agents_updated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const msg = err.message || String(err);
    const isDns = msg.includes("dns") || msg.includes("lookup");
    return new Response(
      JSON.stringify({
        ok: false,
        error: isDns
          ? "Servidor Ollama inacessível — o túnel Cloudflare pode ter expirado. Reinicie o túnel e atualize a URL."
          : `Erro: ${msg}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
