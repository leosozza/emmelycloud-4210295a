import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getCredential(supabase: any, provider: string, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", provider)
    .eq("credential_key", key)
    .maybeSingle();
  return data?.credential_value || null;
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

    // Validate webhook token
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("asaas-access-token") || "";
    const webhookToken = await getCredential(supabase, "asaas", "ASAAS_WEBHOOK_TOKEN");

    if (webhookToken && token !== webhookToken) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { event, payment } = body;

    if (!payment?.id) {
      return new Response(JSON.stringify({ ok: true, message: "No payment data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Asaas events to status
    const statusMap: Record<string, string> = {
      PAYMENT_CONFIRMED: "confirmed",
      PAYMENT_RECEIVED: "received",
      PAYMENT_OVERDUE: "overdue",
      PAYMENT_DELETED: "canceled",
      PAYMENT_RESTORED: "pending",
      PAYMENT_REFUNDED: "refunded",
      PAYMENT_UPDATED: "pending",
      PAYMENT_CREATED: "pending",
    };

    const newStatus = statusMap[event];
    if (!newStatus) {
      return new Response(JSON.stringify({ ok: true, message: "Event not tracked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update payment_transactions
    const { data: tx } = await supabase
      .from("payment_transactions")
      .update({
        status: newStatus,
        metadata: { asaas_event: event, updated_via: "webhook" },
      })
      .eq("gateway_payment_id", payment.id)
      .eq("gateway", "asaas")
      .select("id, financial_record_id")
      .maybeSingle();

    // Also update financial_records if linked
    if (tx?.financial_record_id && (newStatus === "confirmed" || newStatus === "received")) {
      await supabase
        .from("financial_records")
        .update({ status: "paga", paid_at: new Date().toISOString() })
        .eq("id", tx.financial_record_id);
    }

    return new Response(JSON.stringify({ ok: true, status: newStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
