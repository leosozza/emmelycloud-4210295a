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
  "frame-ancestors *",
  "font-src * data:",
].join("; ");

const htmlHeaders = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspValue,
  "X-Frame-Options": "ALLOWALL",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) return JSON.parse(bodyText);
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

function extractMemberId(data: any): string | null {
  return data.auth?.member_id || data.member_id || null;
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
    const formatParam = url.searchParams.get("format");
    const memberIdParam = url.searchParams.get("member_id");
    const acceptHeader = req.headers.get("accept") || "";

    // JSON mode: GET with format=json or Accept: application/json
    const wantsJson = formatParam === "json" || acceptHeader.includes("application/json") || req.method === "GET";

    let memberId: string | null = memberIdParam;

    // For POST requests, parse the body
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      const bodyText = await req.text();
      const data = parseBody(bodyText, contentType);
      console.log("[SETTINGS] Payload:", JSON.stringify(data).substring(0, 300));
      if (!memberId) memberId = extractMemberId(data);
    }

    let integration = null;
    let mappings: any[] = [];
    let recentLogs: any[] = [];

    if (memberId) {
      const { data: intData } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .eq("member_id", memberId)
        .single();
      integration = intData;

      if (integration) {
        const { data: mapData } = await supabase
          .from("bitrix24_channel_mappings")
          .select("*")
          .eq("integration_id", integration.id)
          .eq("is_active", true);
        mappings = mapData || [];

        // Fetch recent debug logs
        const { data: logData } = await supabase
          .from("bitrix24_debug_logs")
          .select("event_type, direction, created_at, error")
          .eq("integration_id", integration.id)
          .order("created_at", { ascending: false })
          .limit(20);
        recentLogs = logData || [];
      }
    }

    // --- JSON Response ---
    if (wantsJson && req.method === "GET") {
      const jsonResponse = {
        integration: integration ? {
          id: integration.id,
          member_id: integration.member_id,
          domain: integration.domain,
          connector_registered: integration.connector_registered,
          connector_active: integration.connector_active,
          updated_at: integration.updated_at,
        } : null,
        channels: mappings.map((m: any) => ({
          channel: m.channel,
          line_id: m.line_id,
          line_name: m.line_name,
          is_active: m.is_active,
        })),
        recent_logs: recentLogs,
      };
      return new Response(JSON.stringify(jsonResponse), { headers: jsonHeaders });
    }

    // --- If connector is fully active, return "successfully" (Bitrix24 expects this) ---
    if (integration?.connector_active && integration?.connector_registered) {
      return new Response("successfully", {
        headers: { ...htmlHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // --- HTML Response (Bitrix24 placement handler / settings slider) ---
    const statusIcon = integration?.connector_active ? "🟢" : "🔴";
    const statusText = integration?.connector_active ? "Ativo" : "Inativo";

    const channelRows = mappings.length > 0
      ? mappings.map((m: any) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${m.channel}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${m.line_name || m.line_id}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${m.is_active ? "✅" : "❌"}</td>
        </tr>
      `).join("")
      : `<tr><td colspan="3" style="padding:16px;text-align:center;color:#999;">Nenhum canal mapeado</td></tr>`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="frame-ancestors *;">
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #fff; color: #333; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e5e5; }
    .logo { width: 40px; height: 40px; background: #25D366; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; }
    .status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 13px; background: ${integration?.connector_active ? "#e8f5e9" : "#ffeaea"}; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #e5e5e5; font-size: 13px; color: #666; text-transform: uppercase; }
    .info { background: #f0f7ff; border: 1px solid #cce0ff; border-radius: 8px; padding: 12px 16px; margin-top: 20px; font-size: 13px; color: #1a5276; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">E</div>
    <div>
      <h2 style="margin:0;font-size:18px;">Emmely Cloud</h2>
      <span class="status">${statusIcon} ${statusText}</span>
    </div>
  </div>

  ${integration ? `
    <p style="font-size:14px;color:#666;">Portal: <strong>${integration.domain || memberId}</strong></p>
    
    <h3 style="font-size:15px;margin-top:24px;">Canais Configurados</h3>
    <table>
      <thead>
        <tr>
          <th>Canal</th>
          <th>Open Line</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${channelRows}
      </tbody>
    </table>

    <div class="info">
      ℹ️ Os canais são configurados automaticamente durante a instalação. Para gerenciar conversas, acesse o Contact Center do Bitrix24.
    </div>
  ` : `
    <div class="info">
      ⚠️ Integração não encontrada. Reinstale o aplicativo Emmely Cloud.
    </div>
  `}

  <script>
    try { BX24.init(function() { BX24.fitWindow(); }); } catch(e) {}
  </script>
</body>
</html>`;

    return new Response(html, { headers: htmlHeaders });
  } catch (error) {
    console.error("[SETTINGS] Error:", error);
    return new Response(`<html><body><p>Erro: ${error}</p></body></html>`, {
      status: 500,
      headers: htmlHeaders,
    });
  }
});
