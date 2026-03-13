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
  return data?.credential_value?.trim() || null;
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

    // 1. Get current deal data
    const dealRes = await fetch(`${endpoint}crm.deal.get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ID: dealId, auth: accessToken }),
    });
    const dealData = await dealRes.json();
    const deal = dealData.result || {};
    const currentAmount = parseFloat(deal.OPPORTUNITY || "0");

    // 2. Update OPPORTUNITY: subtract paid amount (floor at 0)
    const newAmount = Math.max(0, currentAmount - paidAmount);
    const updateRes = await fetch(`${endpoint}crm.deal.update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ID: dealId,
        fields: { OPPORTUNITY: newAmount },
        auth: accessToken,
      }),
    });
    const updateData = await updateRes.json();
    console.log("[WEBHOOK] Bitrix24 deal.update result:", JSON.stringify(updateData).substring(0, 200));

    // 3. Add a timeline activity
    const formattedAmount = new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(paidAmount);
    await fetch(`${endpoint}crm.timeline.comment.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: dealId,
          ENTITY_TYPE: "deal",
          COMMENT: `✅ Pagamento confirmado: ${formattedAmount}\nSaldo em aberto atualizado para ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(newAmount)}`,
        },
        auth: accessToken,
      }),
    });

    // 4. Create configurable activity (badge)
    try {
      await fetch(`${endpoint}crm.activity.configurable.add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerTypeId: 2, // Deal
          ownerId: dealId,
          typeId: "emmely_payment_confirmed",
          title: `Pagamento confirmado: ${formattedAmount}`,
          description: `Saldo em aberto: ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(newAmount)}`,
          completed: true,
          auth: accessToken,
        }),
      });
    } catch { /* badge may not be registered */ }

    console.log(`[WEBHOOK] Bitrix24 deal ${dealId} updated: ${currentAmount} -> ${newAmount}`);

    // 5. Mark Smart Invoice as paid if linked
    if (txMeta?.bitrix_invoice_id) {
      try {
        // Get available stages to find "paid" stage
        const stagesRes = await fetch(`${endpoint}crm.status.list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { ENTITY_ID: "SMART_INVOICE_STAGE_31" }, auth: accessToken }),
        });
        const stagesData = await stagesRes.json();
        const stages = stagesData.result || [];
        // Find a stage that indicates "paid" - look for semantic IDs
        const paidStage = stages.find((s: any) =>
          s.STATUS_ID?.includes("WON") || s.STATUS_ID?.includes("FINAL_INVOICE") ||
          s.NAME?.toLowerCase().includes("pag") || s.NAME?.toLowerCase().includes("paid")
        );
        const stageId = paidStage?.STATUS_ID || "DT31_6:WON"; // fallback

        await fetch(`${endpoint}crm.item.update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityTypeId: 31,
            id: txMeta.bitrix_invoice_id,
            fields: { stageId },
            auth: accessToken,
          }),
        });

        // Add timeline comment to the invoice
        await fetch(`${endpoint}crm.timeline.comment.add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              ENTITY_ID: txMeta.bitrix_invoice_id,
              ENTITY_TYPE: "dynamic_31",
              COMMENT: `✅ Pagamento confirmado: ${formattedAmount}`,
            },
            auth: accessToken,
          }),
        });

        console.log(`[WEBHOOK] Smart Invoice ${txMeta.bitrix_invoice_id} marked as paid`);
      } catch (invErr) {
        console.error("[WEBHOOK] Smart Invoice update error:", invErr);
      }
    }
  } catch (err) {
    console.error("[WEBHOOK] Bitrix24 notification error:", err);
  }
}

// Also handle Bitrix24 native paysystem notification
async function notifyBitrix24PaySystem(supabase: any, txMeta: any) {
  if (!txMeta?.bitrix24_payment_id || !txMeta?.bitrix24_paysystem_id) return;
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

    const payRes = await fetch(`${endpoint}sale.paysystem.pay.payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PAYMENT_ID: txMeta.bitrix24_payment_id,
        PAY_SYSTEM_ID: txMeta.bitrix24_paysystem_id,
        auth: accessToken,
      }),
    });
    const payData = await payRes.json();
    console.log("[ASAAS-WEBHOOK] Bitrix24 pay.payment result:", JSON.stringify(payData).substring(0, 300));
  } catch (bxErr) {
    console.error("[ASAAS-WEBHOOK] Bitrix24 paysystem error:", bxErr);
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

    // First get existing transaction to preserve metadata
    const { data: existingTx } = await supabase
      .from("payment_transactions")
      .select("id, financial_record_id, metadata, amount, currency")
      .eq("gateway_payment_id", payment.id)
      .eq("gateway", "asaas")
      .maybeSingle();

    const mergedMeta = { ...(existingTx?.metadata as any || {}), asaas_event: event, updated_via: "webhook" };

    // Update payment_transactions
    const { data: tx } = await supabase
      .from("payment_transactions")
      .update({ status: newStatus, metadata: mergedMeta })
      .eq("gateway_payment_id", payment.id)
      .eq("gateway", "asaas")
      .select("id, financial_record_id, metadata, amount, currency")
      .maybeSingle();

    // Also update financial_records if linked
    if (tx?.financial_record_id && (newStatus === "confirmed" || newStatus === "received")) {
      await supabase
        .from("financial_records")
        .update({ status: "paga", paid_at: new Date().toISOString() })
        .eq("id", tx.financial_record_id);
    }

    // Notify Bitrix24 on payment confirmation
    if (tx && (newStatus === "confirmed" || newStatus === "received")) {
      const txMeta = tx.metadata as any;
      await Promise.all([
        notifyBitrix24DealPayment(supabase, txMeta, tx.amount, tx.currency),
        notifyBitrix24PaySystem(supabase, txMeta),
      ]);
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
