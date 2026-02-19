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
  const url = `${endpoint}${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
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

    // Extract member_id: from body (Bitrix24 POST) OR from URL query param (frontend GET)
    const memberId = data.auth?.member_id || data.member_id || url.searchParams.get("member_id");
    if (!memberId) {
      console.log("[SETTINGS] No member_id found, returning successfully");
      if (isJsonRequest) {
        return new Response(JSON.stringify({ integration: null }), {
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

    // If this is a SETTING_CONNECTOR placement or has LINE info, activate the connector
    if (placement === "SETTING_CONNECTOR" || lineId > 0) {
      const accessToken = await ensureValidToken(supabase, integration);

      // Step 1: Activate the connector on the Open Line
      console.log("[SETTINGS] Activating connector on LINE:", lineId);
      const activateResult = await callBitrix(integration.client_endpoint, accessToken, "imconnector.activate", {
        CONNECTOR: connectorId,
        LINE: lineId,
        ACTIVE: 1,
      });
      console.log("[SETTINGS] imconnector.activate result:", JSON.stringify(activateResult));

      // Step 2: Set connector data (handler URL for receiving messages)
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const handlerUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;

      const dataSetResult = await callBitrix(integration.client_endpoint, accessToken, "imconnector.connector.data.set", {
        CONNECTOR: connectorId,
        LINE: lineId,
        DATA: {
          id: connectorId,
          name: "Emmely Messages",
          icon: { data_image: "" },
          icon_disabled: { data_image: "" },
          placement_handler: handlerUrl,
        },
      });
      console.log("[SETTINGS] imconnector.connector.data.set result:", JSON.stringify(dataSetResult));

      // Step 3: Get Open Line config to confirm and find line name
      let lineName = `Open Line ${lineId}`;
      try {
        const configResult = await callBitrix(integration.client_endpoint, accessToken, "imopenlines.config.list.get", {
          params: { select: ["LINE_NAME", "ID"] },
        });
        if (configResult.result) {
          const lines = Array.isArray(configResult.result) ? configResult.result : Object.values(configResult.result);
          const matchedLine = lines.find((l: any) => parseInt(l.ID, 10) === lineId);
          if (matchedLine) {
            lineName = matchedLine.LINE_NAME || lineName;
          }
        }
      } catch (e) {
        console.log("[SETTINGS] Could not fetch line name:", e);
      }

      // Step 4: Upsert channel mapping
      const { data: existingMapping } = await supabase
        .from("bitrix24_channel_mappings")
        .select("id")
        .eq("integration_id", integration.id)
        .eq("line_id", lineId)
        .maybeSingle();

      if (existingMapping) {
        await supabase.from("bitrix24_channel_mappings").update({
          is_active: true,
          line_name: lineName,
          channel: "whatsapp",
        }).eq("id", existingMapping.id);
      } else {
        await supabase.from("bitrix24_channel_mappings").insert({
          integration_id: integration.id,
          line_id: lineId,
          line_name: lineName,
          channel: "whatsapp",
          is_active: true,
        });
      }

      // Step 5: Mark integration as active
      await supabase.from("bitrix24_integrations").update({
        connector_active: true,
      }).eq("id", integration.id);

      // Log success
      try {
        await supabase.from("bitrix24_debug_logs").insert({
          integration_id: integration.id,
          event_type: "connector_activated",
          direction: "outbound",
          payload: { lineId, lineName, connectorId, activateResult, dataSetResult },
        });
      } catch (_) { /* ignore log errors */ }

      console.log("[SETTINGS] Connector activated successfully on LINE:", lineId);
    }

    // If JSON format requested (frontend call), return integration data
    if (isJsonRequest) {
      return new Response(JSON.stringify({ integration }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always return "successfully" for Bitrix24 POST calls
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
