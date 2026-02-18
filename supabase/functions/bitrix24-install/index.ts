import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cspValue = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "connect-src *",
  "frame-ancestors 'self' https://*.bitrix24.com https://*.bitrix24.com.br https://*.bitrix24.eu https://*.bitrix24.es https://*.bitrix24.de https://*.bitrix24.ru",
  "font-src * data:",
].join("; ");

const htmlHeaders = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspValue,
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const CONNECTOR_ID = "emmely_connector";

// --- Helpers ---

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText);
  }
  // Parse form-urlencoded with PHP notation: auth[access_token]
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    const match = key.match(/^(\w+)\[(\w+)\]$/);
    if (match) {
      if (!data[match[1]]) data[match[1]] = {};
      data[match[1]][match[2]] = value;
    } else {
      data[key] = value;
    }
  }
  return data;
}

function cleanDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

function extractDomain(data: any, req: Request): string | null {
  // 1. client_endpoint
  if (data.auth?.client_endpoint) {
    const match = data.auth.client_endpoint.match(/https?:\/\/([^\/]+)/);
    if (match) return match[1];
  }
  // 2. auth.domain
  if (data.auth?.domain) return cleanDomain(data.auth.domain);
  // 3. DOMAIN / domain
  if (data.DOMAIN) return cleanDomain(data.DOMAIN);
  if (data.domain) return cleanDomain(data.domain);
  // 4. Referer (broader match - any domain)
  const referer = req.headers.get("referer");
  if (referer) {
    const match = referer.match(/https?:\/\/([^\/]+)/);
    if (match && !match[1].includes("supabase")) return match[1];
  }
  // 5. Origin
  const origin = req.headers.get("origin");
  if (origin && !origin.includes("supabase")) return cleanDomain(origin);
  return null;
}

