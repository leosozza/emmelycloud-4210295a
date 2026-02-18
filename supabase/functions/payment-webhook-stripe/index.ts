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

// Simple Stripe signature verification
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = sigHeader.split(",");
    const timestamp = parts.find(p => p.startsWith("t="))?.split("=")[1];
    const signatures = parts.filter(p => p.startsWith("v1=")).map(p => p.split("=")[1]);

    if (!timestamp || signatures.length === 0) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const expectedSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

    return signatures.includes(expectedSig);
  } catch {
    return false;
  }
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

    const body = await req.text();
    const sigHeader = req.headers.get("stripe-signature") || "";

    // Verify webhook signature
    const webhookSecret = await getCredential(supabase, "stripe", "STRIPE_WEBHOOK_SECRET");
    if (webhookSecret && sigHeader) {
      const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const event = JSON.parse(body);
    const paymentIntent = event.data?.object;
    if (!paymentIntent?.id) {
      return new Response(JSON.stringify({ ok: true, message: "No payment intent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Stripe event to status
    const statusMap: Record<string, string> = {
      "payment_intent.succeeded": "confirmed",
      "payment_intent.payment_failed": "failed",
      "payment_intent.canceled": "canceled",
      "charge.refunded": "refunded",
    };

    const newStatus = statusMap[event.type];
    if (!newStatus) {
      return new Response(JSON.stringify({ ok: true, message: "Event not tracked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update payment_transactions
    const { data: tx, error } = await supabase
      .from("payment_transactions")
      .update({ status: newStatus, metadata: { stripe_event: event.type, updated_via: "webhook" } })
      .eq("gateway_payment_id", paymentIntent.id)
      .eq("gateway", "stripe")
      .select("id, financial_record_id, status")
      .maybeSingle();

    // Also update financial_records if linked
    if (tx?.financial_record_id && (newStatus === "confirmed" || newStatus === "received")) {
      await supabase
        .from("financial_records")
        .update({ status: "paga", paid_at: new Date().toISOString(), stripe_payment_id: paymentIntent.id })
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
