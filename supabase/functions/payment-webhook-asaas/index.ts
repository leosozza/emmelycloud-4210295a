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

/**
 * Notifica o Bitrix24 quando um pagamento é confirmado.
 *
 * Lógica corrigida:
 * - NÃO subtrai o valor do OPPORTUNITY (isso corrompe o dado do negócio)
 * - Verifica se há parcelas pendentes para o mesmo deal
 * - Se todas as parcelas foram pagas → move o deal para WON (STAGE_ID = "WON")
 * - Se ainda há parcelas → apenas registra o pagamento na timeline
 * - Envia notificação WhatsApp ao cliente com recibo
 */
async function notifyBitrix24DealPayment(
  supabase: any,
  txMeta: any,
  paidAmount: number,
  currency: string,
  proposalId?: string | null,
) {
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

    const curr = currency || "EUR";
    const formattedAmount = new Intl.NumberFormat("pt-PT", { style: "currency", currency: curr }).format(paidAmount);

    // 1. Check remaining pending installments for this deal
    const { data: pendingTxs } = await supabase
      .from("payment_transactions")
      .select("id, status, amount")
      .eq("metadata->>bitrix_deal_id", String(dealId))
      .in("status", ["pending", "overdue"]);

    const pendingCount = pendingTxs?.length ?? 0;
    const pendingTotal = (pendingTxs || []).reduce(
      (sum: number, t: any) => sum + Number(t.amount || 0), 0
    );
    const isFullyPaid = pendingCount === 0;

    // 2. Update deal in Bitrix24
    const dealUpdateFields: Record<string, any> = {};
    if (isFullyPaid) {
      // All installments paid → close deal as WON
      dealUpdateFields.STAGE_ID = "WON";
      dealUpdateFields.CLOSED = "Y";
      console.log(`[ASAAS-WEBHOOK] Deal ${dealId} fully paid → marking as WON`);
    } else {
      // Partial payment — do NOT touch OPPORTUNITY; just log
      console.log(`[ASAAS-WEBHOOK] Deal ${dealId} partial payment — ${pendingCount} installment(s) remaining`);
    }

    if (Object.keys(dealUpdateFields).length > 0) {
      const updateRes = await fetch(`${endpoint}crm.deal.update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ID: dealId, fields: dealUpdateFields, auth: accessToken }),
      });
      const updateData = await updateRes.json();
      console.log("[ASAAS-WEBHOOK] crm.deal.update:", JSON.stringify(updateData).substring(0, 200));
    }

    // 3. Timeline comment
    const commentText = isFullyPaid
      ? `✅ *Pagamento integral confirmado!*\n\nValor pago: ${formattedAmount}\n\n🎉 Todas as parcelas foram quitadas. Negócio marcado como GANHO.`
      : `✅ Pagamento confirmado: ${formattedAmount}\n\nParcelas restantes: ${pendingCount}\nSaldo em aberto: ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: curr }).format(pendingTotal)}`;

    await fetch(`${endpoint}crm.timeline.comment.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: { ENTITY_ID: dealId, ENTITY_TYPE: "deal", COMMENT: commentText },
        auth: accessToken,
      }),
    });

    // 4. Configurable activity badge (correct API: crm.activity.configurable.add)
    try {
      await fetch(`${endpoint}crm.activity.configurable.add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerTypeId: 2,
          ownerId: parseInt(String(dealId)),
          fields: {
            completed: true,
            isIncomingChannel: "N",
            responsibleId: 1,
            badgeCode: isFullyPaid ? "emmely_payment_confirmed" : "emmely_deal_payment_updated",
          },
          layout: {
            icon: { code: isFullyPaid ? "done" : "info" },
            header: { title: isFullyPaid ? `Pago: ${formattedAmount}` : `Parcela: ${formattedAmount}` },
            body: {
              logo: { code: "robot" },
              blocks: {
                amount: { type: "text", properties: { value: formattedAmount } },
                remaining: {
                  type: "text",
                  properties: {
                    value: isFullyPaid
                      ? "Quitado ✅"
                      : `${pendingCount} parcela(s) restante(s)`,
                  },
                },
              },
            },
          },
          auth: accessToken,
        }),
      });
    } catch { /* badge may not be registered yet — non-fatal */ }

    // 5. Mark Smart Invoice as paid if linked
    if (txMeta?.bitrix_invoice_id) {
      try {
        const stagesRes = await fetch(`${endpoint}crm.status.list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { ENTITY_ID: "SMART_INVOICE_STAGE_31" }, auth: accessToken }),
        });
        const stagesData = await stagesRes.json();
        const stages = stagesData.result || [];
        const paidStage = stages.find((s: any) =>
          s.STATUS_ID?.includes("WON") || s.STATUS_ID?.includes("FINAL_INVOICE") ||
          s.NAME?.toLowerCase().includes("pag") || s.NAME?.toLowerCase().includes("paid")
        );
        const stageId = paidStage?.STATUS_ID || "DT31_6:WON";

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

        console.log(`[ASAAS-WEBHOOK] Smart Invoice ${txMeta.bitrix_invoice_id} marked as paid`);
      } catch (invErr) {
        console.error("[ASAAS-WEBHOOK] Smart Invoice update error:", invErr);
      }
    }
  } catch (err) {
    console.error("[ASAAS-WEBHOOK] Bitrix24 notification error:", err);
  }
}

