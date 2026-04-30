import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDER_SLUG = "qwen-local";

async function syncOllamaProvider(supabase: any, baseUrl: string) {
  // baseUrl is the raw URL we just stored (may or may not include /v1/chat/completions)
  const cleanBase = baseUrl.replace(/\/v1\/chat\/completions$/, "").replace(/\/+$/, "");
  const result: { models: string[]; error?: string } = { models: [] };

  try {
    const resp = await fetch(`${cleanBase}/api/tags`, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      result.error = `HTTP ${resp.status} from /api/tags`;
      return result;
    }
    const json = await resp.json();
    const models = (json.models || []).map((m: any) => ({ name: m.name, display: m.name }));
    result.models = models.map((m: any) => m.name);

    // Update ai_providers with new base_url and available_models
    const fullChatUrl = `${cleanBase}/v1/chat/completions`;
    await supabase
      .from("ai_providers")
      .update({
        base_url: fullChatUrl,
        available_models: models,
        updated_at: new Date().toISOString(),
      })
      .eq("slug", PROVIDER_SLUG);

    // Clear ai_base_url on all qwen-local agents so they always use credential override
    await supabase
      .from("ai_agents")
      .update({ ai_base_url: null })
      .eq("ai_provider", PROVIDER_SLUG);

    // Reassign ai_model on agents whose current model is no longer available
    if (models.length > 0) {
      const availableNames = models.map((m: any) => m.name);
      const { data: agentsToFix } = await supabase
        .from("ai_agents")
        .select("id, ai_model")
        .eq("ai_provider", PROVIDER_SLUG);

      const fallback = availableNames[0];
      for (const a of agentsToFix || []) {
        if (!availableNames.includes(a.ai_model)) {
          await supabase
            .from("ai_agents")
            .update({ ai_model: fallback })
            .eq("id", a.id);
        }
      }
    }
  } catch (e: any) {
    result.error = e?.message || String(e);
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const sourceIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";

  let body: any;
  try {
    body = await req.json();
  } catch {
    await supabase.from("ollama_url_audit").insert({
      source_ip: sourceIp,
      status: "error",
      error_message: "Invalid JSON body",
      secret_valid: false,
      raw_payload: null,
    });
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url, secret } = body;

    const expectedSecret = Deno.env.get("OLLAMA_WEBHOOK_SECRET");
    if (expectedSecret && secret !== expectedSecret) {
      await supabase.from("ollama_url_audit").insert({
        source_ip: sourceIp,
        received_url: url || null,
        status: "rejected",
        error_message: "Invalid secret",
        secret_valid: false,
        raw_payload: body,
      });
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!url || typeof url !== "string") {
      await supabase.from("ollama_url_audit").insert({
        source_ip: sourceIp,
        received_url: null,
        status: "error",
        error_message: "Missing 'url' field",
        secret_valid: true,
        raw_payload: body,
      });
      return new Response(JSON.stringify({ error: "Missing 'url' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      new URL(url);
    } catch {
      await supabase.from("ollama_url_audit").insert({
        source_ip: sourceIp,
        received_url: url,
        status: "error",
        error_message: "Invalid URL format",
        secret_valid: true,
        raw_payload: body,
      });
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prevData } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", PROVIDER_SLUG)
      .eq("credential_key", "OLLAMA_BASE_URL")
      .maybeSingle();

    const previousUrl = prevData?.credential_value || null;
    const newUrl = url.trim();

    const { error } = await supabase
      .from("integration_credentials")
      .upsert(
        {
          provider: PROVIDER_SLUG,
          credential_key: "OLLAMA_BASE_URL",
          credential_value: newUrl,
        },
        { onConflict: "provider,credential_key" }
      );

    if (error) {
      console.error("Upsert error:", error);
      await supabase.from("ollama_url_audit").insert({
        source_ip: sourceIp,
        received_url: newUrl,
        previous_url: previousUrl,
        status: "error",
        error_message: `DB upsert failed: ${error.message}`,
        secret_valid: true,
        raw_payload: body,
      });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const urlChanged = previousUrl !== newUrl;
    console.log(`[ollama-url-webhook] URL ${urlChanged ? "CHANGED" : "unchanged"}: ${previousUrl || "(none)"} → ${newUrl}`);

    // Best-effort: sync provider models from /api/tags
    const sync = await syncOllamaProvider(supabase, newUrl);

    // Best-effort: forward URL update to external mirror endpoint (yai-update-url)
    const FORWARD_URL = "https://gkvvtfqfggddzotxltxf.supabase.co/functions/v1/yai-update-url";
    let forwardStatus: number | null = null;
    let forwardError: string | null = null;
    try {
      const fwd = await fetch(FORWARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl }),
        signal: AbortSignal.timeout(10000),
      });
      forwardStatus = fwd.status;
      if (!fwd.ok) {
        forwardError = `HTTP ${fwd.status}: ${(await fwd.text()).slice(0, 200)}`;
      }
      console.log(`[ollama-url-webhook] forwarded to yai-update-url → ${fwd.status}`);
    } catch (e: any) {
      forwardError = e?.message || String(e);
      console.warn(`[ollama-url-webhook] forward failed: ${forwardError}`);
    }
    if (sync.error) {
      console.warn("[ollama-url-webhook] sync warning:", sync.error);
    } else {
      console.log(`[ollama-url-webhook] synced ${sync.models.length} models:`, sync.models.join(", "));
    }

    await supabase.from("ollama_url_audit").insert({
      source_ip: sourceIp,
      received_url: newUrl,
      previous_url: previousUrl,
      status: urlChanged ? "updated" : "unchanged",
      error_message: sync.error ? `sync warning: ${sync.error}` : null,
      secret_valid: true,
      raw_payload: { ...body, synced_models: sync.models },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        url: newUrl,
        changed: urlChanged,
        previous: previousUrl,
        models_synced: sync.models,
        sync_error: sync.error || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ollama-url-webhook error:", e);
    await supabase.from("ollama_url_audit").insert({
      source_ip: sourceIp,
      received_url: body?.url || null,
      status: "error",
      error_message: e instanceof Error ? e.message : "Unknown error",
      secret_valid: true,
      raw_payload: body,
    }).then(() => {});
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
