// Ensures Asaas-related UF_CRM_EMMELY_* custom fields exist on Bitrix24 Deals.
// Idempotent: skips fields that already exist, creates the missing ones.
//
// Fields installed:
//   UF_CRM_EMMELY_ASAAS_PAYMENT_ID  (string)  – last Asaas charge id linked to deal
//   UF_CRM_EMMELY_ASAAS_SUB_ID      (string)  – Asaas subscription id (if recurring)
//   UF_CRM_EMMELY_NFSE_URL          (url)     – public PDF of last issued NFSe
//   UF_CRM_EMMELY_NFSE_NUMBER       (string)  – municipal NFSe number
//   UF_CRM_EMMELY_NFSE_STATUS       (string)  – AUTHORIZED|SCHEDULED|ERROR|...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIELDS = [
  { code: "EMMELY_ASAAS_PAYMENT_ID", label: "Asaas: ID da cobrança", type: "string" },
  { code: "EMMELY_ASAAS_SUB_ID", label: "Asaas: ID da assinatura", type: "string" },
  { code: "EMMELY_ASAAS_CUSTOMER_ID", label: "Asaas: ID do cliente", type: "string" },
  { code: "EMMELY_NFSE_URL", label: "NFSe (PDF)", type: "url" },
  { code: "EMMELY_NFSE_NUMBER", label: "NFSe (Número)", type: "string" },
  { code: "EMMELY_NFSE_STATUS", label: "NFSe (Status)", type: "string" },
];

const labelMap = (l: string) => ({ pt: l, br: l, en: l, ru: l, de: l, ua: l, la: l });

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60 * 1000) return integration.access_token;
  const r = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID") || "",
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET") || "",
      refresh_token: integration.refresh_token,
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`refresh: ${d.error_description || d.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return d.access_token;
}

async function bx(ep: string, token: string, method: string, body: any) {
  const r = await fetch(`${ep}${method}?auth=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!integration) {
      return new Response(JSON.stringify({ error: "no integration" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint.endsWith("/")
      ? integration.client_endpoint : integration.client_endpoint + "/";

    // current Deal user fields
    const existingRes = await bx(ep, token, "crm.deal.userfield.list", {});
    const existing = new Set(
      (existingRes.result || []).map((f: any) => String(f.FIELD_NAME || "").toUpperCase()),
    );

    const results: any[] = [];
    for (const f of FIELDS) {
      const fieldName = `UF_CRM_${f.code}`;
      if (existing.has(fieldName)) {
        results.push({ field: fieldName, status: "exists" });
        continue;
      }
      const userTypeId = f.type === "url" ? "url" : "string";
      const r = await bx(ep, token, "crm.deal.userfield.add", {
        fields: {
          FIELD_NAME: f.code, // Bitrix prepends UF_CRM_
          USER_TYPE_ID: userTypeId,
          XML_ID: `emmely_${f.code.toLowerCase()}`,
          SORT: 500,
          MULTIPLE: "N",
          MANDATORY: "N",
          SHOW_FILTER: "N",
          SHOW_IN_LIST: "N",
          EDIT_IN_LIST: "Y",
          IS_SEARCHABLE: "N",
          EDIT_FORM_LABEL: labelMap(f.label),
          LIST_COLUMN_LABEL: labelMap(f.label),
          LIST_FILTER_LABEL: labelMap(f.label),
        },
      });
      if (r.error) {
        results.push({ field: fieldName, status: "error", error: r.error_description || r.error });
      } else {
        results.push({ field: fieldName, status: "created", id: r.result });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      created: results.filter(x => x.status === "created").length,
      existing: results.filter(x => x.status === "exists").length,
      errors: results.filter(x => x.status === "error").length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[ensure-asaas-fields]", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
