import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

const SOURCE_CATEGORY_ID = 25;
const TARGET_ENTITY_TYPE_ID = 1118;
const REVERSE_LINK_FIELD = "UF_CRM_1778431525"; // campo do deal que recebe ID da SPA

// Mapeamento campo deal -> campo SPA
const FIELD_MAP: Record<string, string> = {
  // Estes UFs vêm dos deals atuais — copiados conforme estiverem preenchidos
  // O nome do campo deal precisa ser identificado dinamicamente no momento da migração
  // pois a função usa LABELS, não códigos UF, para fazer o match.
};

// Map por LABEL (deal origem) -> código lógico do campo na SPA.
// A chave real da SPA é resolvida dinamicamente via crm.item.fields, pois o Bitrix gera ufCrm{spaId}NomeCampo.
const LABEL_TO_SPA_CODE: Record<string, string> = {
  "Número do processo": "NUMERO_PROCESSO",
  "URL do Processo": "URL_PROCESSO",
  " URL do Processo": "URL_PROCESSO",
  "Valor da condenação": "VALOR_CONDENACAO",
  " Valor da condenação": "VALOR_CONDENACAO",
  "Parte contrária": "PARTE_CONTRARIA",
  "Parte contrária:": "PARTE_CONTRARIA",
  "Parte contraria (Texto)": "PARTE_CONTRARIA_TEXTO",
  " Cliente (Texto)": "CLIENTE_TEXTO",
  "Cliente (Texto)": "CLIENTE_TEXTO",
  "Responsável (Texto)": "RESPONSAVEL_TEXTO",
  "Tipo de prazo:": "TIPO_PRAZO",
  "Prazo fatal:": "PRAZO_FATAL",
  "Prazo da atividade:": "PRAZO_ATIVIDADE",
  "Descrição do prazo:": "DESCRICAO_PRAZO",
  "Tipo de audiência:": "TIPO_AUDIENCIA",
  "Modalidade:": "MODALIDADE",
  "Data/Hora da audiência:": "DATA_HORA_AUDIENCIA",
  "Link/Local de audiência:": "LINK_LOCAL_AUDIENCIA",
  "NIF": "NIF",
  "NISS": "NISS",
};

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
  if (d.error) throw new Error(`Token: ${d.error_description || d.error}`);
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

