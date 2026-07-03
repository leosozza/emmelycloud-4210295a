// Emmely Pay — cancel charge.
// Cancels payment_transactions + best-effort expires Stripe Checkout Sessions +
// moves the corresponding Bitrix24 Smart Invoices (entityTypeId 31) to a
// cancelled stage. Called from the iframe (deal or per-invoice buttons) and
// from the BizProc robot `emmely_cancel_charge`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Bitrix helpers (duplicated from robot-handler — small footprint) ---

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}) {
  const res = await fetch(`${endpoint}${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

async function refreshBitrixToken(supabase: any, integration: any): Promise<string> {
  const clientId = Deno.env.get("BITRIX24_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("BITRIX24_CLIENT_SECRET") || "";
  if (!integration?.refresh_token || !clientId || !clientSecret) return integration?.access_token;
  const url = `https://oauth.bitrix.info/oauth/token/?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${integration.refresh_token}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d?.access_token) {
    const newExpiresAt = new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString();
    await supabase.from("bitrix24_integrations").update({
      access_token: d.access_token,
      refresh_token: d.refresh_token || integration.refresh_token,
      expires_at: newExpiresAt,
    }).eq("id", integration.id);
    integration.access_token = d.access_token;
    return d.access_token;
  }
  return integration.access_token;
}

async function callBitrixWithRefresh(supabase: any, integration: any, method: string, params: Record<string, any> = {}) {
  let r = await callBitrix(integration.client_endpoint, integration.access_token, method, params);
  if (r?.error === "expired_token" || r?.error === "WRONG_TOKEN") {
    await refreshBitrixToken(supabase, integration);
    r = await callBitrix(integration.client_endpoint, integration.access_token, method, params);
  }
  return r;
}

async function postTimelineComment(supabase: any, integration: any, dealId: string | number, comment: string) {
  try {
    await callBitrixWithRefresh(supabase, integration, "crm.timeline.comment.add", {
      fields: { ENTITY_ID: parseInt(String(dealId)) || dealId, ENTITY_TYPE: "deal", COMMENT: comment, AUTHOR_ID: 1 },
    });
  } catch (_) { /* best-effort */ }
}

// --- Stripe expire helper ---
async function resolveStripeKey(
  supabase: any,
  companyId: string | null,
  fallbackRegion: "pt" | "br" | null,
): Promise<string | null> {
  try {
    if (companyId) {
      const { data: comp } = await supabase.from("companies").select("stripe_credential_key").eq("id", companyId).maybeSingle();
      const provider = comp?.stripe_credential_key;
      if (provider) {
        const { data: cred } = await supabase
          .from("integration_credentials").select("credential_value")
          .eq("provider", provider).eq("credential_key", "STRIPE_SECRET_KEY").maybeSingle();
        const v = cred?.credential_value?.trim();
        if (v) return v;
      }
    }
  } catch (_) { /* fall through */ }
  const keyName = fallbackRegion === "br" ? "STRIPE_SECRET_KEY_BR" : "STRIPE_SECRET_KEY_PT";
  return Deno.env.get(keyName) || Deno.env.get("STRIPE_SECRET_KEY") || null;
}

async function expireStripeSession(stripeKey: string, sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/expire`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[PAYMENT-CANCEL] Stripe expire ${sessionId} HTTP ${res.status}: ${txt.slice(0, 160)}`);
      // "already expired" or "already canceled" is fine for us.
      return res.status === 400 && /already/i.test(txt);
    }
    return true;
  } catch (e) {
    console.warn(`[PAYMENT-CANCEL] Stripe expire error ${sessionId}:`, String(e).slice(0, 200));
    return false;
  }
}

// --- Body types ---
type CancelMode = "deal" | "invoice" | "tx";
interface CancelBody {
  mode?: CancelMode;
  deal_id?: string | number;
  invoice_id?: string | number;
  tx_id?: string;
  member_id?: string;
  reason?: string;
  source?: "iframe" | "robot";
}

