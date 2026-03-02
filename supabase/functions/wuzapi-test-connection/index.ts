import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action, base_url, user_token, admin_token, webhook_url } = body as Record<string, string>;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve credentials: prefer body params, fallback to integration_credentials
    let resolvedBaseUrl = base_url?.trim();
    let resolvedUserToken = user_token?.trim();
    let resolvedAdminToken = admin_token?.trim();

    if (!resolvedBaseUrl || !resolvedUserToken) {
      const { data: creds } = await supabase
        .from("integration_credentials")
        .select("credential_key, credential_value")
        .eq("provider", "wuzapi");

      if (creds) {
        for (const c of creds) {
          if (c.credential_key === "WUZAPI_BASE_URL" && !resolvedBaseUrl) resolvedBaseUrl = c.credential_value?.trim();
          if (c.credential_key === "WUZAPI_USER_TOKEN" && !resolvedUserToken) resolvedUserToken = c.credential_value?.trim();
          if (c.credential_key === "WUZAPI_ADMIN_TOKEN" && !resolvedAdminToken) resolvedAdminToken = c.credential_value?.trim();
        }
      }
    }

    if (!resolvedBaseUrl) {
      return new Response(JSON.stringify({ ok: false, error: "URL do servidor não configurada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove trailing slash
    resolvedBaseUrl = resolvedBaseUrl.replace(/\/+$/, "");

    // ── Action: configure webhook ──
    if (action === "configure_webhook" && webhook_url) {
      if (!resolvedUserToken) {
        return new Response(JSON.stringify({ ok: false, error: "User Token não configurado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const whRes = await fetch(`${resolvedBaseUrl}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": resolvedUserToken },
        body: JSON.stringify({ WebhookURL: webhook_url }),
      });

      const whBody = await whRes.text();
      if (!whRes.ok) {
        return new Response(JSON.stringify({ ok: false, error: `Erro ao configurar webhook: ${whBody}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, message: "Webhook configurado com sucesso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: connect session ──
    if (action === "connect") {
      if (!resolvedUserToken) {
        return new Response(JSON.stringify({ ok: false, error: "User Token não configurado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const connectRes = await fetch(`${resolvedBaseUrl}/session/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": resolvedUserToken },
      });

      const connectBody = await connectRes.text();
      console.log("[WUZAPI-TEST] Connect response:", connectRes.status, connectBody);

      return new Response(JSON.stringify({ ok: connectRes.ok, message: connectRes.ok ? "Sessão iniciada" : connectBody }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Default: check status + QR ──
    if (!resolvedUserToken) {
      return new Response(JSON.stringify({ ok: false, error: "User Token não configurado", status: "unconfigured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check session status
    let sessionStatus = "unknown";
    let connected = false;

    try {
      const statusRes = await fetch(`${resolvedBaseUrl}/session/status`, {
        method: "GET",
        headers: { "token": resolvedUserToken },
      });
      const statusBody = await statusRes.json().catch(() => ({}));
      console.log("[WUZAPI-TEST] Status:", JSON.stringify(statusBody));

      if (statusBody.Connected || statusBody.connected) {
        connected = true;
        sessionStatus = "connected";
      } else {
        sessionStatus = "disconnected";
      }
    } catch (e) {
      console.error("[WUZAPI-TEST] Status check failed:", e);
      return new Response(JSON.stringify({ ok: false, error: "Não foi possível contactar o servidor", status: "error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If disconnected, get QR code
    let qrCode: string | null = null;
    if (!connected) {
      try {
        const qrRes = await fetch(`${resolvedBaseUrl}/session/qr`, {
          method: "GET",
          headers: { "token": resolvedUserToken },
        });
        
        if (qrRes.ok) {
          const contentType = qrRes.headers.get("content-type") || "";
          if (contentType.includes("image")) {
            // QR returned as image - convert to base64
            const buffer = await qrRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            qrCode = `data:${contentType};base64,${base64}`;
          } else {
            const qrBody = await qrRes.json().catch(() => ({}));
            qrCode = qrBody.QRCode || qrBody.qrcode || qrBody.code || null;
          }
        }
      } catch (e) {
        console.log("[WUZAPI-TEST] QR fetch failed:", e);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      status: sessionStatus,
      connected,
      qr_code: qrCode,
      message: connected ? "WhatsApp conectado" : (qrCode ? "Leia o QR Code para conectar" : "Sessão desconectada"),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[WUZAPI-TEST] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
