// Repara campos UF_CRM_EMMELY_TOTAL_INSTALLMENTS e
// UF_CRM_EMMELY_DOWN_INSTALLMENTS que foram criados como "enumeration"
// (lista com valores tipo "5 Parcelas") — converte para "integer" e
// preserva o valor numérico existente em cada deal.
//
// Fluxo por campo:
//   1) crm.deal.userfield.list -> localiza pelo FIELD_NAME
//   2) Se USER_TYPE_ID já é "integer", pula
//   3) Se é "enumeration": lê os LIST items (id -> label numérico)
//   4) crm.deal.list paginado -> guarda { dealId: enumId }
//   5) crm.deal.userfield.delete
//   6) crm.deal.userfield.add com USER_TYPE_ID "integer"
//   7) crm.deal.update restaura cada valor como número puro
//
// Idempotente: rodar N vezes = mesmo resultado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

interface FieldSpec { name: string; label: string; }

const INT_FIELDS: FieldSpec[] = [
  { name: "UF_CRM_EMMELY_TOTAL_INSTALLMENTS", label: "Nº de parcelas" },
  { name: "UF_CRM_EMMELY_DOWN_INSTALLMENTS",  label: "Nº parcelas da entrada" },
];

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return integration.access_token;
  const r = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Token refresh: ${d.error_description || d.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return d.access_token;
}

async function bx(ep: string, token: string, method: string, body: Record<string, any> = {}) {
  const r = await fetch(`${ep}${method}.json?auth=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function labelObj(label: string) {
  return { br: label.toUpperCase(), en: label.toUpperCase(), pt: label.toUpperCase() };
}

async function findUserField(ep: string, token: string, fieldName: string): Promise<any | null> {
  const res = await bx(ep, token, "crm.deal.userfield.list", {
    filter: { FIELD_NAME: fieldName },
  });
  if (res.error) throw new Error(`userfield.list ${fieldName}: ${res.error_description || res.error}`);
  const arr = res.result || [];
  return arr.find((f: any) => String(f.FIELD_NAME).toUpperCase() === fieldName.toUpperCase()) || null;
}

function extractNumeric(label: any): number | null {
  if (label === null || label === undefined) return null;
  const s = String(label);
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

async function repairField(ep: string, token: string, spec: FieldSpec, dryRun: boolean): Promise<any> {
  const existing = await findUserField(ep, token, spec.name);
  if (!existing) return { field: spec.name, status: "not_found" };

  const oldType = String(existing.USER_TYPE_ID || "").toLowerCase();
  if (oldType === "integer" || oldType === "double") {
    return { field: spec.name, status: "already_integer", oldType };
  }
  if (oldType !== "enumeration") {
    return { field: spec.name, status: "skip_unexpected_type", oldType };
  }

  // Map enum ID -> numeric value from LIST metadata
  const enumMap = new Map<string, number>();
  const list = existing.LIST || [];
  for (const item of list) {
    const n = extractNumeric(item.VALUE);
    if (n !== null) enumMap.set(String(item.ID), n);
  }

  // Collect deals with values
  const rows: { id: number; value: number }[] = [];
  let start = 0;
  while (true) {
    const res = await bx(ep, token, "crm.deal.list", {
      filter: { [`!${spec.name}`]: "" },
      select: ["ID", spec.name],
      start,
    });
    if (res.error) throw new Error(`crm.deal.list ${spec.name}: ${res.error_description || res.error}`);
    const deals = res.result || [];
    for (const d of deals) {
      const raw = d[spec.name];
      if (raw === null || raw === undefined || raw === "") continue;
      // enumeration returns the enum ID (string). Fallback: try direct numeric parse.
      const num = enumMap.get(String(raw)) ?? extractNumeric(raw);
      if (num === null || num <= 0) continue;
      rows.push({ id: Number(d.ID), value: num });
    }
    if (typeof res.next === "number" && deals.length > 0) start = res.next;
    else break;
  }

  if (dryRun) {
    return {
      field: spec.name, status: "dry_run", oldType,
      enumOptions: enumMap.size, wouldRestore: rows.length, sample: rows.slice(0, 3),
    };
  }

  const delRes = await bx(ep, token, "crm.deal.userfield.delete", { id: existing.ID });
  if (delRes.error) return { field: spec.name, status: "delete_error", error: delRes.error_description || delRes.error };

  const addRes = await bx(ep, token, "crm.deal.userfield.add", {
    fields: {
      FIELD_NAME: spec.name,
      USER_TYPE_ID: "integer",
      SORT: existing.SORT || 500,
      MULTIPLE: "N",
      MANDATORY: existing.MANDATORY || "N",
      SHOW_FILTER: existing.SHOW_FILTER || "N",
      SHOW_IN_LIST: existing.SHOW_IN_LIST || "Y",
      EDIT_IN_LIST: existing.EDIT_IN_LIST || "Y",
      IS_SEARCHABLE: existing.IS_SEARCHABLE || "N",
      EDIT_FORM_LABEL: labelObj(spec.label),
      LIST_COLUMN_LABEL: labelObj(spec.label),
      LIST_FILTER_LABEL: labelObj(spec.label),
    },
  });
  if (addRes.error) return { field: spec.name, status: "add_error", error: addRes.error_description || addRes.error };

  let restored = 0;
  const failures: any[] = [];
  for (const row of rows) {
    const upd = await bx(ep, token, "crm.deal.update", {
      id: row.id,
      fields: { [spec.name]: row.value },
    });
    if (upd.error) failures.push({ id: row.id, error: upd.error_description || upd.error });
    else restored++;
    await new Promise(r => setTimeout(r, 50));
  }

  return {
    field: spec.name, status: "repaired", oldType, newType: "integer",
    newId: addRes.result, collected: rows.length, restored, failed: failures.length,
    failures: failures.slice(0, 10),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const json = (b: any, s = 200) => new Response(JSON.stringify(b, null, 2), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch (_e) { /* ignore */ } }
    const filter: string[] | undefined = Array.isArray(body?.fields) ? body.fields.map(String) : undefined;
    // Safety gate: DELETE+ADD do UF é destrutivo. Requer { confirm: true } para
    // aplicar; sem confirmação, corre em dryRun (não modifica nada no Bitrix24).
    const dryRun = body?.confirm === true ? !!body?.dryRun : true;

    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!integration) return json({ error: "No Bitrix24 integration configured" }, 404);

    const token = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint;

    const targets = INT_FIELDS.filter(f => !filter || filter.includes(f.name));
    const results: any[] = [];
    for (const spec of targets) {
      try { results.push(await repairField(ep, token, spec, dryRun)); }
      catch (e) { results.push({ field: spec.name, status: "exception", error: String(e).slice(0, 300) }); }
    }

    return json({
      success: true, dryRun, total: targets.length,
      repaired: results.filter(r => r.status === "repaired").length,
      already: results.filter(r => r.status === "already_integer").length,
      notFound: results.filter(r => r.status === "not_found").length,
      errors: results.filter(r => String(r.status).endsWith("_error") || r.status === "exception").length,
      results,
    });
  } catch (e) {
    console.error("[bitrix24-repair-installments-fields]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
