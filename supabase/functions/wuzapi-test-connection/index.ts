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
    const { action, base_url, admin_token, webhook_url } = body as Record<string, string>;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve credentials: prefer body params, fallback to integration_credentials
    let resolvedBaseUrl = base_url?.trim();
    let resolvedAdminToken = admin_token?.trim();
    let resolvedUserToken = "";

    if (!resolvedBaseUrl || !resolvedAdminToken) {
      const { data: creds } = await supabase
        .from("integration_credentials")
        .select("credential_key, credential_value")
        .eq("provider", "wuzapi");

      if (creds) {
        for (const c of creds) {
          if (c.credential_key === "WUZAPI_BASE_URL" && !resolvedBaseUrl) resolvedBaseUrl = c.credential_value?.trim();
          if (c.credential_key === "WUZAPI_ADMIN_TOKEN" && !resolvedAdminToken) resolvedAdminToken = c.credential_value?.trim();
          if (c.credential_key === "WUZAPI_USER_TOKEN") resolvedUserToken = c.credential_value?.trim() || "";
        }
      }
    } else {
      // Still try to get existing user token
      const { data: creds } = await supabase
        .from("integration_credentials")
        .select("credential_key, credential_value")
        .eq("provider", "wuzapi")
        .eq("credential_key", "WUZAPI_USER_TOKEN");
      if (creds?.[0]) resolvedUserToken = creds[0].credential_value?.trim() || "";
    }

    if (!resolvedBaseUrl) {
      return new Response(JSON.stringify({ ok: false, error: "URL do servidor não configurada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resolvedAdminToken) {
      return new Response(JSON.stringify({ ok: false, error: "Admin Token não configurado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove trailing slash
    resolvedBaseUrl = resolvedBaseUrl.replace(/\/+$/, "");

    // ── Auto-create user if no user token exists ──
    if (!resolvedUserToken) {
      console.log("[WUZAPI-TEST] No user token found, auto-creating user via admin API...");
      try {
        const generatedToken = crypto.randomUUID().replace(/-/g, "");
        const createRes = await fetch(`${resolvedBaseUrl}/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": resolvedAdminToken },
          body: JSON.stringify({ name: "emmely", token: generatedToken }),
        });

        const createBody = await createRes.json().catch(() => ({}));
        console.log("[WUZAPI-TEST] Create user response:", createRes.status, JSON.stringify(createBody));

        // Token can be in createBody.data.token, createBody.token, or use the generated one
        const returnedToken = (createBody?.data?.token || createBody?.token || "").trim();
        if (createRes.ok && (returnedToken || generatedToken)) {
          resolvedUserToken = returnedToken || generatedToken;
          // Save the auto-created user token
          await supabase.from("integration_credentials").upsert(
            { provider: "wuzapi", credential_key: "WUZAPI_USER_TOKEN", credential_value: resolvedUserToken },
            { onConflict: "provider,credential_key" }
          );
          console.log("[WUZAPI-TEST] User token auto-created and saved");
        } else if (createRes.status === 409 || createBody.error?.includes("already exists")) {
          // User already exists, try to get token via list
          console.log("[WUZAPI-TEST] User already exists, fetching user list...");
          const listRes = await fetch(`${resolvedBaseUrl}/admin/users`, {
            method: "GET",
            headers: { "Authorization": resolvedAdminToken },
          });
          const listBody = await listRes.json().catch(() => ([]));
          console.log("[WUZAPI-TEST] User list response:", listRes.status, JSON.stringify(listBody).slice(0, 500));

          const rawList = Array.isArray(listBody) ? listBody : listBody.data || listBody.users || [];
          const users = Array.isArray(rawList) ? rawList : [];
          const emmelyUser = users.find((u: any) => u.name === "emmely" || u.Name === "emmely");
          if (emmelyUser) {
            // Token can be in .token or .Token field; if empty, use .id as fallback
            resolvedUserToken = (emmelyUser.token || emmelyUser.Token || emmelyUser.id || "").trim();
            if (resolvedUserToken) {
              await supabase.from("integration_credentials").upsert(
                { provider: "wuzapi", credential_key: "WUZAPI_USER_TOKEN", credential_value: resolvedUserToken },
                { onConflict: "provider,credential_key" }
              );
              console.log("[WUZAPI-TEST] User token retrieved from list and saved");
            }
          }
        } else {
          console.error("[WUZAPI-TEST] Failed to create user:", JSON.stringify(createBody));
          return new Response(JSON.stringify({ ok: false, error: `Erro ao criar user WUZAPI: ${createBody.error || createBody.message || createRes.status}` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.error("[WUZAPI-TEST] Auto-create user failed:", e);
        return new Response(JSON.stringify({ ok: false, error: "Falha ao criar user automático no servidor WUZAPI" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!resolvedUserToken) {
      return new Response(JSON.stringify({ ok: false, error: "Não foi possível obter user token do servidor", status: "unconfigured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: configure webhook ──
    if (action === "configure_webhook" && webhook_url) {
      const whRes = await fetch(`${resolvedBaseUrl}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": resolvedUserToken },
        body: JSON.stringify({ WebhookURL: webhook_url, Events: ["Message"] }),
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

    // ── Action: disconnect/logout session ──
    if (action === "disconnect") {
      try {
        const logoutRes = await fetch(`${resolvedBaseUrl}/session/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": resolvedUserToken },
        });
        const logoutBody = await logoutRes.text();
        console.log("[WUZAPI-TEST] Logout response:", logoutRes.status, logoutBody);
        // "no session" means already disconnected — treat as success
        const isNoSession = logoutBody.includes("no session");
        const success = logoutRes.ok || isNoSession;
        return new Response(JSON.stringify({ ok: success, message: success ? "Sessão desconectada com sucesso" : logoutBody }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("[WUZAPI-TEST] Logout failed:", e);
        return new Response(JSON.stringify({ ok: false, error: "Falha ao desconectar sessão" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Action: connect session ──
    if (action === "connect") {
      const connectRes = await fetch(`${resolvedBaseUrl}/session/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": resolvedUserToken },
        body: JSON.stringify({ Subscribe: ["Message"], Immediate: true }),
      });

      const connectBody = await connectRes.text();
      console.log("[WUZAPI-TEST] Connect response:", connectRes.status, connectBody);

      return new Response(JSON.stringify({ ok: connectRes.ok, message: connectRes.ok ? "Sessão iniciada" : connectBody }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Default: check status + QR ──
    // Check session status
    let sessionStatus = "unknown";
    let sessionRawConnected = false;
    let connected = false;
    let loggedIn = false;
    let qrCode: string | null = null;
    let phoneNumber: string | null = null;
    let currentEvents = "";

    try {
      const statusRes = await fetch(`${resolvedBaseUrl}/session/status`, {
        method: "GET",
        headers: { "token": resolvedUserToken },
      });
      const statusBody = await statusRes.json().catch(() => ({}));
      console.log("[WUZAPI-TEST] Status:", JSON.stringify(statusBody));

      // Handle nested {code, data: {...}} structure from WUZAPI
      const statusData = statusBody.data || statusBody;

      const isSessionConnected = Boolean(statusData.Connected || statusData.connected);
      const isLoggedIn = Boolean(statusData.LoggedIn || statusData.loggedIn);
      const currentEvents = (statusData.events || statusData.Events || "").toString().trim();

      loggedIn = isLoggedIn;
      connected = isLoggedIn;
      sessionRawConnected = isSessionConnected;

      // Extract phone number from Jid (format: 5511999999999@s.whatsapp.net)
      const jid = statusData.Jid || statusData.jid || statusData.JID || "";
      if (jid) {
        phoneNumber = jid.split("@")[0].split(":")[0];
      }

      if (isLoggedIn) {
        sessionStatus = "connected";
      } else if (isSessionConnected) {
        sessionStatus = "pending";
        qrCode = statusData.QRCode || statusData.qrcode || statusData.qr_code || null;
      } else {
        sessionStatus = "disconnected";
        qrCode = statusData.QRCode || statusData.qrcode || statusData.qr_code || null;
      }
    } catch (e) {
      console.error("[WUZAPI-TEST] Status check failed:", e);
      return new Response(JSON.stringify({ ok: false, error: "Não foi possível contactar o servidor", status: "error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If not authenticated and no QR from status, try dedicated QR endpoint
    if (!loggedIn && !qrCode) {
      try {
        const qrRes = await fetch(`${resolvedBaseUrl}/session/qr`, {
          method: "GET",
          headers: { "token": resolvedUserToken },
        });

        if (qrRes.ok) {
          const contentType = qrRes.headers.get("content-type") || "";
          if (contentType.includes("image")) {
            const buffer = await qrRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            qrCode = `data:${contentType};base64,${base64}`;
          } else {
            const qrBody = await qrRes.json().catch(() => ({}));
            const qrData = qrBody.data || qrBody;
            qrCode = qrData.QRCode || qrData.qrcode || qrData.qr_code || null;
          }
        }
      } catch (e) {
        console.log("[WUZAPI-TEST] QR fetch failed:", e);
      }
    }

    // ── Auto-configure webhook + events only when fully authenticated ──
    let webhookConfigured = false;
    let eventsSubscribed = false;
    if (loggedIn) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const autoWebhookUrl = `${supabaseUrl}/functions/v1/wuzapi-webhook`;
        console.log("[WUZAPI-TEST] Auto-configuring webhook + events:", autoWebhookUrl);
        const whRes = await fetch(`${resolvedBaseUrl}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": resolvedUserToken },
          body: JSON.stringify({ WebhookURL: autoWebhookUrl, Events: ["Message"] }),
        });
        if (whRes.ok) {
          webhookConfigured = true;
          eventsSubscribed = true;
          console.log("[WUZAPI-TEST] Webhook + events auto-configured successfully");
        } else {
          const whErr = await whRes.text();
          console.error("[WUZAPI-TEST] Webhook auto-configure failed:", whErr);
        }
      } catch (e) {
        console.error("[WUZAPI-TEST] Webhook auto-configure error:", e);
      }

      // Fallback: if events still empty, try dedicated subscribe endpoint
      if (!eventsSubscribed || !currentEvents) {
        try {
          console.log("[WUZAPI-TEST] Subscribing to Message events via /session/subscribe...");
          const subRes = await fetch(`${resolvedBaseUrl}/session/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "token": resolvedUserToken },
            body: JSON.stringify({ Subscribe: ["Message"] }),
          });
          const subBody = await subRes.text();
          console.log("[WUZAPI-TEST] Subscribe response:", subRes.status, subBody);
          if (subRes.ok) eventsSubscribed = true;
        } catch (e) {
          console.log("[WUZAPI-TEST] Subscribe endpoint failed (may not exist):", e);
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      status: sessionStatus,
      connected,
      logged_in: loggedIn,
      session_connected: sessionRawConnected,
      phone_number: loggedIn ? phoneNumber : null,
      qr_code: qrCode,
      webhook_configured: webhookConfigured,
      message: loggedIn
        ? "WhatsApp conectado" + (phoneNumber ? ` (${phoneNumber})` : "") + (webhookConfigured ? " e webhook configurado" : "")
        : (qrCode ? "Leia o QR Code para conectar" : "Sessão desconectada"),
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
