// Endpoint público read-only: devolve apenas flags booleanas de presença
// das credenciais dos gateways de pagamento + ambiente do Asaas.
// Sem valores, sem máscaras. Usado como fallback quando o leitor autenticado
// (manage-credentials) não está disponível — por ex. dentro do iframe Bitrix24.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

    const keys = [
      "STRIPE_SECRET_KEY_PT",
      "STRIPE_WEBHOOK_SECRET_PT",
      "STRIPE_SECRET_KEY_BR",
      "STRIPE_WEBHOOK_SECRET_BR",
      "ASAAS_API_KEY",
      "ASAAS_WEBHOOK_TOKEN",
      "ASAAS_ENVIRONMENT",
    ];

    const { data, error } = await supabase
      .from("integration_credentials")
      .select("provider, credential_key, credential_value")
      .in("credential_key", keys);

    if (error) throw error;

    const get = (provider: string, key: string): string => {
      const row = (data || []).find(
        (r: any) => r.provider === provider && r.credential_key === key
      );
      return (row?.credential_value || "").trim();
    };

    const has = (provider: string, key: string): boolean => get(provider, key).length > 0;

    const asaasEnv = get("asaas", "ASAAS_ENVIRONMENT") === "production" ? "production" : "sandbox";

    const body = {
      stripe_pt: {
        secret: has("stripe_pt", "STRIPE_SECRET_KEY_PT"),
        webhook: has("stripe_pt", "STRIPE_WEBHOOK_SECRET_PT"),
      },
      stripe_br: {
        secret: has("stripe_br", "STRIPE_SECRET_KEY_BR"),
        webhook: has("stripe_br", "STRIPE_WEBHOOK_SECRET_BR"),
      },
      asaas: {
        api_key: has("asaas", "ASAAS_API_KEY"),
        webhook_token: has("asaas", "ASAAS_WEBHOOK_TOKEN"),
        environment: asaasEnv,
      },
    };

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
