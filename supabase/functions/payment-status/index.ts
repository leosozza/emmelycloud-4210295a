import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getCredential(supabase: any, provider: string, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", provider)
    .eq("credential_key", key)
    .maybeSingle();
  return data?.credential_value?.trim() || null;
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

    const url = new URL(req.url);
    const transactionId = url.searchParams.get("transaction_id");
    const listMode = url.searchParams.get("list");

    // List mode: return recent transactions (no auth required for Bitrix24 iframe)
    if (listMode === "true") {
      const { data: txs } = await supabase
        .from("payment_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return new Response(JSON.stringify({ transactions: txs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single transaction mode
    if (!transactionId) {
      return new Response(JSON.stringify({ error: "transaction_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get transaction from DB
    const { data: tx, error } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (error || !tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query gateway for real-time status
    let gatewayStatus: any = null;

    if (tx.gateway === "stripe" && tx.gateway_payment_id) {
      const stripeKey = await getCredential(supabase, "stripe", "STRIPE_SECRET_KEY");
      if (stripeKey) {
        const res = await fetch(`https://api.stripe.com/v1/payment_intents/${tx.gateway_payment_id}`, {
          headers: { "Authorization": `Bearer ${stripeKey}` },
        });
        const data = await res.json();
        gatewayStatus = {
          stripe_status: data.status,
          amount_received: data.amount_received ? data.amount_received / 100 : 0,
        };
      }
    } else if (tx.gateway === "asaas" && tx.gateway_payment_id) {
      const asaasKey = await getCredential(supabase, "asaas", "ASAAS_API_KEY");
      if (asaasKey) {
        const res = await fetch(`https://api.asaas.com/v3/payments/${tx.gateway_payment_id}`, {
          headers: { "access_token": asaasKey },
        });
        const data = await res.json();
        gatewayStatus = {
          asaas_status: data.status,
          billing_type: data.billingType,
          net_value: data.netValue,
        };
      }
    }

    return new Response(JSON.stringify({ ok: true, transaction: tx, gateway_status: gatewayStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
