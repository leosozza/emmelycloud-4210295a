import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the real Ollama URL from integration_credentials
    const { data, error } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", "qwen-local")
      .eq("credential_key", "OLLAMA_BASE_URL")
      .maybeSingle();

    if (error || !data?.credential_value) {
      return new Response(
        JSON.stringify({ ok: false, error: "Nenhuma URL do Ollama configurada na base de dados." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = data.credential_value.replace(/\/v1\/chat\/completions$/, "").replace(/\/+$/, "");

    // Test connectivity by calling /api/tags
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
    const models = (tagsData.models || []).map((m: any) => m.name);

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Conexão OK! Modelos: ${models.join(", ") || "nenhum encontrado"}`,
        url: baseUrl,
        models,
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
