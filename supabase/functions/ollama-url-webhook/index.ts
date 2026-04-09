import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Extract source IP
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

    // Validate secret
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

    // Validate URL
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

    // Get previous URL before updating
    const { data: prevData } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", "qwen-local")
      .eq("credential_key", "OLLAMA_BASE_URL")
      .maybeSingle();

    const previousUrl = prevData?.credential_value || null;
    const newUrl = url.trim();

    const { error } = await supabase
      .from("integration_credentials")
      .upsert(
        {
          provider: "qwen-local",
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

    // Audit log — success
    await supabase.from("ollama_url_audit").insert({
      source_ip: sourceIp,
      received_url: newUrl,
      previous_url: previousUrl,
      status: urlChanged ? "updated" : "unchanged",
      error_message: null,
      secret_valid: true,
      raw_payload: body,
    });

    return new Response(JSON.stringify({ ok: true, url: newUrl, changed: urlChanged, previous: previousUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
