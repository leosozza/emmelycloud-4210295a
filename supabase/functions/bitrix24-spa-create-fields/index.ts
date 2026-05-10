import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

const ENTITY_TYPE_ID = 1118;

type SpaTypeInfo = { id: number; entityTypeId: number; title?: string };

// Campos a criar na SPA Ação Judicial
// type: string | url | money | date | datetime | enumeration | integer
const FIELDS = [
  { code: "NUMERO_PROCESSO", label: "Número do processo", type: "string" },
  { code: "URL_PROCESSO", label: "URL do Processo", type: "url" },
  { code: "VALOR_CONDENACAO", label: "Valor da condenação", type: "money" },
  { code: "PARTE_CONTRARIA", label: "Parte contrária", type: "string" },
  { code: "PARTE_CONTRARIA_TEXTO", label: "Parte contrária (Texto)", type: "string" },
  { code: "CLIENTE_TEXTO", label: "Cliente (Texto)", type: "string" },
  { code: "RESPONSAVEL_TEXTO", label: "Responsável (Texto)", type: "string" },
  { code: "TIPO_PRAZO", label: "Tipo de prazo", type: "enumeration", items: [
    "Citação", "Contestação", "Recurso", "Manifestação", "Cumprimento", "Audiência", "Outro"
  ]},
  { code: "PRAZO_FATAL", label: "Prazo fatal", type: "date" },
  { code: "PRAZO_ATIVIDADE", label: "Prazo da atividade", type: "date" },
  { code: "DESCRICAO_PRAZO", label: "Descrição do prazo", type: "string" },
  { code: "TIPO_AUDIENCIA", label: "Tipo de audiência", type: "enumeration", items: [
    "Conciliação", "Instrução", "Julgamento", "Una", "Outra"
  ]},
  { code: "MODALIDADE", label: "Modalidade", type: "enumeration", items: [
    "Presencial", "Online", "Híbrida"
  ]},
  { code: "DATA_HORA_AUDIENCIA", label: "Data/Hora da audiência", type: "datetime" },
  { code: "LINK_LOCAL_AUDIENCIA", label: "Link/Local de audiência", type: "string" },
  { code: "NIF", label: "NIF", type: "string" },
  { code: "NISS", label: "NISS", type: "string" },
  { code: "DEAL_ORIGEM_ID", label: "ID Deal Origem (Migração)", type: "integer" },
  { code: "DEAL_ORIGEM_URL", label: "URL Deal Origem (Migração)", type: "url" },
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
  const r = await fetch(`${ep}${method}?auth=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function normalizeCode(s: string) {
  return (s || "")
    .replace(/^ufCrm/i, "")
    .replace(/^UF_CRM_/i, "")
    .replace(/^[0-9]+_?/, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

async function getSpaType(ep: string, token: string): Promise<SpaTypeInfo> {
  const res = await bx(ep, token, "crm.type.list.json", {});
  if (res.error) throw new Error(`crm.type.list: ${res.error_description || res.error}`);
  const types = res.result?.types || [];
  const match = types.find((t: any) => Number(t.entityTypeId) === ENTITY_TYPE_ID);
  if (!match?.id) throw new Error(`SPA entityTypeId ${ENTITY_TYPE_ID} não encontrada em crm.type.list`);
  return { id: Number(match.id), entityTypeId: Number(match.entityTypeId), title: match.title };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: "No integration" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const token = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint;

    const spaType = await getSpaType(ep, token);
    const entityId = `CRM_${spaType.id}`;

    // Get existing fields to skip duplicates
    const existingRes = await bx(ep, token, "crm.item.fields.json", { entityTypeId: ENTITY_TYPE_ID });
    const existingFields = existingRes.result?.fields || existingRes.result || {};
    const existingCodes = new Set(
      Object.entries<any>(existingFields).flatMap(([k, meta]) => [
        normalizeCode(k),
        normalizeCode(meta?.title || ""),
        normalizeCode(meta?.formLabel || ""),
      ])
    );

    const results: any[] = [];

    for (const f of FIELDS) {
      const upperCode = f.code.toUpperCase();
      const alreadyExists = [...existingCodes].some(c => c === upperCode || c.endsWith("_" + upperCode));

      if (alreadyExists) {
        results.push({ code: f.code, status: "skipped", reason: "already exists" });
        continue;
      }

      const payload: Record<string, any> = {
        moduleId: "crm",
        field: {
          entityId,
          fieldName: `UF_CRM_${spaType.id}_${upperCode}`,
          userTypeId: f.type === "url" ? "url"
            : f.type === "money" ? "money"
            : f.type === "date" ? "date"
            : f.type === "datetime" ? "datetime"
            : f.type === "enumeration" ? "enumeration"
            : f.type === "integer" ? "integer"
            : "string",
          editFormLabel: { pt: f.label, en: f.label, ru: f.label },
          listColumnLabel: { pt: f.label, en: f.label, ru: f.label },
          listFilterLabel: { pt: f.label, en: f.label, ru: f.label },
          xmlId: `emmely_acao_judicial_${upperCode.toLowerCase()}`,
          sort: 100,
        },
      };

      if (f.type === "enumeration" && f.items) {
        payload.field.enum = f.items.map((v, i) => ({
          value: v, def: i === 0 ? "Y" : "N", sort: (i + 1) * 10,
        }));
      }

      const r = await bx(ep, token, "userfieldconfig.add.json", payload);
      if (r.error) {
        results.push({ code: f.code, status: "error", error: r.error_description || r.error });
      } else {
        results.push({ code: f.code, status: "created", id: r.result });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      entity_id: entityId,
      spa_type_id: spaType.id,
      entity_type_id: ENTITY_TYPE_ID,
      total: FIELDS.length,
      created: results.filter(r => r.status === "created").length,
      skipped: results.filter(r => r.status === "skipped").length,
      errors: results.filter(r => r.status === "error").length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
  } catch (e) {
    console.error("[spa-create-fields]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
