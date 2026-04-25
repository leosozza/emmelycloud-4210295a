import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER_SLUG = "qwen-local";
const PING_PROMPT = "Responde apenas com a palavra: pong";
const PING_TIMEOUT_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let model: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.model) model = String(body.model);
      } catch {}
    }
    const u = new URL(req.url);
    if (!model && u.searchParams.get("model")) model = u.searchParams.get("model");

    if (!model) {
      return new Response(
        JSON.stringify({ ok: false, error: "Parâmetro 'model' obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cred, error: credErr } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", PROVIDER_SLUG)
      .eq("credential_key", "OLLAMA_BASE_URL")
      .maybeSingle();

    if (credErr || !cred?.credential_value) {
      return new Response(
        JSON.stringify({ ok: false, model, error: "URL do Ollama não configurada." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = String(cred.credential_value)
      .replace(/\/v1\/chat\/completions$/, "")
      .replace(/\/+$/, "");

    const start = Date.now();
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: "user", content: PING_PROMPT }],
          options: { temperature: 0, num_predict: 8 },
        }),
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
    } catch (e: any) {
      const latency_ms = Date.now() - start;
      const msg = e?.message || String(e);
      const isTimeout = msg.includes("timeout") || msg.includes("aborted");
      return new Response(
        JSON.stringify({
          ok: false,
          model,
          latency_ms,
          error: isTimeout
            ? `Sem resposta em ${PING_TIMEOUT_MS / 1000}s — modelo demasiado lento ou indisponível.`
            : `Erro de conexão: ${msg}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const latency_ms = Date.now() - start;

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          ok: false,
          model,
          latency_ms,
          error: `Ollama HTTP ${resp.status}: ${t.slice(0, 200)}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json().catch(() => ({}));
    const text = (data?.message?.content || data?.response || "").trim();

    return new Response(
      JSON.stringify({
        ok: true,
        model,
        latency_ms,
        response_excerpt: text.slice(0, 80),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