/**
 * Notifica o cliente via WhatsApp com o recibo de pagamento.
 */
async function notifyClientPaymentConfirmed(
  supabase: any,
  txMeta: any,
  paidAmount: number,
  currency: string,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // Resolve conversation via proposal → case → lead
    let conversationId: string | null = null;
    let clientName: string | null = null;

    if (txMeta?.proposal_id) {
      const { data: proposal } = await supabase
        .from("proposals")
        .select("case_id, client_name")
        .eq("id", txMeta.proposal_id)
        .single();

      if (proposal) {
        clientName = proposal.client_name;
        if (proposal.case_id) {
          const { data: lc } = await supabase
            .from("cases").select("lead_id").eq("id", proposal.case_id).single();
          if (lc?.lead_id) {
            const { data: ld } = await supabase
              .from("leads").select("conversation_id").eq("id", lc.lead_id).single();
            conversationId = ld?.conversation_id || null;
          }
        }
      }
    }

    if (!conversationId) return;

    const curr = currency || "EUR";
    const formattedAmount = new Intl.NumberFormat("pt-PT", { style: "currency", currency: curr }).format(paidAmount);
    const greeting = clientName ? `, ${clientName}` : "";

    const msg =
      `✅ *Pagamento confirmado!*\n\n` +
      `Obrigado${greeting}! Recebemos o seu pagamento de *${formattedAmount}*.\n\n` +
      `📋 O seu processo está em andamento.\n` +
      `Em breve entraremos em contacto com as próximas etapas.\n\n` +
      `_Emmely Fernandes Advocacia_`;

    await fetch(`${supabaseUrl}/functions/v1/message-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ conversation_id: conversationId, content: msg }),
    });

    console.log(`[ASAAS-WEBHOOK] Client notified via conversation ${conversationId}`);
  } catch (err) {
    console.error("[ASAAS-WEBHOOK] Client notification error:", err);
  }
}

// Handle Bitrix24 native paysystem notification
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
    const { event, payment, subscription, invoice } = body as any;

    // Idempotency log: try to claim event_id
    const eventId: string =
      body.id ||
      body.eventId ||
      `${event}:${payment?.id || subscription?.id || invoice?.id || crypto.randomUUID()}`;
    const { error: dedupErr } = await supabase
      .from("asaas_webhook_events")
      .insert({ event_id: eventId, event_type: event, payload: body });
    if (dedupErr && (dedupErr as any).code === "23505") {
      return new Response(JSON.stringify({ ok: true, dedup: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const markProcessed = async (err?: string) => {
      await supabase
        .from("asaas_webhook_events")
        .update({ processed_at: new Date().toISOString(), processing_error: err || null })
        .eq("event_id", eventId);
    };

    // ---- Subscription events ----
    if (event && event.startsWith("SUBSCRIPTION_") && subscription?.id) {
      const subStatusMap: Record<string, string> = {
        SUBSCRIPTION_CREATED: "ACTIVE",
        SUBSCRIPTION_UPDATED: "ACTIVE",
        SUBSCRIPTION_INACTIVATED: "INACTIVE",
        SUBSCRIPTION_DELETED: "CANCELED",
      };
      const newSubStatus = subStatusMap[event];
      if (newSubStatus) {
        await supabase
          .from("asaas_subscriptions")
          .update({
            status: newSubStatus,
            next_due_date: subscription.nextDueDate || undefined,
            metadata: { last_event: event, last_payload: subscription },
          })
          .eq("asaas_subscription_id", subscription.id);
      }
      await markProcessed();
      return new Response(JSON.stringify({ ok: true, subscription: subscription.id, status: newSubStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Invoice / NFSe events ----
    if (event && event.startsWith("INVOICE_") && invoice?.id) {
      const invStatusMap: Record<string, string> = {
        INVOICE_CREATED: "SCHEDULED",
        INVOICE_UPDATED: "SCHEDULED",
        INVOICE_SYNCHRONIZED: "SYNCHRONIZED",
        INVOICE_AUTHORIZED: "AUTHORIZED",
        INVOICE_PROCESSING_CANCELLATION: "PROCESSING_CANCELLATION",
        INVOICE_CANCELED: "CANCELED",
        INVOICE_CANCELLATION_DENIED: "CANCELLATION_DENIED",
        INVOICE_ERROR: "ERROR",
      };
      const newInvStatus = invStatusMap[event] || "SCHEDULED";
      await supabase
        .from("asaas_invoices")
        .update({
          status: newInvStatus,
          pdf_url: invoice.pdfUrl || undefined,
          xml_url: invoice.xmlUrl || undefined,
          number: invoice.number || undefined,
          effective_date: invoice.effectiveDate || undefined,
          last_error: invoice.lastError || null,
          metadata: { last_event: event, last_payload: invoice },
        })
        .eq("asaas_invoice_id", invoice.id);
      await markProcessed();
      return new Response(JSON.stringify({ ok: true, invoice: invoice.id, status: newInvStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payment?.id) {
      await markProcessed("no payment");
      return new Response(JSON.stringify({ ok: true, message: "No payment data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Asaas events to internal status
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
      await markProcessed("event not tracked");
      return new Response(JSON.stringify({ ok: true, message: "Event not tracked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch existing transaction to preserve metadata
    const { data: existingTx } = await supabase
      .from("payment_transactions")
      .select("id, financial_record_id, metadata, amount, currency")
      .eq("gateway_payment_id", payment.id)
      .eq("gateway", "asaas")
      .maybeSingle();

    const mergedMeta = {
      ...(existingTx?.metadata as any || {}),
      asaas_event: event,
      updated_via: "webhook",
    };

    // Update payment_transactions
    const { data: tx } = await supabase
      .from("payment_transactions")
      .update({ status: newStatus, metadata: mergedMeta })
      .eq("gateway_payment_id", payment.id)
      .eq("gateway", "asaas")
      .select("id, financial_record_id, metadata, amount, currency")
      .maybeSingle();

    // Update financial_records if linked and payment confirmed
    if (tx?.financial_record_id && (newStatus === "confirmed" || newStatus === "received")) {
      await supabase
        .from("financial_records")
        .update({ status: "paga", paid_at: new Date().toISOString() })
        .eq("id", tx.financial_record_id);
    }

    // Notify Bitrix24 and client on payment confirmation
    if (tx && (newStatus === "confirmed" || newStatus === "received")) {
      const txMeta = tx.metadata as any;
      await Promise.all([
        notifyBitrix24DealPayment(supabase, txMeta, tx.amount, tx.currency, txMeta?.proposal_id),
        notifyBitrix24PaySystem(supabase, txMeta),
        notifyClientPaymentConfirmed(supabase, txMeta, tx.amount, tx.currency),
      ]);

      // Trigger paid_flow_id if configured in transaction metadata
      const paidFlowId = txMeta?.paid_flow_id;
      if (paidFlowId) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          let flowConversationId: string | null = null;
          if (txMeta?.proposal_id) {
            const { data: prop } = await supabase.from("proposals").select("case_id").eq("id", txMeta.proposal_id).maybeSingle();
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
                  proposal_id: txMeta?.proposal_id || "",
                },
              }),
            });
            console.log(`[ASAAS-WEBHOOK] Flow ${paidFlowId} triggered for conversation ${flowConversationId}`);
          }
        } catch (flowErr) {
          console.error("[ASAAS-WEBHOOK] Flow trigger error:", flowErr);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, status: newStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
