import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(value: string) {
  return (value || "").replace(/[^0-9]/g, "");
}

function extractGupshupAppDetails(payload: any) {
  const roots = [payload, payload?.profile, payload?.business, payload?.data, payload?.app].filter(Boolean);
  const appName = roots
    .map((item: any) => item?.wabaName || item?.appName || item?.srcName)
    .find((value: any) => typeof value === "string" && value.trim())?.trim() || "";
  const source = normalizePhone(
    roots
      .map((item: any) => item?.phoneNumber || item?.phone || item?.source || item?.contactNumber)
      .find((value: any) => typeof value === "string" && value.trim()) || ""
  );
  return { appName, source };
}

async function fetchGupshupAppDetails(apiKey: string, appId: string) {
  const urls = [
    `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/business/profile`,
    `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/business`,
  ];
  for (const url of urls) {
    const response = await fetch(url, { headers: { apikey: apiKey, accept: "application/json" } });
    const rawText = await response.text();
    let payload: any = {};
    try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }
    if (!response.ok) continue;
    const details = extractGupshupAppDetails(payload);
    if (details.appName || details.source) return details;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Verify user
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = user.id;

  // Check admin role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role for DB operations on integration_credentials
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (req.method === "GET") {
    // Return all credentials (values masked for display, full for edge functions)
    const { data, error } = await serviceClient
      .from("integration_credentials")
      .select("id, provider, credential_key, credential_value, updated_at");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mask values for frontend display - ONLY sensitive keys (like api keys, secrets, tokens) are masked.
    const masked = (data || []).map((row: any) => {
      const val = row.credential_value || "";
      const keyUpper = (row.credential_key || "").toUpperCase();
      const isSensitive = 
        keyUpper.includes("API_KEY") || 
        keyUpper.includes("SECRET") || 
        keyUpper.includes("TOKEN") || 
        keyUpper.includes("PASSWORD") || 
        keyUpper.includes("PRIVATE") || 
        (keyUpper.includes("KEY") && !keyUpper.includes("APP_NAME") && !keyUpper.includes("SOURCE_NUMBER") && !keyUpper.includes("APP_ID"));
      
      const shouldMask = isSensitive;
      const isStripePk = keyUpper.includes("STRIPE") && val.startsWith("pk_");
      return {
        ...row,
        credential_value_masked: shouldMask
          ? (val ? val.slice(0, 4) + "••••" + val.slice(-4) : "")
          : val,
        has_value: !!val,
        ...(isStripePk ? { warning: "Publishable Key (pk_) detectada. Utilize a Secret Key (sk_)." } : {}),
      };
    });

    return new Response(JSON.stringify({ credentials: masked }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const body = await req.json();

    // ─── Test connection actions (no real transactions) ───────────────
    if (body.action === "test_stripe") {
      const { provider, credential_key } = body;
      const { data: cred } = await serviceClient
        .from("integration_credentials")
        .select("credential_value")
        .eq("provider", provider)
        .eq("credential_key", credential_key)
        .maybeSingle();

      const sk = cred?.credential_value?.trim();
      if (!sk) {
        return new Response(JSON.stringify({ error: "Credencial não encontrada" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (sk.startsWith("pk_")) {
        return new Response(JSON.stringify({ error: "A chave configurada é uma Publishable Key (pk_). Configure a Secret Key (sk_) do Stripe." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const res = await fetch("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${sk}` },
        });
        const data = await res.json();
        if (data.error) {
          return new Response(JSON.stringify({ error: data.error.message || "API key inválida" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, message: "Conexão Stripe válida" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ error: `Erro de rede: ${e instanceof Error ? e.message : "unknown"}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (body.action === "test_asaas") {
      const { data: cred } = await serviceClient
        .from("integration_credentials")
        .select("credential_value")
        .eq("provider", "asaas")
        .eq("credential_key", "ASAAS_API_KEY")
        .maybeSingle();

      const apiKey = cred?.credential_value?.trim();
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "Credencial Asaas não encontrada" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const isSandbox = apiKey.startsWith("$aact_") ? false : true;
        const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/api/v3";
        const res = await fetch(`${baseUrl}/customers?limit=1`, {
          headers: { access_token: apiKey },
        });
        const data = await res.json();
        if (data.errors) {
          return new Response(JSON.stringify({ error: data.errors[0]?.description || "API key inválida" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, message: "Conexão Asaas válida" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ error: `Erro de rede: ${e instanceof Error ? e.message : "unknown"}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (body.action === "test_gupshup") {
      const { data: rows } = await serviceClient
        .from("integration_credentials")
        .select("credential_key, credential_value")
        .eq("provider", "gupshup");

      const map: Record<string, string> = {};
      (rows || []).forEach((row: any) => {
        map[row.credential_key] = (row.credential_value || "").trim();
      });

      const apiKey = map.GUPSHUP_API_KEY || "";
      let appName = map.GUPSHUP_APP_NAME || "";
      let source = (map.GUPSHUP_SOURCE_NUMBER || "").replace(/[^0-9]/g, "");
      const appId = map.GUPSHUP_APP_ID || "";
      const missing = [
        !apiKey ? "API Key" : null,
        !appId ? "App ID" : null,
      ].filter(Boolean);

      if (missing.length) {
        return new Response(JSON.stringify({
          ok: false,
          error: `Credenciais Gupshup incompletas: ${missing.join(", ")}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const appDetails = await fetchGupshupAppDetails(apiKey, appId);
        if (appDetails?.appName || appDetails?.source) {
          appName = appDetails.appName || appName;
          source = appDetails.source || source;
          const rows = [];
          if (appDetails.appName && appDetails.appName !== map.GUPSHUP_APP_NAME) rows.push({ provider: "gupshup", credential_key: "GUPSHUP_APP_NAME", credential_value: appDetails.appName });
          if (appDetails.source && appDetails.source !== (map.GUPSHUP_SOURCE_NUMBER || "")) rows.push({ provider: "gupshup", credential_key: "GUPSHUP_SOURCE_NUMBER", credential_value: appDetails.source });
          if (rows.length) await serviceClient.from("integration_credentials").upsert(rows, { onConflict: "provider,credential_key" });
        }

        if (!appName || !source) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Não foi possível obter App Name e Source Number pela API da Gupshup. Preencha esses campos manualmente ou confirme se o App ID pertence a uma app WhatsApp ativa.",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const callGupshup = async (url: string) => {
          const response = await fetch(url, {
            headers: { apikey: apiKey, accept: "application/json" },
          });
          const rawText = await response.text();
          let payload: any = {};
          try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }
          return { response, payload };
        };

        const officialUrl = `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`;
        let { response: res, payload: parsed } = await callGupshup(officialUrl);

        if (!res.ok) {
          const firstMessage = String(parsed?.message || parsed?.error || parsed?.raw || "");
          const shouldTryLegacy = !/portal user not found|apikey|unauthorized/i.test(firstMessage);
          if (shouldTryLegacy) {
            const legacyUrl = `https://api.gupshup.io/sm/api/v1/template/list/${encodeURIComponent(appId)}`;
            const legacy = await callGupshup(legacyUrl);
            if (legacy.response.ok) {
              res = legacy.response;
              parsed = legacy.payload;
            }
          }
        }

        if (!res.ok) {
          const providerMessage = parsed?.message || parsed?.error || parsed?.raw || "API Key, App ID ou conta Gupshup inválida";
          return new Response(JSON.stringify({
            ok: false,
            error: /portal user not found|apikey/i.test(String(providerMessage))
              ? "A API Key guardada foi rejeitada pela Gupshup. Verifique se o campo API Key não contém a chave mascarada antiga e se pertence à mesma conta do App ID."
              : providerMessage,
            http_status: res.status,
            gupshup: parsed,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({
          ok: true,
          message: "API Key e App ID Gupshup válidos. Confirme que App Name e Source Number pertencem a esta mesma app.",
          appName,
          source,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: unknown) {
        return new Response(JSON.stringify({ ok: false, error: `Erro de rede: ${e instanceof Error ? e.message : "unknown"}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Default: upsert credential ──────────────────────────────────
    const { provider, credential_key, credential_value } = body;

    if (!provider || !credential_key) {
      return new Response(
        JSON.stringify({ error: "provider and credential_key are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Block Stripe publishable keys from being saved as secret keys
    if (credential_key?.toUpperCase().includes("STRIPE") && credential_value?.trim().startsWith("pk_")) {
      return new Response(
        JSON.stringify({ error: "Esta é uma Publishable Key (pk_). Utilize a Secret Key (sk_) do Stripe." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert credential
    const { error } = await serviceClient
      .from("integration_credentials")
      .upsert(
        { provider, credential_key, credential_value: credential_value || "" },
        { onConflict: "provider,credential_key" }
      );

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
