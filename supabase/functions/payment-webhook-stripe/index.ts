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

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return integration.access_token;
  }
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID") || "",
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET") || "",
      refresh_token: integration.refresh_token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh: ${data.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return data.access_token;
}

async function notifyBitrix24DealPayment(supabase: any, txMeta: any, paidAmount: number, currency: string) {
  const dealId = txMeta?.bitrix_deal_id;
  if (!dealId) return;

  try {
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration?.client_endpoint) return;

    const accessToken = await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint.endsWith("/")
      ? integration.client_endpoint
      : integration.client_endpoint + "/";

    // 1. Get current deal
    const dealRes = await fetch(`${endpoint}crm.deal.get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ID: dealId, auth: accessToken }),
    });
    const dealData = await dealRes.json();
    const deal = dealData.result || {};
    const currentAmount = parseFloat(deal.OPPORTUNITY || "0");

    // 2. Update OPPORTUNITY
    const newAmount = Math.max(0, currentAmount - paidAmount);
    await fetch(`${endpoint}crm.deal.update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ID: dealId,
        fields: { OPPORTUNITY: newAmount },
        auth: accessToken,
      }),
    });

    // 3. Timeline comment
    const fmt = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(v);
    await fetch(`${endpoint}crm.timeline.comment.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: dealId,
          ENTITY_TYPE: "deal",
          COMMENT: `✅ Pagamento confirmado: ${fmt(paidAmount)}\nSaldo em aberto atualizado para ${fmt(newAmount)}`,
        },
        auth: accessToken,
      }),
    });

    console.log(`[STRIPE-WEBHOOK] Bitrix24 deal ${dealId} updated: ${currentAmount} -> ${newAmount}`);
  } catch (err) {
    console.error("[STRIPE-WEBHOOK] Bitrix24 notification error:", err);
  }
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

    // First get existing transaction to preserve metadata
    const { data: existingTx } = await supabase
      .from("payment_transactions")
      .select("id, financial_record_id, metadata, amount, currency")
      .eq("gateway_payment_id", paymentIntent.id)
      .eq("gateway", "stripe")
      .maybeSingle();

    const mergedMeta = { ...(existingTx?.metadata as any || {}), stripe_event: event.type, updated_via: "webhook" };

    // Update payment_transactions
    const { data: tx } = await supabase
      .from("payment_transactions")
      .update({ status: newStatus, metadata: mergedMeta })
      .eq("gateway_payment_id", paymentIntent.id)
      .eq("gateway", "stripe")
      .select("id, financial_record_id, metadata, amount, currency")
      .maybeSingle();

    // Also update financial_records if linked
    if (tx?.financial_record_id && newStatus === "confirmed") {
      await supabase
        .from("financial_records")
        .update({ status: "paga", paid_at: new Date().toISOString(), stripe_payment_id: paymentIntent.id })
        .eq("id", tx.financial_record_id);
    }

    // Notify Bitrix24 on payment confirmation
    if (tx && newStatus === "confirmed") {
      await notifyBitrix24DealPayment(supabase, tx.metadata as any, tx.amount, tx.currency);
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
