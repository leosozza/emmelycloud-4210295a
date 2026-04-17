import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null;
  if (expiresAt && expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return integration.access_token;
  }
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
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
 * Resolve the Smart Invoice (entityTypeId=31) stage IDs for a given integration.
 * Cached in bitrix24_integrations.config.smart_invoice_stages.
 *
 * Returns object { pending, paid, declined } where each value is a full stageId like "DT31_1:NEW".
 */
async function resolveSmartInvoiceStages(
  supabase: any,
  integration: any,
  accessToken: string
): Promise<{ pending: string; paid: string; declined: string }> {
  const cfg = (integration.config as any) || {};
  if (cfg.smart_invoice_stages?.pending && cfg.smart_invoice_stages?.paid) {
    return cfg.smart_invoice_stages;
  }

  // Fetch stages from CRM. crm.status.list with entityId starting with "DT31_"
  const stages: { pending: string; paid: string; declined: string } = {
    pending: "DT31_1:NEW",
    paid: "DT31_1:P",
    declined: "DT31_1:D",
  };

  try {
    const res = await callBitrix(integration.client_endpoint, accessToken, "crm.status.list", {
      filter: { ENTITY_ID: "DYNAMIC_31_STAGE_1" },
    });
    const items = res.result || [];
    // STATUS_ID looks like "DT31_1:NEW", "DT31_1:P", "DT31_1:D"
    for (const it of items) {
      const id = String(it.STATUS_ID || "");
      if (id.endsWith(":NEW")) stages.pending = id;
      else if (id.endsWith(":P")) stages.paid = id;
      else if (id.endsWith(":D")) stages.declined = id;
    }
  } catch (e) {
    console.error("[SYNC-INVOICE] stage lookup failed, using defaults:", e);
  }

  // Cache
  try {
    await supabase.from("bitrix24_integrations").update({
      config: { ...cfg, smart_invoice_stages: stages },
    }).eq("id", integration.id);
  } catch (_) { /* ignore */ }

  return stages;
}

function mapStatusToStage(
  status: string,
  stages: { pending: string; paid: string; declined: string }
): string | null {
  switch (status) {
    case "paga":
    case "paid":
      return stages.paid;
    case "cancelada":
    case "cancelled":
    case "canceled":
      return stages.declined;
    case "pendente":
    case "pending":
    case "vencida":
    case "overdue":
      return stages.pending;
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { financial_record_id, bitrix24_invoice_id, new_status } = body || {};

    if (!bitrix24_invoice_id || !new_status) {
      return new Response(JSON.stringify({ error: "bitrix24_invoice_id and new_status required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find active integration (single-tenant for now)
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration?.client_endpoint || !integration?.access_token) {
      return new Response(JSON.stringify({ error: "Bitrix24 integration not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await ensureValidToken(supabase, integration);
    const stages = await resolveSmartInvoiceStages(supabase, integration, accessToken);
    const targetStage = mapStatusToStage(String(new_status), stages);

    if (!targetStage) {
      console.log("[SYNC-INVOICE] No stage mapping for status:", new_status);
      return new Response(JSON.stringify({ ok: false, reason: "no_stage_mapping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: read current stage first
    const invoiceId = parseInt(String(bitrix24_invoice_id), 10);
    if (!isFinite(invoiceId)) {
      return new Response(JSON.stringify({ error: "Invalid invoice id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentRes = await callBitrix(integration.client_endpoint, accessToken, "crm.item.get", {
      entityTypeId: 31,
      id: invoiceId,
    });
    const currentStage = currentRes?.result?.item?.stageId;

    if (currentStage === targetStage) {
      console.log("[SYNC-INVOICE] Stage already correct:", targetStage);
      return new Response(JSON.stringify({ ok: true, skipped: true, stage: targetStage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updateRes = await callBitrix(integration.client_endpoint, accessToken, "crm.item.update", {
      entityTypeId: 31,
      id: invoiceId,
      fields: { stageId: targetStage },
    });

    const ok = !updateRes.error;
    console.log("[SYNC-INVOICE] Update result:", invoiceId, "->", targetStage, ok ? "OK" : updateRes.error);

    // Audit log
    try {
      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration.id,
        event_type: "smart_invoice_status_sync",
        direction: "outbound",
        payload: {
          financial_record_id,
          bitrix24_invoice_id: invoiceId,
          previous_stage: currentStage,
          new_stage: targetStage,
          status: new_status,
        },
        error: ok ? null : String(updateRes.error),
      });
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({
      ok,
      invoice_id: invoiceId,
      previous_stage: currentStage,
      new_stage: targetStage,
      error: ok ? undefined : updateRes.error,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[SYNC-INVOICE] Fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