async function loadIntegration(supabase: any, memberId?: string) {
  if (memberId) {
    const { data } = await supabase.from("bitrix24_integrations").select("*").eq("member_id", memberId).maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from("bitrix24_integrations").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: CancelBody = {};
  try { body = await req.json(); } catch { body = {}; }

  const mode: CancelMode = body.mode
    || (body.tx_id ? "tx" : body.invoice_id ? "invoice" : body.deal_id ? "deal" : "deal");
  const reason = String(body.reason || "").slice(0, 500) || "Cancelado";
  const source = body.source === "robot" ? "robot" : "iframe";

  const integration = await loadIntegration(supabase, body.member_id);

  // --- Resolve target transactions ---
  let dealId: string | null = null;
  let txs: any[] = [];

  try {
    if (mode === "tx" && body.tx_id) {
      const { data } = await supabase.from("payment_transactions").select("*").eq("id", body.tx_id).maybeSingle();
      if (data) txs = [data];
      dealId = (data?.metadata as any)?.bitrix_deal_id || null;
    } else if (mode === "invoice" && body.invoice_id) {
      // Find tx that has this bitrix invoice id in metadata.
      const invoiceIdStr = String(body.invoice_id);
      const { data } = await supabase
        .from("payment_transactions").select("*")
        .eq("metadata->>bitrix_old_invoice_id", invoiceIdStr)
        .order("created_at", { ascending: false }).limit(5);
      txs = data || [];
      if (txs[0]) dealId = (txs[0].metadata as any)?.bitrix_deal_id || null;

      // If not found and we have integration, fetch invoice → find its UF tx_id.
      if (txs.length === 0 && integration) {
        try {
          const invGet = await callBitrixWithRefresh(supabase, integration, "crm.item.get", {
            entityTypeId: 31, id: parseInt(invoiceIdStr) || invoiceIdStr,
          });
          const item = invGet?.result?.item || {};
          const ufTx = item.ufCrm_SmartInvoice_EmmelyTxId || item.UF_CRM_SMART_INVOICE_EMMELY_TX_ID;
          const parentDeal = item.parentId2 || item.PARENT_ID_2;
          if (parentDeal) dealId = String(parentDeal);
          if (ufTx) {
            const { data: tx } = await supabase.from("payment_transactions").select("*").eq("id", ufTx).maybeSingle();
            if (tx) txs = [tx];
          }
        } catch (_) { /* silent */ }
      }
    } else if (mode === "deal" && body.deal_id) {
      dealId = String(body.deal_id);
      const { data } = await supabase
        .from("payment_transactions").select("*")
        .eq("metadata->>bitrix_deal_id", dealId)
        .order("created_at", { ascending: false }).limit(200);
      // Take latest installment group only.
      const rows = data || [];
      const firstGroup = (rows[0]?.metadata as any)?.installment_group_id;
      if (firstGroup) {
        txs = rows.filter((r) => (r.metadata as any)?.installment_group_id === firstGroup);
      } else {
        txs = rows.filter((r) => ["pending", "processing"].includes(String(r.status || "").toLowerCase()));
      }
    }
  } catch (e) {
    console.error("[PAYMENT-CANCEL] Resolve target failed:", e);
    return new Response(JSON.stringify({ status: "error", error: String(e).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (txs.length === 0) {
    return new Response(JSON.stringify({ status: "not_found", reason: "no transactions matched" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Guard: if any tx is already paid, block.
  const paidSet = new Set(["paid", "succeeded", "confirmed", "partial"]);
  const paidTx = txs.find((t) => paidSet.has(String(t.status || "").toLowerCase()));
  if (paidTx) {
    if (dealId && integration) {
      await postTimelineComment(supabase, integration, dealId,
        `[B]⚠️ Emmely Pay — cancelamento bloqueado[/B]\nJá existe pagamento realizado neste grupo. Cancele/estorne manualmente antes de reprocessar.`);
    }
    return new Response(JSON.stringify({ status: "blocked", reason: "already_paid", paid_tx_id: paidTx.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter only cancellable statuses.
  const cancellable = txs.filter((t) => ["pending", "processing"].includes(String(t.status || "").toLowerCase()));
  if (cancellable.length === 0) {
    return new Response(JSON.stringify({ status: "noop", reason: "nothing pending to cancel", found: txs.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- 1) Cancel transactions in DB (preserve metadata + add cancel info) ---
  const ids = cancellable.map((t) => t.id);
  const nowIso = new Date().toISOString();
  for (const t of cancellable) {
    const mergedMeta = { ...(t.metadata || {}), cancelled_at: nowIso, cancel_reason: reason, cancelled_source: source };
    await supabase.from("payment_transactions").update({ status: "cancelled", metadata: mergedMeta }).eq("id", t.id);
  }

  // --- 2) Best-effort Stripe expire ---
  const companyId = cancellable.find((t) => t.company_id)?.company_id || null;
  const currency = cancellable[0]?.currency || "EUR";
  const gateway = cancellable[0]?.gateway || "";
  const region: "pt" | "br" | null =
    gateway === "stripe_br" ? "br" : (gateway === "stripe_pt" || gateway === "stripe" ? "pt" : (currency === "BRL" ? "br" : "pt"));
  const stripeKey = await resolveStripeKey(supabase, companyId, region);
  let stripeExpired = 0;
  if (stripeKey) {
    for (const t of cancellable) {
      if (!t.gateway_payment_id || !String(t.gateway || "").startsWith("stripe")) continue;
      if (await expireStripeSession(stripeKey, t.gateway_payment_id)) stripeExpired++;
    }
  }

  // --- 3) Best-effort update Bitrix Smart Invoices ---
  let invoicesCancelled = 0;
  if (integration) {
    const invoiceIds: number[] = [];
    for (const t of cancellable) {
      const invId = (t.metadata as any)?.bitrix_old_invoice_id;
      if (invId) invoiceIds.push(parseInt(String(invId)));
    }
    for (const invoiceId of invoiceIds) {
      if (!invoiceId || Number.isNaN(invoiceId)) continue;
      try {
        const upd = await callBitrixWithRefresh(supabase, integration, "crm.item.update", {
          entityTypeId: 31,
          id: invoiceId,
          fields: {
            stageId: "DT31_3:D",
            ufCrm_SmartInvoice_EmmelyPaymentStatus: "Cancelado",
          },
        });
        if (upd?.error) {
          // Fallback: try just the stage; UF fields may not exist yet on this portal.
          const upd2 = await callBitrixWithRefresh(supabase, integration, "crm.item.update", {
            entityTypeId: 31, id: invoiceId, fields: { stageId: "DT31_3:D" },
          });
          if (!upd2?.error) invoicesCancelled++;
        } else {
          invoicesCancelled++;
        }
      } catch (e) {
        console.warn(`[PAYMENT-CANCEL] Invoice ${invoiceId} update failed:`, String(e).slice(0, 200));
      }
    }
  }

  // --- 4) If the whole group is cancelled, clear deal UF fields ---
  let dealUrlCleared = false;
  if (dealId && integration && mode !== "invoice") {
    // For mode=deal, we cancelled the whole group → clear.
    // For mode=tx, only clear if no more pending tx remain in that group.
    let shouldClear = mode === "deal";
    if (mode === "tx") {
      const gid = (cancellable[0]?.metadata as any)?.installment_group_id;
      if (gid) {
        const { count } = await supabase
          .from("payment_transactions")
          .select("id", { count: "exact", head: true })
          .eq("metadata->>installment_group_id", gid)
          .in("status", ["pending", "processing"]);
        shouldClear = (count || 0) === 0;
      }
    }
    if (shouldClear) {
      try {
        const upd = await callBitrixWithRefresh(supabase, integration, "crm.deal.update", {
          id: parseInt(dealId),
          fields: { UF_CRM_EMMELY_PAYMENT_URL: "", UF_CRM_EMMELY_GATEWAY: "" },
        });
        dealUrlCleared = !upd?.error;
      } catch (_) { /* silent */ }
    }
  }
  // For mode=invoice, also check group emptiness and clear.
  if (dealId && integration && mode === "invoice") {
    const gid = (cancellable[0]?.metadata as any)?.installment_group_id;
    if (gid) {
      const { count } = await supabase
        .from("payment_transactions")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>installment_group_id", gid)
        .in("status", ["pending", "processing"]);
      if ((count || 0) === 0) {
        try {
          const upd = await callBitrixWithRefresh(supabase, integration, "crm.deal.update", {
            id: parseInt(dealId),
            fields: { UF_CRM_EMMELY_PAYMENT_URL: "", UF_CRM_EMMELY_GATEWAY: "" },
          });
          dealUrlCleared = !upd?.error;
        } catch (_) { /* silent */ }
      }
    }
  }

  // --- 5) Timeline comment on deal ---
  if (dealId && integration) {
    const originLabel = source === "robot" ? "robot BizProc" : "iframe";
    const scope = mode === "deal" ? "cobrança inteira" : (mode === "invoice" ? `fatura #${body.invoice_id}` : "parcela");
    const comment =
      `[B]🚫 Emmely Pay — ${scope} cancelada (${originLabel})[/B]\n` +
      `Parcelas canceladas: ${cancellable.length}\n` +
      `Faturas Bitrix atualizadas: ${invoicesCancelled}\n` +
      `Sessões Stripe expiradas: ${stripeExpired}\n` +
      (dealUrlCleared ? `Campo UF_CRM_EMMELY_PAYMENT_URL do negócio foi limpo.\n` : "") +
      `Motivo: ${reason}`;
    await postTimelineComment(supabase, integration, dealId, comment);
  }

  // --- 6) Audit log ---
  try {
    await supabase.from("bitrix24_debug_logs").insert({
      event_type: "charge_cancelled",
      direction: "outbound",
      payload: {
        mode, source, reason, deal_id: dealId, invoice_id: body.invoice_id || null, tx_id: body.tx_id || null,
        cancelled_count: cancellable.length, invoices_cancelled: invoicesCancelled,
        stripe_expired: stripeExpired, deal_url_cleared: dealUrlCleared,
        cancelled_tx_ids: ids,
      },
    });
  } catch (_) { /* best-effort */ }

  return new Response(JSON.stringify({
    status: "cancelled",
    cancelled_count: cancellable.length,
    invoices_cancelled: invoicesCancelled,
    stripe_expired: stripeExpired,
    deal_url_cleared: dealUrlCleared,
    deal_id: dealId,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
