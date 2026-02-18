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

    // Get the integration record
    const { data: integration, error: dbError } = await supabase
      .from("bitrix24_integrations")
      .select("id, domain, client_endpoint, access_token, connector_registered, connector_active")
      .limit(1)
      .single();

    if (dbError || !integration) {
      return new Response(
        JSON.stringify({ ok: false, error: "Nenhuma integração encontrada." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.client_endpoint || !integration.access_token) {
      return new Response(
        JSON.stringify({ ok: false, error: "Token ou endpoint não configurado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Bitrix24 API to verify the token is valid
    const testUrl = `${integration.client_endpoint}app.info?auth=${integration.access_token}`;
    const bitrixRes = await fetch(testUrl);
    const bitrixData = await bitrixRes.json();

    if (bitrixData.error) {
      // Token expired or invalid
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Erro Bitrix24: ${bitrixData.error_description || bitrixData.error}`,
          details: { domain: integration.domain, connector_registered: integration.connector_registered },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success - token is valid
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Conexão válida! Token ativo.",
        details: {
          domain: integration.domain,
          connector_registered: integration.connector_registered,
          connector_active: integration.connector_active,
          app_status: bitrixData.result?.STATUS || "unknown",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: `Erro interno: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
