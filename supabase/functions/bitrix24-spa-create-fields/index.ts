import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

const ENTITY_TYPE_ID = 1118;

type SpaTypeInfo = { id: number; entityTypeId: number; title?: string };

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

// Lang map abrangendo PT (PT), BR, EN, RU para garantir que o label aparece em qualquer interface
const labelMap = (label: string) => ({
  pt: label, br: label, en: label, ru: label, de: label, ua: label, la: label,
});

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

async function getSpaType(ep: string, token: string): Promise<SpaTypeInfo> {
  const res = await bx(ep, token, "crm.type.list.json", {});
  if (res.error) throw new Error(`crm.type.list: ${res.error_description || res.error}`);
  const types = res.result?.types || [];
  const match = types.find((t: any) => Number(t.entityTypeId) === ENTITY_TYPE_ID);
  if (!match?.id) throw new Error(`SPA entityTypeId ${ENTITY_TYPE_ID} não encontrada`);
  return { id: Number(match.id), entityTypeId: Number(match.entityTypeId), title: match.title };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

  try {
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!integration) return json({ error: "No integration" }, 404);

    const token = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint;
    const spaType = await getSpaType(ep, token);
    const entityId = `CRM_${spaType.id}`;

    // Lista campos existentes (com IDs) para poder fazer UPDATE de labels
    const listRes = await bx(ep, token, "userfieldconfig.list.json", {
      moduleId: "crm",
      filter: { entityId },
    });
    const existingList = listRes.result || [];
    const byFieldName: Record<string, any> = {};
    for (const f of existingList) {
      const name = String(f.fieldName || f.FIELD_NAME || "").toUpperCase();
      if (name) byFieldName[name] = f;
    }

    const results: any[] = [];

    for (const f of FIELDS) {
      const upperCode = f.code.toUpperCase();
      const fieldName = `UF_CRM_${spaType.id}_${upperCode}`;
      const existing = byFieldName[fieldName];

      const userTypeId =
        f.type === "url" ? "url"
        : f.type === "money" ? "money"
        : f.type === "date" ? "date"
        : f.type === "datetime" ? "datetime"
        : f.type === "enumeration" ? "enumeration"
        : f.type === "integer" ? "integer"
        : "string";

      if (existing) {
        // UPDATE labels
        const updatePayload: Record<string, any> = {
          moduleId: "crm",
          id: existing.id || existing.ID,
          field: {
            editFormLabel: labelMap(f.label),
            listColumnLabel: labelMap(f.label),
            listFilterLabel: labelMap(f.label),
            helpMessage: labelMap(f.label),
          },
        };
        const r = await bx(ep, token, "userfieldconfig.update.json", updatePayload);
        if (r.error) {
          results.push({ code: f.code, status: "update_error", error: r.error_description || r.error });
        } else {
          results.push({ code: f.code, status: "updated", label: f.label });
        }
        continue;
      }

      // CREATE
      const payload: Record<string, any> = {
        moduleId: "crm",
        field: {
          entityId,
          fieldName,
          userTypeId,
          editFormLabel: labelMap(f.label),
          listColumnLabel: labelMap(f.label),
          listFilterLabel: labelMap(f.label),
          helpMessage: labelMap(f.label),
          xmlId: `emmely_acao_judicial_${upperCode.toLowerCase()}`,
          sort: 100,
          showFilter: "Y",
        },
      };
      if (f.type === "enumeration" && f.items) {
        payload.field.enum = f.items.map((v, i) => ({
          value: v, def: i === 0 ? "Y" : "N", sort: (i + 1) * 10,
        }));
      }
      const r = await bx(ep, token, "userfieldconfig.add.json", payload);
      if (r.error) {
        results.push({ code: f.code, status: "create_error", error: r.error_description || r.error });
      } else {
        results.push({ code: f.code, status: "created", id: r.result, label: f.label });
      }
    }

    return json({
      success: true,
      entity_id: entityId,
      spa_type_id: spaType.id,
      total: FIELDS.length,
      created: results.filter(r => r.status === "created").length,
      updated: results.filter(r => r.status === "updated").length,
      errors: results.filter(r => r.status?.endsWith("error")).length,
      results,
    });
  } catch (e) {
    console.error("[spa-create-fields]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
