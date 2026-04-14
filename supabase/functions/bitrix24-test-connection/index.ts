import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshAccessToken(
  supabase: any,
  integration: any
): Promise<{ access_token: string; refresh_token: string } | null> {
  const clientId = Deno.env.get("BITRIX24_CLIENT_ID");
  const clientSecret = Deno.env.get("BITRIX24_CLIENT_SECRET");
  if (!clientId || !clientSecret || !integration.refresh_token) return null;

  try {
    const refreshUrl = `https://oauth.bitrix.info/oauth/token/?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${integration.refresh_token}`;
    const res = await fetch(refreshUrl);
    const data = await res.json();

    if (data.error || !data.access_token) return null;

    await supabase
      .from("bitrix24_integrations")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
      })
      .eq("id", integration.id);

    return { access_token: data.access_token, refresh_token: data.refresh_token };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integration, error: dbError } = await supabase
      .from("bitrix24_integrations")
      .select("id, domain, client_endpoint, access_token, refresh_token, connector_registered, connector_active, config, updated_at")
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

    // Try with current token first
    let token = integration.access_token;
    let testUrl = `${integration.client_endpoint}app.info?auth=${token}`;
    let bitrixRes = await fetch(testUrl);
    let bitrixData = await bitrixRes.json();

    // If expired, try to refresh
    if (bitrixData.error === "expired_token" || bitrixData.error === "WRONG_TOKEN" || bitrixData.error_description?.includes("expired")) {
      const refreshed = await refreshAccessToken(supabase, integration);
      if (refreshed) {
        token = refreshed.access_token;
        testUrl = `${integration.client_endpoint}app.info?auth=${token}`;
        bitrixRes = await fetch(testUrl);
        bitrixData = await bitrixRes.json();
      }
    }

    if (bitrixData.error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Erro Bitrix24: ${bitrixData.error_description || bitrixData.error}`,
          details: { domain: integration.domain, connector_registered: integration.connector_registered },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Gather effective status ---
    // 1. Active channel mappings
    const { data: channelMappings } = await supabase
      .from("bitrix24_channel_mappings")
      .select("id, line_id, line_name, is_active, channel")
      .eq("integration_id", integration.id);

    const activeLines = (channelMappings || []).filter((m: any) => m.is_active);

    // 2. Recent connector activation logs (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from("bitrix24_debug_logs")
      .select("event_type, error, created_at")
      .eq("integration_id", integration.id)
      .in("event_type", ["connector_activated", "connector_setup", "connector_setup_error"])
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    // 3. Last error
    const { data: lastErrorLog } = await supabase
      .from("bitrix24_debug_logs")
      .select("event_type, error, created_at")
      .eq("integration_id", integration.id)
      .not("error", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Compute effective status
    const hasActiveLines = activeLines.length > 0;
    const hadRecentActivation = (recentLogs || []).some((l: any) => l.event_type === "connector_activated" && !l.error);

    // If there are active lines or recent successful activations, the connector IS effectively registered
    const effectiveRegistered = integration.connector_registered || hasActiveLines || hadRecentActivation;
    const effectiveActive = integration.connector_active || hasActiveLines;

    // Auto-fix stale DB flags if effective status differs
    if (effectiveRegistered !== integration.connector_registered || effectiveActive !== integration.connector_active) {
      await supabase
        .from("bitrix24_integrations")
        .update({
          connector_registered: effectiveRegistered,
          connector_active: effectiveActive,
        })
        .eq("id", integration.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Conexão válida! Token ativo.",
        details: {
          domain: integration.domain,
          connector_registered: effectiveRegistered,
          connector_active: effectiveActive,
          app_status: bitrixData.result?.STATUS || "unknown",
          active_lines: activeLines.map((l: any) => ({
            line_id: l.line_id,
            line_name: l.line_name,
            channel: l.channel,
          })),
          recent_events: (recentLogs || []).map((l: any) => ({
            event: l.event_type,
            error: l.error,
            at: l.created_at,
          })),
          last_error: lastErrorLog ? {
            event: lastErrorLog.event_type,
            error: lastErrorLog.error,
            at: lastErrorLog.created_at,
          } : null,
          updated_at: integration.updated_at,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: `Erro interno: ${err instanceof Error ? err.message : String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