async function callBitrix(
  clientEndpoint: string,
  accessToken: string,
  method: string,
  params: Record<string, any> = {}
): Promise<any> {
  const url = `${clientEndpoint}${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: accessToken }),
  });
  const data = await response.json();
  if (data.error && data.error !== "CONNECTOR_ALREADY_EXISTS") {
    console.error(`[BITRIX API] ${method} error:`, data.error, data.error_description);
  }
  return data;
}

async function debugLog(
  supabase: any,
  integrationId: string | null,
  eventType: string,
  direction: string,
  payload: any,
  error?: string
) {
  try {
    await supabase.from("bitrix24_debug_logs").insert({
      integration_id: integrationId,
      event_type: eventType,
      direction,
      payload,
      error: error || null,
    });
  } catch (e) {
    console.error("[DEBUG LOG] Failed to write:", e);
  }
}

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    console.log("[INSTALL] Received payload:", JSON.stringify(data).substring(0, 500));
    console.log("[INSTALL] Referer:", req.headers.get("referer"), "Origin:", req.headers.get("origin"));
    const auth = data.auth || {};
    // Bitrix24 sends flat uppercase keys (AUTH_ID, REFRESH_ID) or nested auth object
    const memberId = auth.member_id || data.member_id;
    const accessToken = auth.access_token || data.AUTH_ID;
    const refreshToken = auth.refresh_token || data.REFRESH_ID;
    const applicationToken = auth.application_token || data.application_token || data.APP_TOKEN;
    const domain = extractDomain(data, req);
    const expiresIn = parseInt(auth.expires_in || data.AUTH_EXPIRES || "3600");

    // For flat keys, build client_endpoint from SERVER_ENDPOINT or domain
    // Bitrix24 local apps use SERVER_ENDPOINT for REST calls
    const serverEndpoint = data.SERVER_ENDPOINT;

    if (!memberId || !accessToken) {
      await debugLog(supabase, null, "install_error", "inbound", data, "Missing member_id or access_token");
      return new Response(
        JSON.stringify({ error: "Missing member_id or access_token" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Build client_endpoint - priority: auth.client_endpoint > domain-based
    // NOTE: SERVER_ENDPOINT (oauth.bitrix.info) is the OAuth server, NOT the portal REST API
    let clientEndpoint = auth.client_endpoint;
    if (!clientEndpoint && domain) {
      clientEndpoint = `https://${domain}/rest/`;
    }
    if (!clientEndpoint) {
      await debugLog(supabase, null, "install_error", "inbound", data, "Cannot determine client_endpoint");
      return new Response(
        JSON.stringify({ error: "Cannot determine client_endpoint" }),
        { status: 400, headers: jsonHeaders }
      );
    }
    // Ensure trailing slash
    if (!clientEndpoint.endsWith("/")) clientEndpoint += "/";

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert integration
    const { data: integration, error: upsertError } = await supabase
      .from("bitrix24_integrations")
      .upsert(
        {
          member_id: memberId,
          domain: domain || "",
          client_endpoint: clientEndpoint,
          access_token: accessToken,
          refresh_token: refreshToken || "",
          expires_at: expiresAt,
          application_token: applicationToken || "",
          config: {
            installed_at: new Date().toISOString(),
            auth_payload: auth,
          },
        },
        { onConflict: "member_id" }
      )
      .select("id")
      .single();

    if (upsertError) {
      console.error("[INSTALL] Upsert error:", upsertError);
      await debugLog(supabase, null, "install_upsert_error", "inbound", data, upsertError.message);
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const integrationId = integration.id;
    await debugLog(supabase, integrationId, "install_success", "inbound", { memberId, domain });

    // --- Register Connector ---
    try {
      // 1. Register connector
      const regResult = await callBitrix(clientEndpoint, accessToken, "imconnector.register", {
        ID: CONNECTOR_ID,
        NAME: "Emmely Cloud - WhatsApp & Instagram",
        ICON: {
          DATA_IMAGE: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMiIgZmlsbD0iIzI1RDM2NiIvPjx0ZXh0IHg9IjI0IiB5PSIzMCIgZm9udC1zaXplPSIyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPkU8L3RleHQ+PC9zdmc+",
          COLOR: { BACKGROUND: "#25D366", BORDER: "#128C7E" },
          SIZE: { WIDTH: 48, HEIGHT: 48 },
          POSITION: { TOP: 0, LEFT: 0 },
        },
        ICON_DISABLED: {
          DATA_IMAGE: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMiIgZmlsbD0iIzk5OSIvPjx0ZXh0IHg9IjI0IiB5PSIzMCIgZm9udC1zaXplPSIyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPkU8L3RleHQ+PC9zdmc+",
          COLOR: { BACKGROUND: "#999", BORDER: "#666" },
          SIZE: { WIDTH: 48, HEIGHT: 48 },
          POSITION: { TOP: 0, LEFT: 0 },
        },
        PLACEMENT_HANDLER: `${supabaseUrl}/functions/v1/bitrix24-connector-settings`,
      });

      console.log("[INSTALL] Register connector result:", JSON.stringify(regResult));

      const connectorRegistered = !regResult.error || regResult.error === "CONNECTOR_ALREADY_EXISTS";

      // 2. Activate on all Open Lines
      let connectorActive = false;
      const linesResult = await callBitrix(clientEndpoint, accessToken, "imopenlines.config.list.get", {});
      const lines = linesResult.result || [];

      for (const line of lines) {
        const lineId = line.ID || line.id;
        await callBitrix(clientEndpoint, accessToken, "imconnector.activate", {
          CONNECTOR: CONNECTOR_ID,
          LINE: lineId,
          ACTIVE: 1,
        });

        // Save channel mapping
        await supabase.from("bitrix24_channel_mappings").upsert(
          {
            integration_id: integrationId,
            channel: "whatsapp",
            line_id: lineId,
            line_name: line.LINE_NAME || line.TITLE || `Line ${lineId}`,
            is_active: true,
          },
          { onConflict: "integration_id,channel,line_id", ignoreDuplicates: false }
        );

        connectorActive = true;
      }

      // 3. Bind events
      const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;
      const events = [
        "OnImConnectorMessageAdd",
        "OnImConnectorDialogStart",
        "OnImConnectorDialogFinish",
        "OnImConnectorStatusDelete",
      ];

      for (const event of events) {
        const bindResult = await callBitrix(clientEndpoint, accessToken, "event.bind", {
          event,
          handler: eventsUrl,
        });
        // "Handler already binded" is NOT an error - check both error and error_description
        const errStr = String(bindResult.error || "") + " " + String(bindResult.error_description || "");
        if (bindResult.error && !errStr.toLowerCase().includes("already")) {
          console.error(`[INSTALL] Bind ${event} failed:`, bindResult.error, bindResult.error_description);
        } else {
          console.log(`[INSTALL] Bind ${event}: OK (or already bound)`);
        }
      }

      // Update integration status
      await supabase
        .from("bitrix24_integrations")
        .update({
          connector_registered: connectorRegistered,
          connector_active: connectorActive,
        })
        .eq("id", integrationId);

      await debugLog(supabase, integrationId, "connector_setup", "outbound", {
        registered: connectorRegistered,
        active: connectorActive,
        linesCount: lines.length,
        eventsBound: events.length,
      });
    } catch (connectorError) {
      console.error("[INSTALL] Connector setup error:", connectorError);
      await debugLog(supabase, integrationId, "connector_setup_error", "outbound", null, String(connectorError));
    }

    // If called via JSON (from frontend fetch), return JSON
    if (contentType.includes("application/json")) {
      return new Response(
        JSON.stringify({ success: true, integrationId, domain }),
        { headers: jsonHeaders }
      );
    }

    // If called via form POST (legacy Bitrix24 direct), return HTML
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><script src="https://api.bitrix24.com/api/v1/"></script></head>
<body style="font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5">
<div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.1);max-width:400px">
<div style="font-size:48px;margin-bottom:16px">✅</div>
<h2 style="color:#333;margin-bottom:8px">Emmely Cloud Instalado!</h2>
<p style="color:#666;font-size:14px">Conector configurado com sucesso.</p>
</div>
<script>try{BX24.init(function(){BX24.installFinish()});}catch(e){}</script>
</body></html>`;
    return new Response(html, { headers: htmlHeaders });
  } catch (error) {
    console.error("[INSTALL] Fatal error:", error);
    await debugLog(supabase, null, "install_fatal", "inbound", null, String(error));
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
