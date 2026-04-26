// Pré-aquece um modelo Ollama (replica o comportamento do OpenWebUI)
// - Verifica se modelo já está em memória via /api/ps
// - Se não, faz POST /api/generate com prompt vazio e keep_alive longo
// - Faz polling até confirmar em /api/ps (timeout adaptativo por tamanho)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER_SLUG = "qwen-local";

// Heurística: timeout máximo de carregamento por nome do modelo
function maxLoadTimeoutMs(model: string): number {
  const m = model.toLowerCase();
  // Modelos grandes (30B+, 35b, 70b)
  if (/(:?35b|:?32b|:?30b|:?70b|:?34b)/.test(m)) return 360_000; // 6 min
  // Médios (7B-15B)
  if (/(:?14b|:?13b|:?8b|:?7b|qwen3|qwen2\.5)/.test(m)) return 180_000; // 3 min
  // Pequenos
  return 90_000; // 90s
}

async function getOllamaBaseUrl(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", PROVIDER_SLUG)
    .eq("credential_key", "OLLAMA_BASE_URL")
    .maybeSingle();
  if (!data?.credential_value) return null;
  return data.credential_value.replace(/\/v1\/chat\/completions$/, "").replace(/\/+$/, "");
}

async function isModelLoaded(baseUrl: string, model: string): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    const j = await r.json();
    const loaded: string[] = (j.models || []).map((m: any) => m.name || m.model || "");
    return loaded.some((n) => n === model || n.startsWith(model + ":") || model.startsWith(n));
  } catch {
    return false;
  }
}

async function triggerLoad(baseUrl: string, model: string, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        prompt: "",
        stream: false,
        keep_alive: "10m",
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${txt.substring(0, 300)}` };
    }
    await r.json().catch(() => null);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { model } = await req.json();
    if (!model || typeof model !== "string") {
      return new Response(JSON.stringify({ ready: false, error: "model required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const baseUrl = await getOllamaBaseUrl(supabase);
    if (!baseUrl) {
      return new Response(JSON.stringify({ ready: false, error: "Ollama URL não configurada" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const t0 = Date.now();

    // 1) Já está quente?
    if (await isModelLoaded(baseUrl, model)) {
      return new Response(JSON.stringify({
        ready: true,
        was_loaded: true,
        load_time_ms: 0,
        model,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Disparar carregamento (com keep_alive longo)
    const timeout = maxLoadTimeoutMs(model);
    const loadResult = await triggerLoad(baseUrl, model, timeout);

    if (!loadResult.ok) {
      const lower = (loadResult.error || "").toLowerCase();
      let friendly = loadResult.error || "Erro desconhecido";
      if (lower.includes("model failed to load") || lower.includes("resource limitations")) {
        friendly = `O servidor Ollama não conseguiu carregar **${model}** mesmo libertando memória. RAM/VRAM insuficiente para este modelo.`;
      } else if (lower.includes("not found") || lower.includes("no such file") || lower.includes("does not exist")) {
        friendly = `Modelo **${model}** não está instalado no servidor Ollama. Faz \`ollama pull ${model}\`.`;
      } else if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
        friendly = `Carregamento de **${model}** demorou mais de ${Math.round(timeout / 1000)}s. Servidor pode estar sobrecarregado.`;
      }
      return new Response(JSON.stringify({
        ready: false,
        error: friendly,
        raw_error: loadResult.error,
        load_time_ms: Date.now() - t0,
        model,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3) Confirmar via /api/ps (geralmente já está, mas confirmamos)
    const loaded = await isModelLoaded(baseUrl, model);

    return new Response(JSON.stringify({
      ready: loaded,
      was_loaded: false,
      load_time_ms: Date.now() - t0,
      model,
      ...(loaded ? {} : { warning: "Carregamento devolveu OK mas /api/ps não confirma" }),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({
      ready: false,
      error: e?.message || String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
