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

    // 1. Get current deal
    const dealRes = await fetch(`${endpoint}crm.deal.get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ID: dealId, auth: accessToken }),
    });
    const dealData = await dealRes.json();
    const deal = dealData.result || {};
    const currentAmount = parseFloat(deal.OPPORTUNITY || "0");

    // 2. Update OPPORTUNITY + UF fields
    const newAmount = Math.max(0, currentAmount - paidAmount);
    const totalPaid = paidAmount + parseFloat(deal.UF_CRM_EMMELY_TOTAL_PAID || "0");
    const paymentStatusLabel = newAmount === 0 ? "Pago" : "Parcial";

    // Resolve Deal enum ID for UF_CRM_EMMELY_PAYMENT_STATUS
    let dealPaymentStatusId: string | number = paymentStatusLabel;
    try {
      const fieldsRes = await fetch(`${endpoint}crm.deal.fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: accessToken }),
      });
      const fieldsData = await fieldsRes.json();
      const statusItems = fieldsData.result?.UF_CRM_EMMELY_PAYMENT_STATUS?.items || [];
      const match = statusItems.find((i: any) => i.VALUE === paymentStatusLabel);
      if (match) dealPaymentStatusId = match.ID;
    } catch (e) { console.error("[STRIPE-WEBHOOK] Deal fields lookup error:", e); }

    const dealUpdateFields: Record<string, any> = {
      OPPORTUNITY: newAmount,
      UF_CRM_EMMELY_TOTAL_PAID: totalPaid,
      UF_CRM_EMMELY_PAYMENT_STATUS: dealPaymentStatusId,
    };

    // If balance is zero, move deal to paid/won stage
    if (newAmount === 0) {
      const paidStageId = deal.UF_CRM_EMMELY_PAID_STAGE || "WON";
      dealUpdateFields.STAGE_ID = paidStageId;
      console.log(`[STRIPE-WEBHOOK] Deal ${dealId} fully paid, moving to stage ${paidStageId}`);
    }

    await fetch(`${endpoint}crm.deal.update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ID: dealId,
        fields: dealUpdateFields,
        auth: accessToken,
      }),
    });

    // 3. Timeline comment
    const fmt = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(v);
    const stageNote = newAmount === 0 ? "\n🏆 Negócio totalmente pago — etapa atualizada." : "";
    await fetch(`${endpoint}crm.timeline.comment.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: dealId,
          ENTITY_TYPE: "deal",
          COMMENT: `✅ Pagamento confirmado: ${fmt(paidAmount)}\nTotal pago: ${fmt(totalPaid)}\nSaldo em aberto: ${fmt(newAmount)}${stageNote}`,
        },
        auth: accessToken,
      }),
    });

    console.log(`[STRIPE-WEBHOOK] Bitrix24 deal ${dealId} updated: ${currentAmount} -> ${newAmount}, totalPaid: ${totalPaid}`);

    // 4. Mark Smart Invoice as paid if linked + update UF fields
    if (txMeta?.bitrix_invoice_id) {
      try {
        // Count paid installments in this group
        let paidCount = 1;
        const groupId = txMeta?.installment_group_id;
        if (groupId) {
          const { count } = await supabase
            .from("payment_transactions")
            .select("id", { count: "exact", head: true })
            .eq("metadata->>installment_group_id", groupId)
            .eq("status", "confirmed");
          paidCount = count || 1;
        }

        const stagesRes = await fetch(`${endpoint}crm.status.list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { ENTITY_ID: "SMART_INVOICE_STAGE_31" }, auth: accessToken }),
        });
        const stagesData = await stagesRes.json();
        const stages = stagesData.result || [];
        const paidStage = stages.find((s: any) =>
          s.STATUS_ID?.includes("WON") || s.STATUS_ID?.includes("FINAL_INVOICE") ||
          s.STATUS_ID === "DT31_3:P" ||
          s.NAME?.toLowerCase().includes("pag") || s.NAME?.toLowerCase().includes("paid")
        );
        const stageId = paidStage?.STATUS_ID || "DT31_3:P";

        // Find next unpaid due date in group
        let nextDueDate: string | null = null;
        if (groupId) {
          const { data: nextTx } = await supabase
            .from("payment_transactions")
            .select("metadata")
            .eq("metadata->>installment_group_id", groupId)
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          nextDueDate = (nextTx?.metadata as any)?.due_date || null;
        }

        const invoiceUpdateFields: Record<string, any> = {
          stageId,
          UF_CRM_69B83DDB1F59D: 9395,
          UF_CRM_69B83DDB32521: paidAmount,
          UF_CRM_69B83DDB462B7: paidCount,
        };
        if (nextDueDate) {
          invoiceUpdateFields.UF_CRM_69B83DDB525C9 = nextDueDate;
        }

        await fetch(`${endpoint}crm.item.update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityTypeId: 31,
            id: txMeta.bitrix_invoice_id,
            fields: invoiceUpdateFields,
            auth: accessToken,
          }),
        });

        await fetch(`${endpoint}crm.timeline.comment.add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              ENTITY_ID: txMeta.bitrix_invoice_id,
              ENTITY_TYPE: "dynamic_31",
              COMMENT: `✅ Pagamento confirmado: ${fmt(paidAmount)}\nParcelas pagas: ${paidCount}`,
            },
            auth: accessToken,
          }),
        });

        console.log(`[STRIPE-WEBHOOK] Smart Invoice ${txMeta.bitrix_invoice_id} marked as paid, paidCount: ${paidCount}`);
      } catch (invErr) {
        console.error("[STRIPE-WEBHOOK] Smart Invoice update error:", invErr);
      }
    }
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

    // Verify webhook signature against all configured secrets (legacy, PT, BR)
    const [secretLegacy, secretPt, secretBr] = await Promise.all([
      getCredential(supabase, "stripe", "STRIPE_WEBHOOK_SECRET"),
      getCredential(supabase, "stripe_pt", "STRIPE_WEBHOOK_SECRET_PT"),
      getCredential(supabase, "stripe_br", "STRIPE_WEBHOOK_SECRET_BR"),
    ]);
    const allSecrets = [secretLegacy, secretPt, secretBr].filter(Boolean) as string[];
    if (allSecrets.length > 0 && sigHeader) {
      let validSignature = false;
      for (const secret of allSecrets) {
        if (await verifyStripeSignature(body, sigHeader, secret)) {
          validSignature = true;
          break;
        }
      }
      if (!validSignature) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const event = JSON.parse(body);
    const eventObject = event.data?.object;
    if (!eventObject?.id) {
      return new Response(JSON.stringify({ ok: true, message: "No event object" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Stripe event to status. Include async_payment_* for MBWay, SEPA, Multibanco,
    // Boleto, and other delayed-notification methods that never fire checkout.session.completed
    // with a paid state.
    const statusMap: Record<string, string> = {
      "payment_intent.succeeded": "confirmed",
      "payment_intent.payment_failed": "failed",
      "payment_intent.canceled": "canceled",
      "charge.refunded": "refunded",
      "checkout.session.completed": "confirmed",
      "checkout.session.async_payment_succeeded": "confirmed",
      "checkout.session.async_payment_failed": "failed",
    };

    const newStatus = statusMap[event.type];
    if (!newStatus) {
      return new Response(JSON.stringify({ ok: true, message: "Event not tracked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[STRIPE-WEBHOOK] Event: ${event.type}, objectId: ${eventObject.id}`);

    // For checkout.session.* events, resolve the payment_intent ID from the session
    const isCheckoutSessionEvent = event.type.startsWith("checkout.session.");
    let gatewayPaymentId = eventObject.id;
    if (isCheckoutSessionEvent) {
      gatewayPaymentId = eventObject.payment_intent || eventObject.id;
    }

    // First get existing transaction to preserve metadata
    // Match any Stripe gateway variant: "stripe", "stripe_pt", "stripe_br"
    let existingTx: any = null;
    {
      const { data } = await supabase
        .from("payment_transactions")
        .select("id, financial_record_id, metadata, amount, currency, gateway")
        .eq("gateway_payment_id", gatewayPaymentId)
        .like("gateway", "stripe%")
        .maybeSingle();
      existingTx = data;
    }

    // Fallback for checkout.session.* events: match by the session ID directly
    // (payment-create/payment-create-link often store cs_xxx as gateway_payment_id
    // when the payment_intent isn't ready yet — the case for async methods like MBWay).
    if (!existingTx && isCheckoutSessionEvent) {
      const sessionId = eventObject.id; // cs_xxx
      const { data } = await supabase
        .from("payment_transactions")
        .select("id, financial_record_id, metadata, amount, currency, gateway")
        .eq("gateway_payment_id", sessionId)
        .like("gateway", "stripe%")
        .maybeSingle();
      if (data) {
        existingTx = data;
        // Update gateway_payment_id to payment_intent for future event matching
        const resolvedPi = eventObject.payment_intent;
        if (resolvedPi) {
          await supabase
            .from("payment_transactions")
            .update({ gateway_payment_id: resolvedPi })
            .eq("id", data.id);
          gatewayPaymentId = resolvedPi;
        }
        console.log(`[STRIPE-WEBHOOK] Matched by session ID: ${sessionId} -> tx ${data.id}`);
      }
    }

    // Legacy fallback: try checkout_session_id in metadata (kept for old transactions)
    if (!existingTx && isCheckoutSessionEvent) {
      const sessionId = eventObject.id;
      const { data: allPending } = await supabase
        .from("payment_transactions")
        .select("id, financial_record_id, metadata, amount, currency, gateway, gateway_payment_id")
        .like("gateway", "stripe%")
        .eq("status", "pending")
        .limit(50);

      if (allPending) {
        existingTx = allPending.find((tx: any) => {
          const m = tx.metadata as any;
          return m?.checkout_session_id === sessionId;
        }) || null;
        if (existingTx) {
          const resolvedPi = eventObject.payment_intent;
          if (resolvedPi) {
            await supabase.from("payment_transactions").update({ gateway_payment_id: resolvedPi }).eq("id", existingTx.id);
            gatewayPaymentId = resolvedPi;
          }
          console.log(`[STRIPE-WEBHOOK] Legacy fallback match: ${sessionId} -> tx ${existingTx.id}`);
        }
      }
    }

    // Metadata fallback: Stripe checkout metadata carries financial_record_id / bitrix24_deal_id.
    // If we still can't find the tx (e.g. it was never inserted), locate the target
    // financial_record and update it directly so the dashboard reflects the payment.
    let orphanFinancialRecordId: string | null = null;
    if (!existingTx && newStatus === "confirmed") {
      const meta = (eventObject.metadata || {}) as Record<string, string>;
      const frFromMeta = meta.financial_record_id || null;
      const dealFromMeta = meta.bitrix24_deal_id || meta.bitrix_deal_id || null;
      const installmentFromMeta = meta.installment_number ? Number(meta.installment_number) : null;

      if (frFromMeta) {
        orphanFinancialRecordId = frFromMeta;
      } else if (dealFromMeta) {
        let q = supabase
          .from("financial_records")
          .select("id")
          .eq("bitrix24_deal_id", String(dealFromMeta))
          .neq("status", "paga")
          .order("installment_number", { ascending: true })
          .limit(1);
        if (installmentFromMeta) q = q.eq("installment_number", installmentFromMeta);
        const { data: frRow } = await q.maybeSingle();
        if (frRow?.id) orphanFinancialRecordId = frRow.id;
      }

      if (orphanFinancialRecordId) {
        console.log(`[STRIPE-WEBHOOK] Metadata fallback resolved financial_record_id=${orphanFinancialRecordId} for event ${eventObject.id}`);
      } else {
        console.warn(`[STRIPE-WEBHOOK] No tx and no metadata match for ${gatewayPaymentId}. Meta:`, meta);
      }
    }

    if (!existingTx && !orphanFinancialRecordId) {
      console.log(`[STRIPE-WEBHOOK] No transaction found for ${gatewayPaymentId}`);
    }

    const mergedMeta = { ...(existingTx?.metadata as any || {}), stripe_event: event.type, updated_via: "webhook" };

    // Update payment_transactions — use the actual gateway from the existing record
    const matchGateway = existingTx?.gateway || "stripe";
    const { data: tx } = await supabase
      .from("payment_transactions")
      .update({ status: newStatus, metadata: mergedMeta })
      .eq("gateway_payment_id", gatewayPaymentId)
      .eq("gateway", matchGateway)
      .select("id, financial_record_id, metadata, amount, currency")
      .maybeSingle();

    // Also update financial_records if linked
    if (tx?.financial_record_id && newStatus === "confirmed") {
      await supabase
        .from("financial_records")
        .update({ status: "paga", paid_at: new Date().toISOString(), stripe_payment_id: gatewayPaymentId })
        .eq("id", tx.financial_record_id);
    }

    // Notify Bitrix24 on payment confirmation
    if (tx && newStatus === "confirmed") {
      await notifyBitrix24DealPayment(supabase, tx.metadata as any, tx.amount, tx.currency);

      // Trigger paid_flow_id if configured in transaction metadata
      const paidFlowId = (tx.metadata as any)?.paid_flow_id;
      if (paidFlowId) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          // Resolve conversation via proposal → case → lead
          const proposalId = (tx.metadata as any)?.proposal_id;
          let flowConversationId: string | null = null;
          if (proposalId) {
            const { data: prop } = await supabase.from("proposals").select("case_id").eq("id", proposalId).maybeSingle();
            if (prop?.case_id) {
              const { data: cs } = await supabase.from("cases").select("lead_id").eq("id", prop.case_id).maybeSingle();
              if (cs?.lead_id) {
                const { data: ld } = await supabase.from("leads").select("conversation_id").eq("id", cs.lead_id).maybeSingle();
                flowConversationId = ld?.conversation_id || null;
              }
            }
          }
          if (flowConversationId) {
            await fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                conversation_id: flowConversationId,
                flow_id: paidFlowId,
                trigger: "payment_confirmed",
                variables: {
                  amount: tx.amount,
                  currency: tx.currency,
                  proposal_id: proposalId || "",
                },
              }),
            });
            console.log(`[STRIPE-WEBHOOK] Flow ${paidFlowId} triggered for conversation ${flowConversationId}`);
          }
        } catch (flowErr) {
          console.error("[STRIPE-WEBHOOK] Flow trigger error:", flowErr);
        }
      }
    }

    // --- Bitrix24 Badge based on status ---
    const txMeta = (tx?.metadata || existingTx?.metadata) as any;
    const bitrixDealId = txMeta?.bitrix_deal_id;
    if (bitrixDealId && (newStatus === "confirmed" || newStatus === "failed" || newStatus === "refunded")) {
      try {
        const { data: integration } = await supabase
          .from("bitrix24_integrations")
          .select("client_endpoint, access_token")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (integration?.client_endpoint && integration?.access_token) {
          const endpoint = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
          const badgeMap: Record<string, { code: string; title: string; icon: string }> = {
            confirmed: { code: "emmely_payment_confirmed", title: "Pagamento Confirmado", icon: "done" },
            failed: { code: "emmely_payment_failed", title: "Pagamento Falhado", icon: "warning" },
            refunded: { code: "emmely_payment_refunded", title: "Reembolso Processado", icon: "info" },
          };
          const badge = badgeMap[newStatus];
          const paidAmount = tx?.amount || existingTx?.amount || 0;
          const cur = tx?.currency || existingTx?.currency || "EUR";
          const fmt = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: cur }).format(v);

          await fetch(`${endpoint}crm.activity.configurable.add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              auth: integration.access_token,
              ownerTypeId: 2,
              ownerId: parseInt(bitrixDealId),
              fields: { completed: newStatus === "confirmed", isIncomingChannel: "N", responsibleId: 1, badgeCode: badge.code },
              layout: {
                icon: { code: badge.icon },
                header: { title: badge.title },
                body: { logo: { code: "robot" }, blocks: {
                  amount: { type: "text", properties: { value: fmt(paidAmount) } },
                  event: { type: "text", properties: { value: event.type } },
                } },
              },
            }),
          });
          console.log(`[STRIPE-WEBHOOK] Badge ${badge.code} for deal ${bitrixDealId}`);
        }
      } catch (badgeErr) {
        console.error("[STRIPE-WEBHOOK] Badge error:", badgeErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, status: newStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
