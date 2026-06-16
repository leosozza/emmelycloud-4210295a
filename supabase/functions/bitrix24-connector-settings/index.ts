import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONNECTOR_ID = "emmely_connector";

function parsePhpStyleBody(bodyText: string): Record<string, any> {
  if (!bodyText) return {};
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};

  for (const [key, value] of params.entries()) {
    // Support nested PHP-style arrays: data[FIELD][SUBFIELD] or auth[member_id]
    const parts = key.match(/([^\[\]]+)/g);
    if (parts && parts.length > 1) {
      let current = data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    } else {
      data[key] = value;
    }
  }
  return data;
}

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) {
    try { return JSON.parse(bodyText); } catch { return {}; }
  }
  return parsePhpStyleBody(bodyText);
}

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}?auth=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return await res.json();
}

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return integration.access_token;
  }

  console.log("[SETTINGS] Refreshing token...");
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error}`);

  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);

  integration.access_token = data.access_token;
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const isJsonRequest = url.searchParams.get("format") === "json";
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    console.log("[SETTINGS] Received:", JSON.stringify(data).substring(0, 500));

    // Extract member_id and domain from body or URL
    const memberId = data.auth?.member_id || data.member_id || url.searchParams.get("member_id");
    const domainParam = data.domain || url.searchParams.get("domain");

    // Helper to fetch permissions + restriction flag for an integration
    async function getAppAccessData(integrationRow: any) {
      let appPermissions: string[] = [];
      let appRestrictionEnabled = false;
      if (!integrationRow) return { appPermissions, appRestrictionEnabled };

      // Check config flag
      const cfg = integrationRow.config || {};
      appRestrictionEnabled = cfg.restrict_app_access === true;

      if (appRestrictionEnabled) {
        try {
          const { data: permRows } = await supabase
            .from("bitrix24_user_permissions")
            .select("bitrix_user_id")
            .eq("integration_id", integrationRow.id)
            .eq("module", "emmely_app");
          if (permRows && permRows.length > 0) {
            appPermissions = permRows.map((r: any) => r.bitrix_user_id);
          }
        } catch (e) {
          console.log("[SETTINGS] Permission fetch error:", e);
        }
      }
      return { appPermissions, appRestrictionEnabled };
    }

    if (!memberId) {
      console.log("[SETTINGS] No member_id found, trying domain:", domainParam);

      // Try resolving by domain first, then fallback to most recent
      let resolvedIntegration: any = null;
      if (domainParam) {
        const { data: byDomain } = await supabase
          .from("bitrix24_integrations")
          .select("*")
          .eq("domain", domainParam)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedIntegration = byDomain;
      }
      if (!resolvedIntegration) {
        const { data: latest } = await supabase
          .from("bitrix24_integrations")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedIntegration = latest;
      }

      console.log("[SETTINGS] Auto-resolved integration:", resolvedIntegration?.id || "none");

      if (isJsonRequest) {
        const accessData = await getAppAccessData(resolvedIntegration);
        return new Response(JSON.stringify({
          integration: resolvedIntegration || null,
          appPermissions: accessData.appPermissions,
          appRestrictionEnabled: accessData.appRestrictionEnabled,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response("successfully", {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Find integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .eq("member_id", memberId)
      .single();

    if (!integration) {
      console.error("[SETTINGS] Integration not found for:", memberId);
      return new Response("successfully", {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Parse PLACEMENT_OPTIONS - Bitrix24 sends this when opening the settings slider
    let placementOptions: Record<string, any> = {};
    if (data.PLACEMENT_OPTIONS) {
      try {
        placementOptions = typeof data.PLACEMENT_OPTIONS === "string"
          ? JSON.parse(data.PLACEMENT_OPTIONS)
          : data.PLACEMENT_OPTIONS;
      } catch {
        placementOptions = {};
      }
    }

    const lineId = placementOptions.LINE ? parseInt(placementOptions.LINE, 10) : 0;
    const activeStatus = placementOptions.ACTIVE_STATUS;
    const connectorId = placementOptions.CONNECTOR || CONNECTOR_ID;
    const placement = data.PLACEMENT || "";

    console.log("[SETTINGS] Placement:", placement, "LINE:", lineId, "ACTIVE_STATUS:", activeStatus, "CONNECTOR:", connectorId);

    // Log for debugging
    try {
      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration.id,
        event_type: "connector_settings",
        direction: "inbound",
        payload: { placement, placementOptions, memberId },
      });
    } catch (_) { /* ignore log errors */ }

    // If this is a SETTING_CONNECTOR placement or has LINE info, sync the connector
    // state to whatever the user picked in the Bitrix Contact Center slider.
    if (placement === "SETTING_CONNECTOR" || lineId > 0) {
      const accessToken = await ensureValidToken(supabase, integration);

      // Determine user intent from ACTIVE_STATUS sent by the slider.
      // Bitrix sends "Y"/"N" (or 1/0). Default to active when omitted because
      // the legacy slider opens with the intent to enable.
      const rawStatus = String(activeStatus ?? "").toUpperCase();
      const shouldActivate = !(rawStatus === "N" || rawStatus === "0" || rawStatus === "FALSE");

      console.log("[SETTINGS] User intent for LINE", lineId, ":", shouldActivate ? "ACTIVATE" : "DEACTIVATE");
      const activateResult = await callBitrix(integration.client_endpoint, accessToken, "imconnector.activate", {
        CONNECTOR: connectorId,
        LINE: lineId,
        ACTIVE: shouldActivate ? 1 : 0,
      });
      console.log("[SETTINGS] imconnector.activate result:", JSON.stringify(activateResult));

      // Only push connector data when activating (deactivation doesn't need it).
      let dataSetResult: any = null;
      if (shouldActivate) {
        const frontendUrl = Deno.env.get("FRONTEND_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/bitrix24-connector-settings`;
        dataSetResult = await callBitrix(integration.client_endpoint, accessToken, "imconnector.connector.data.set", {
          CONNECTOR: connectorId,
          LINE: lineId,
          DATA: {
            ID: connectorId,
            NAME: "Emmely Messages",
            URL: frontendUrl,
            URL_IM: frontendUrl,
          },
        });
        console.log("[SETTINGS] imconnector.connector.data.set result:", JSON.stringify(dataSetResult));
      }

      // Resolve line name for the mapping.
      let lineName = `Open Line ${lineId}`;
      try {
        const configResult = await callBitrix(integration.client_endpoint, accessToken, "imopenlines.config.list.get", {});
        if (configResult.result) {
          const lines = Array.isArray(configResult.result) ? configResult.result : Object.values(configResult.result);
          const matchedLine = lines.find((l: any) => parseInt(l.ID, 10) === lineId);
          if (matchedLine) lineName = matchedLine.LINE_NAME || lineName;
        }
      } catch (e) {
        console.log("[SETTINGS] Could not fetch line name:", e);
      }

      // Upsert channel mapping reflecting user intent.
      const { data: existingMapping } = await supabase
        .from("bitrix24_channel_mappings")
        .select("id")
        .eq("integration_id", integration.id)
        .eq("line_id", lineId)
        .maybeSingle();

      if (existingMapping) {
        await supabase.from("bitrix24_channel_mappings").update({
          is_active: shouldActivate,
          line_name: lineName,
          channel: "whatsapp",
          connector_id: connectorId,
        }).eq("id", existingMapping.id);
      } else if (shouldActivate) {
        await supabase.from("bitrix24_channel_mappings").insert({
          integration_id: integration.id,
          line_id: lineId,
          line_name: lineName,
          channel: "whatsapp",
          is_active: true,
          connector_id: connectorId,
        });
      }

      // Mark integration registered (only flip connector_active true when activating).
      const integUpdate: Record<string, any> = { connector_registered: true };
      if (shouldActivate) integUpdate.connector_active = true;
      await supabase.from("bitrix24_integrations").update(integUpdate).eq("id", integration.id);

      try {
        await supabase.from("bitrix24_debug_logs").insert({
          integration_id: integration.id,
          event_type: shouldActivate ? "connector_activated" : "connector_deactivated",
          direction: "outbound",
          payload: { lineId, lineName, connectorId, shouldActivate, activateResult, dataSetResult },
        });
      } catch (_) { /* ignore log errors */ }

      console.log("[SETTINGS] Connector", shouldActivate ? "activated" : "deactivated", "on LINE:", lineId);
    }

    // If JSON format requested (frontend call), return integration data + permissions
    if (isJsonRequest) {
      const accessData = await getAppAccessData(integration);
      return new Response(JSON.stringify({
        integration,
        appPermissions: accessData.appPermissions,
        appRestrictionEnabled: accessData.appRestrictionEnabled,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For Bitrix24 PLACEMENT_HANDLER calls — return HTML with BX24.installFinish()
    // This is required for the connector activation flow in Contact Center
    if (placement === "SETTING_CONNECTOR" || lineId > 0) {
      return new Response(`<!DOCTYPE html>
<html>
<head>
  <script src="//api.bitrix24.com/api/v1/"></script>
  <script>
    BX24.init(function() {
      BX24.installFinish();
    });
  </script>
</head>
<body>
  <p>Emmely Messages configurado com sucesso!</p>
</body>
</html>`, {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Plain text for other Bitrix24 POST calls
    return new Response("successfully", {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("[SETTINGS] Error:", error);
    return new Response("successfully", {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
