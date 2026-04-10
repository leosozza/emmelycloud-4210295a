import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Mask values for frontend display
    const masked = (data || []).map((row: any) => {
      const val = row.credential_value || "";
      const isStripePk = row.credential_key?.toUpperCase().includes("STRIPE") && val.startsWith("pk_");
      return {
        ...row,
        credential_value_masked: val
          ? val.slice(0, 4) + "••••" + val.slice(-4)
          : "",
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
