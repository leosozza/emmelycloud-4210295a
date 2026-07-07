// Repara campos monetários UF_CRM_EMMELY_* que foram criados como
// integer/double/string convertendo-os para USER_TYPE_ID: "money" (aceita
// centavos e formata como moeda no CRM). Preserva os valores existentes.
//
// Fluxo por campo:
//   1) crm.deal.userfield.list -> localiza pelo FIELD_NAME e lê USER_TYPE_ID
//   2) Se já é "money", pula
//   3) crm.deal.list paginado -> guarda { dealId: valor, currency }
//   4) crm.deal.userfield.delete
//   5) crm.deal.userfield.add com USER_TYPE_ID "money"
//   6) crm.deal.update restaura cada valor no formato "valor|MOEDA"
//
// Invocação:
//   POST /functions/v1/bitrix24-repair-money-fields
//   Body opcional: { fields?: string[], dryRun?: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

interface FieldSpec {
  name: string;
  label: string;
}

const MONEY_FIELDS: FieldSpec[] = [
  { name: "UF_CRM_EMMELY_TOTAL_AMOUNT",       label: "Valor total da cobrança" },
  { name: "UF_CRM_EMMELY_DOWN_PAYMENT",       label: "Valor de entrada" },
  { name: "UF_CRM_EMMELY_REMAINING_BALANCE",  label: "Saldo a parcelar" },
  { name: "UF_CRM_EMMELY_INSTALLMENT_VALUE",  label: "Valor da parcela" },
  { name: "UF_CRM_EMMELY_TOTAL_PAID",         label: "Total pago" },
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

function stripMoney(v: any): { value: string; currency: string | null } {
  if (v === null || v === undefined || v === "") return { value: "", currency: null };
  const s = String(v);
  const [val, cur] = s.split("|");
  return { value: (val ?? "").trim(), currency: cur ? cur.trim() : null };
}

function labelObj(label: string) {
  return { br: label.toUpperCase(), en: label.toUpperCase(), pt: label.toUpperCase() };
}

async function findUserField(ep: string, token: string, fieldName: string): Promise<any | null> {
  // crm.deal.userfield.list retorna array. Paginação improvável para this list.
  const res = await bx(ep, token, "crm.deal.userfield.list", {
    filter: { FIELD_NAME: fieldName },
  });
  if (res.error) throw new Error(`userfield.list ${fieldName}: ${res.error_description || res.error}`);
  const arr = res.result || [];
  return arr.find((f: any) => String(f.FIELD_NAME).toUpperCase() === fieldName.toUpperCase()) || null;
}

async function repairField(
  ep: string,
  token: string,
  spec: FieldSpec,
  dryRun: boolean
): Promise<any> {
  const existing = await findUserField(ep, token, spec.name);
  if (!existing) {
    return { field: spec.name, status: "not_found" };
  }
  const oldType = String(existing.USER_TYPE_ID || "").toLowerCase();
  if (oldType === "money") {
    return { field: spec.name, status: "already_money" };
  }

  // 1) Coleta valores
  const rows: { id: number; value: string; currency: string }[] = [];
  let start = 0;
  while (true) {
    const res = await bx(ep, token, "crm.deal.list", {
      filter: { [`!${spec.name}`]: "" },
      select: ["ID", "CURRENCY_ID", spec.name],
      start,
    });
    if (res.error) throw new Error(`crm.deal.list ${spec.name}: ${res.error_description || res.error}`);
    const list = res.result || [];
    for (const d of list) {
      const raw = d[spec.name];
      if (raw === null || raw === undefined || raw === "" || Number(raw) === 0) continue;
      const parsed = stripMoney(raw);
      const val = parsed.value;
      if (!val || Number(val) === 0) continue;
      rows.push({
        id: Number(d.ID),
        value: val,
        currency: parsed.currency || d.CURRENCY_ID || "EUR",
      });
    }
    if (typeof res.next === "number") start = res.next;
    else break;
    if (list.length === 0) break;
  }

  if (dryRun) {
    return {
      field: spec.name,
      status: "dry_run",
      oldType,
      wouldRestore: rows.length,
      sample: rows.slice(0, 3),
    };
  }

  // 2) Delete
  const delRes = await bx(ep, token, "crm.deal.userfield.delete", { id: existing.ID });
  if (delRes.error) {
    return { field: spec.name, status: "delete_error", error: delRes.error_description || delRes.error };
  }

  // 3) Add como money
  const addRes = await bx(ep, token, "crm.deal.userfield.add", {
    fields: {
      FIELD_NAME: spec.name,
      USER_TYPE_ID: "money",
      SORT: existing.SORT || 500,
      MULTIPLE: existing.MULTIPLE || "N",
      MANDATORY: existing.MANDATORY || "N",
      SHOW_FILTER: existing.SHOW_FILTER || "N",
      SHOW_IN_LIST: existing.SHOW_IN_LIST || "Y",
      EDIT_IN_LIST: existing.EDIT_IN_LIST || "Y",
      IS_SEARCHABLE: existing.IS_SEARCHABLE || "N",
      EDIT_FORM_LABEL: labelObj(spec.label),
      LIST_COLUMN_LABEL: labelObj(spec.label),
      LIST_FILTER_LABEL: labelObj(spec.label),
      SETTINGS: { SIZE: 20, PRECISION: 2 },
    },
  });
  if (addRes.error) {
    return { field: spec.name, status: "add_error", error: addRes.error_description || addRes.error };
  }

  // 4) Restaurar valores
  let restored = 0;
  const failures: any[] = [];
  for (const row of rows) {
    const upd = await bx(ep, token, "crm.deal.update", {
      id: row.id,
      fields: { [spec.name]: `${row.value}|${row.currency}` },
    });
    if (upd.error) {
      failures.push({ id: row.id, error: upd.error_description || upd.error });
    } else {
      restored++;
    }
    // Pequeno respiro para evitar rate limit do Bitrix
    await new Promise(r => setTimeout(r, 50));
  }

  return {
    field: spec.name,
    status: "repaired",
    oldType,
    newType: "money",
    newId: addRes.result,
    collected: rows.length,
    restored,
    failed: failures.length,
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
    if (req.method === "POST") {
      try { body = await req.json(); } catch (_e) { /* ignore */ }
    }
    const filter: string[] | undefined = Array.isArray(body?.fields) ? body.fields.map(String) : undefined;
    const dryRun = !!body?.dryRun;

    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!integration) return json({ error: "No Bitrix24 integration configured" }, 404);

    const token = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint;

    const targets = MONEY_FIELDS.filter(f => !filter || filter.includes(f.name));
    const results: any[] = [];
    for (const spec of targets) {
      try {
        const r = await repairField(ep, token, spec, dryRun);
        results.push(r);
      } catch (e) {
        results.push({ field: spec.name, status: "exception", error: String(e).slice(0, 300) });
      }
    }

    return json({
      success: true,
      dryRun,
      total: targets.length,
      repaired: results.filter(r => r.status === "repaired").length,
      already: results.filter(r => r.status === "already_money").length,
      notFound: results.filter(r => r.status === "not_found").length,
      errors: results.filter(r => String(r.status).endsWith("_error") || r.status === "exception").length,
      results,
    });
  } catch (e) {
    console.error("[bitrix24-repair-money-fields]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