function normalize(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCode(s: string) {
  return (s || "")
    .replace(/^ufCrm/i, "")
    .replace(/^UF_CRM_/i, "")
    .replace(/^[0-9]+_?/, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function fieldLabel(meta: any) {
  const candidates = [meta?.formLabel, meta?.title, meta?.listLabel, meta?.listColumnLabel, meta?.listFilterLabel];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (c && typeof c === "object") {
      const v = c.pt || c.en || c.br || Object.values(c).find((x: any) => typeof x === "string" && x.trim());
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "dry_run") as "dry_run" | "execute";
    const limitParam = parseInt(url.searchParams.get("limit") || "0");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const sessionIdParam = url.searchParams.get("session_id");
    const sessionId = sessionIdParam || crypto.randomUUID();

    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!integration) {
      return new Response(JSON.stringify({ error: "No integration" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    const token = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint;

    // 1) Mapas: deal fields (UF -> label) e SPA fields reais (código lógico -> ufCrm{spaId}*)
    const spaFieldsRes = await bx(ep, token, "crm.item.fields.json", { entityTypeId: TARGET_ENTITY_TYPE_ID });
    if (spaFieldsRes.error) throw new Error(`crm.item.fields: ${spaFieldsRes.error_description || spaFieldsRes.error}`);
    const spaFields = spaFieldsRes.result?.fields || spaFieldsRes.result || {};
    const spaCodeToField: Record<string, string> = {};
    for (const [code, meta] of Object.entries<any>(spaFields)) {
      const logical = normalizeCode(code);
      if (logical) spaCodeToField[logical] = code;
      const xmlLogical = normalizeCode(String(meta?.xmlId || "").replace(/^emmely_acao_judicial_/i, ""));
      if (xmlLogical) spaCodeToField[xmlLogical] = code;
      const labelLogical = Object.entries(LABEL_TO_SPA_CODE).find(([label]) => normalize(fieldLabel(meta)) === normalize(label))?.[1];
      if (labelLogical) spaCodeToField[labelLogical] = code;
    }

    const dealFieldsRes = await bx(ep, token, "crm.deal.fields.json");
    const dealFields = dealFieldsRes.result || {};
    const dealUfToSpaField: Record<string, string> = {};
    for (const [code, meta] of Object.entries<any>(dealFields)) {
      if (!code.startsWith("UF_CRM_")) continue;
      const label = meta?.formLabel || meta?.title || meta?.listLabel || "";
      const spaLogicalCode = LABEL_TO_SPA_CODE[label];
      const spaTarget = spaLogicalCode ? spaCodeToField[spaLogicalCode] : null;
      if (spaTarget) dealUfToSpaField[code] = spaTarget;
    }

    // 2) Mapa de etapas: deal cat 25 -> SPA stage
    const dealStagesRes = await bx(ep, token, "crm.dealcategory.stage.list", { id: SOURCE_CATEGORY_ID });
    const dealStages = dealStagesRes.result || [];
    const spaStagesRes = await bx(ep, token, "crm.status.list", {
      filter: { ENTITY_ID: `DYNAMIC_${TARGET_ENTITY_TYPE_ID}_STAGE_0` }
    });
    const spaStages = spaStagesRes.result || [];
    const stageMap: Record<string, string> = {};
    for (const ds of dealStages) {
      const match = spaStages.find((ss: any) => normalize(ss.NAME) === normalize(ds.NAME));
      if (match) stageMap[ds.STATUS_ID] = match.STATUS_ID;
    }
    // Fallback: primeira etapa da SPA
    const defaultSpaStage = spaStages[0]?.STATUS_ID || `DYNAMIC_${TARGET_ENTITY_TYPE_ID}_STAGE_0:NEW`;

    // 3) Buscar deals da categoria 25, paginado
    const allDeals: any[] = [];
    let start: any = offset || 0;
    let pages = 0;
    const maxPages = limitParam > 0 ? Math.ceil(limitParam / 50) : 50;
    while (pages < maxPages) {
      const r = await bx(ep, token, "crm.deal.list", {
        filter: { CATEGORY_ID: SOURCE_CATEGORY_ID },
        select: ["*", "UF_*"],
        order: { ID: "ASC" },
        start,
      });
      if (r.error) throw new Error(`crm.deal.list: ${r.error_description}`);
      const items = r.result || [];
      allDeals.push(...items);
      if (limitParam > 0 && allDeals.length >= limitParam) {
        allDeals.length = limitParam;
        break;
      }
      if (typeof r.next === "undefined" || items.length === 0) break;
      start = r.next;
      pages++;
    }

    // 4) Para cada deal: gerar payload + criar (se execute) + atualizar deal
    const logRows: any[] = [];
    let successCount = 0, failCount = 0, skipCount = 0;

    for (const deal of allDeals) {
      // Skip se já tem REVERSE_LINK_FIELD preenchido
      if (deal[REVERSE_LINK_FIELD] && String(deal[REVERSE_LINK_FIELD]).trim() !== "") {
        skipCount++;
        logRows.push({
          session_id: sessionId, deal_id: String(deal.ID), spa_item_id: String(deal[REVERSE_LINK_FIELD]),
          source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
          source_stage_id: deal.STAGE_ID, target_stage_id: null,
          deal_title: deal.TITLE, status: "skipped", error_message: "Já migrado",
          mode, payload: null,
        });
        continue;
      }

      const targetStage = stageMap[deal.STAGE_ID] || defaultSpaStage;
      const item: Record<string, any> = {
        title: deal.TITLE || `Migrado do Deal #${deal.ID}`,
        stageId: targetStage,
        opportunity: deal.OPPORTUNITY ? parseFloat(deal.OPPORTUNITY) : undefined,
        currencyId: deal.CURRENCY_ID || "EUR",
        contactId: deal.CONTACT_ID || undefined,
        companyId: deal.COMPANY_ID || undefined,
        assignedById: deal.ASSIGNED_BY_ID || undefined,
      };

      const dealOrigemIdField = spaCodeToField.DEAL_ORIGEM_ID;
      const dealOrigemUrlField = spaCodeToField.DEAL_ORIGEM_URL;
      if (dealOrigemIdField) item[dealOrigemIdField] = parseInt(deal.ID);
      if (dealOrigemUrlField) item[dealOrigemUrlField] = `${ep.replace(/\/rest\/$/, "")}/crm/deal/details/${deal.ID}/`;

      // Copiar UFs mapeados que tenham valor
      for (const [dealUf, spaField] of Object.entries(dealUfToSpaField)) {
        const v = deal[dealUf];
        if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          item[spaField] = v;
        }
      }

      if (mode === "dry_run") {
        logRows.push({
          session_id: sessionId, deal_id: String(deal.ID), spa_item_id: null,
          source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
          source_stage_id: deal.STAGE_ID, target_stage_id: targetStage,
          deal_title: deal.TITLE, status: "preview", error_message: null,
          mode, payload: item,
        });
        successCount++;
        continue;
      }

      // EXECUTE
      const createRes = await bx(ep, token, "crm.item.add.json", {
        entityTypeId: TARGET_ENTITY_TYPE_ID, fields: item,
      });

      if (createRes.error || !createRes.result?.item?.id) {
        failCount++;
        logRows.push({
          session_id: sessionId, deal_id: String(deal.ID), spa_item_id: null,
          source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
          source_stage_id: deal.STAGE_ID, target_stage_id: targetStage,
          deal_title: deal.TITLE, status: "failed",
          error_message: createRes.error_description || createRes.error || "Sem ID retornado",
          mode, payload: item,
        });
        continue;
      }

      const newId = String(createRes.result.item.id);

      // Atualizar deal com link reverso
      const updRes = await bx(ep, token, "crm.deal.update.json", {
        id: deal.ID,
        fields: { [REVERSE_LINK_FIELD]: newId },
      });

      if (updRes.error) {
        // SPA criada mas update falhou - log com warning
        logRows.push({
          session_id: sessionId, deal_id: String(deal.ID), spa_item_id: newId,
          source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
          source_stage_id: deal.STAGE_ID, target_stage_id: targetStage,
          deal_title: deal.TITLE, status: "success",
          error_message: `SPA criada (${newId}) mas falha ao gravar link reverso: ${updRes.error_description || updRes.error}`,
          mode, payload: item,
        });
      } else {
        logRows.push({
          session_id: sessionId, deal_id: String(deal.ID), spa_item_id: newId,
          source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
          source_stage_id: deal.STAGE_ID, target_stage_id: targetStage,
          deal_title: deal.TITLE, status: "success", error_message: null,
          mode, payload: item,
        });
      }
      successCount++;
    }

    // Persistir log em batch (chunks de 500)
    for (let i = 0; i < logRows.length; i += 500) {
      const chunk = logRows.slice(i, i + 500);
      const { error } = await supabase.from("spa_migration_log").insert(chunk);
      if (error) console.error("[migrate] log insert error:", error);
    }

    return new Response(JSON.stringify({
      success: true, mode, session_id: sessionId,
      total_processed: allDeals.length,
      success_count: successCount,
      failed_count: failCount,
      skipped_count: skipCount,
      stage_map: stageMap,
      mapped_uf_fields: Object.entries(dealUfToSpaField).map(([dealField, spaField]) => `${dealField} -> ${spaField}`),
      spa_field_map: spaCodeToField,
      sample: logRows.slice(0, 5),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});

  } catch (e) {
    console.error("[migrate-deals-to-spa]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
