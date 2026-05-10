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

// Map por LABEL (mais robusto que UF code, que muda por instalação)
const LABEL_TO_SPA_FIELD: Record<string, string> = {
  "Número do processo": "ufCrm_NUMERO_PROCESSO",
  "URL do Processo": "ufCrm_URL_PROCESSO",
  " URL do Processo": "ufCrm_URL_PROCESSO",
  "Valor da condenação": "ufCrm_VALOR_CONDENACAO",
  " Valor da condenação": "ufCrm_VALOR_CONDENACAO",
  "Parte contrária": "ufCrm_PARTE_CONTRARIA",
  "Parte contrária:": "ufCrm_PARTE_CONTRARIA",
  "Parte contraria (Texto)": "ufCrm_PARTE_CONTRARIA_TEXTO",
  " Cliente (Texto)": "ufCrm_CLIENTE_TEXTO",
  "Cliente (Texto)": "ufCrm_CLIENTE_TEXTO",
  "Responsável (Texto)": "ufCrm_RESPONSAVEL_TEXTO",
  "Tipo de prazo:": "ufCrm_TIPO_PRAZO",
  "Prazo fatal:": "ufCrm_PRAZO_FATAL",
  "Prazo da atividade:": "ufCrm_PRAZO_ATIVIDADE",
  "Descrição do prazo:": "ufCrm_DESCRICAO_PRAZO",
  "Tipo de audiência:": "ufCrm_TIPO_AUDIENCIA",
  "Modalidade:": "ufCrm_MODALIDADE",
  "Data/Hora da audiência:": "ufCrm_DATA_HORA_AUDIENCIA",
  "Link/Local de audiência:": "ufCrm_LINK_LOCAL_AUDIENCIA",
  "NIF": "ufCrm_NIF",
  "NISS": "ufCrm_NISS",
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

    // 1) Mapas: deal fields (UF -> label) e SPA fields (label -> ufCrm_*)
    const dealFieldsRes = await bx(ep, token, "crm.deal.fields.json");
    const dealFields = dealFieldsRes.result || {};
    const dealUfToSpaField: Record<string, string> = {};
    for (const [code, meta] of Object.entries<any>(dealFields)) {
      if (!code.startsWith("UF_CRM_")) continue;
      const label = meta?.formLabel || meta?.title || meta?.listLabel || "";
      const spaTarget = LABEL_TO_SPA_FIELD[label];
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
        ufCrm_DEAL_ORIGEM_ID: parseInt(deal.ID),
        ufCrm_DEAL_ORIGEM_URL: `${ep.replace(/\/rest\/$/, "")}/crm/deal/details/${deal.ID}/`,
      };

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
      mapped_uf_fields: Object.keys(dealUfToSpaField),
      sample: logRows.slice(0, 5),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});

  } catch (e) {
    console.error("[migrate-deals-to-spa]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
