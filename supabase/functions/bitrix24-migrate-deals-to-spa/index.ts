import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

const SOURCE_CATEGORY_ID = 25;
const TARGET_ENTITY_TYPE_ID = 1118;
const REVERSE_LINK_FIELD = "UF_CRM_1778431525";

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

const normalize = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")        // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")            // strip punctuation
    .trim()
    .replace(/\s+/g, " ");
const normalizeCode = (s: string) =>
  (s || "").replace(/^ufCrm/i, "").replace(/^UF_CRM_/i, "").replace(/^[0-9]+_?/, "")
    .replace(/[^A-Z0-9]/gi, "").toUpperCase();

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

// Soft time budget per invocation. After this, break loop and self-invoke
// to continue. Set well below the 150s edge IDLE_TIMEOUT.
const TIME_BUDGET_MS = 110_000;
const FIX_STAGE_TIME_BUDGET_MS = 60_000;
const FIX_STAGE_BATCH_SIZE = 15;

async function selfInvokeContinue(sessionId: string, limitParam: number, mode: "execute" | "fix_stages" = "execute") {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bitrix24-migrate-deals-to-spa?mode=${mode}&continue_session=${sessionId}${limitParam > 0 ? `&limit=${limitParam}` : ""}`;
    const request = fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
    }).then((res) => res.text()).catch((e) => console.error("[self-invoke]", e));
    // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
    EdgeRuntime.waitUntil(request);
    console.log(`[self-invoke] chained ${mode} continuation for session=${sessionId}`);
  } catch (e) {
    console.error("[self-invoke] failed", e);
  }
}

async function processMigration(opts: {
  supabase: any;
  ep: string;
  token: string;
  allDeals: any[];
  dealUfToSpaField: Record<string, string>;
  spaCodeToField: Record<string, string>;
  stageMap: Record<string, string>;
  defaultSpaStage: string;
  sessionId: string;
  mode: "dry_run" | "execute";
  limitParam?: number;
}): Promise<{ processed: number; remaining: number; chained: boolean }> {
  const { supabase, ep, token, allDeals, dealUfToSpaField, spaCodeToField, stageMap, defaultSpaStage, sessionId, mode, limitParam = 0 } = opts;
  const logBuffer: any[] = [];
  const startedAt = Date.now();
  let processedCount = 0;
  let timedOut = false;

  const flush = async () => {
    if (logBuffer.length === 0) return;
    const chunk = logBuffer.splice(0, logBuffer.length);
    const { error } = await supabase.from("spa_migration_log").insert(chunk);
    if (error) console.error("[migrate] log insert error:", error);
  };

  for (const deal of allDeals) {
    // Time budget check — break early to allow self-invoke continuation
    if (mode === "execute" && Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      console.log(`[migrate] time budget hit after ${processedCount} deals; will self-invoke`);
      break;
    }

    if (deal[REVERSE_LINK_FIELD] && String(deal[REVERSE_LINK_FIELD]).trim() !== "") {
      logBuffer.push({
        session_id: sessionId, deal_id: String(deal.ID), spa_item_id: String(deal[REVERSE_LINK_FIELD]),
        source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
        source_stage_id: deal.STAGE_ID, target_stage_id: null,
        deal_title: deal.TITLE, status: "skipped", error_message: "Já migrado",
        mode, payload: null,
      });
    } else {
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
      // Resolve campo do deal de origem — aceita várias variações
      const dealOrigemIdField = spaCodeToField.DEAL_ORIGEM_ID || spaCodeToField.DEAL || spaCodeToField.DEAL_ID || spaCodeToField.DEALID;
      const dealOrigemUrlField = spaCodeToField.DEAL_ORIGEM_URL || spaCodeToField.DEAL_URL || spaCodeToField.URL_DEAL;
      if (dealOrigemIdField) item[dealOrigemIdField] = String(deal.ID);
      if (dealOrigemUrlField) item[dealOrigemUrlField] = `${ep.replace(/\/rest\/$/, "")}/crm/deal/details/${deal.ID}/`;
      for (const [dealUf, spaField] of Object.entries(dealUfToSpaField)) {
        const v = deal[dealUf];
        if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          item[spaField] = v;
        }
      }

      if (mode === "dry_run") {
        logBuffer.push({
          session_id: sessionId, deal_id: String(deal.ID), spa_item_id: null,
          source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
          source_stage_id: deal.STAGE_ID, target_stage_id: targetStage,
          deal_title: deal.TITLE, status: "preview", error_message: null,
          mode, payload: item,
        });
      } else {
        const createRes = await bx(ep, token, "crm.item.add.json", {
          entityTypeId: TARGET_ENTITY_TYPE_ID, fields: item,
        });
        if (createRes.error || !createRes.result?.item?.id) {
          logBuffer.push({
            session_id: sessionId, deal_id: String(deal.ID), spa_item_id: null,
            source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
            source_stage_id: deal.STAGE_ID, target_stage_id: targetStage,
            deal_title: deal.TITLE, status: "failed",
            error_message: createRes.error_description || createRes.error || "Sem ID retornado",
            mode, payload: item,
          });
        } else {
          const newId = String(createRes.result.item.id);
          const updRes = await bx(ep, token, "crm.deal.update.json", {
            id: deal.ID, fields: { [REVERSE_LINK_FIELD]: newId },
          });
          logBuffer.push({
            session_id: sessionId, deal_id: String(deal.ID), spa_item_id: newId,
            source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
            source_stage_id: deal.STAGE_ID, target_stage_id: targetStage,
            deal_title: deal.TITLE, status: "success",
            error_message: updRes.error
              ? `SPA criada (${newId}) mas falha link reverso: ${updRes.error_description || updRes.error}`
              : null,
            mode, payload: item,
          });
        }
      }
    }

    processedCount++;
    if (logBuffer.length >= 50) await flush();
  }

  await flush();

  // If we ran out of time, chain a self-invoke. The next invocation will
  // re-fetch the deal list; deals already migrated will be naturally skipped
  // because their REVERSE_LINK_FIELD is now populated. No duplicates.
  let chained = false;
  if (timedOut && mode === "execute") {
    await selfInvokeContinue(sessionId, limitParam);
    chained = true;
  }

  return { processed: processedCount, remaining: allDeals.length - processedCount, chained };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "dry_run") as "dry_run" | "execute" | "status" | "backfill" | "fix_stages";
    const limitParam = parseInt(url.searchParams.get("limit") || "0");
    const sessionIdParam = url.searchParams.get("session_id");
    const continueSession = url.searchParams.get("continue_session");

    // STATUS endpoint: poll spa_migration_log counts
    if (mode === "status") {
      if (!sessionIdParam) return json({ error: "session_id required" }, 400);
      const { data, error } = await supabase
        .from("spa_migration_log")
        .select("status,payload,spa_item_id")
        .eq("session_id", sessionIdParam);
      if (error) return json({ error: error.message }, 500);
      const counts = { success: 0, failed: 0, skipped: 0, preview: 0 };
      let processed = 0;
      let done = false;
      let totalProcessed: number | null = null;
      for (const r of data || []) {
        if (r.payload?.done === true) {
          done = true;
          totalProcessed = Number(r.payload?.processed_total || 0) || null;
          continue;
        }
        processed++;
        counts[r.status as keyof typeof counts] = (counts[r.status as keyof typeof counts] || 0) + 1;
      }
      return json({ success: true, session_id: sessionIdParam, processed, total_processed: totalProcessed ?? processed, done, counts });
    }

    // BACKFILL endpoint: percorre deals do pipeline 25 que já têm UF_CRM_1778431525
    // preenchido (link reverso) e atualiza o item da SPA setando o campo DEAL com o ID do deal.
    if (mode === "backfill") {
      const { data: integration } = await supabase
        .from("bitrix24_integrations")
        .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (!integration) return json({ error: "No integration" }, 404);
      const token = await ensureValidToken(supabase, integration);
      const ep = integration.client_endpoint;
      const backfillSession = crypto.randomUUID();

      // Resolve campo DEAL na SPA
      const spaFieldsRes = await bx(ep, token, "crm.item.fields.json", { entityTypeId: TARGET_ENTITY_TYPE_ID });
      const spaFields = spaFieldsRes.result?.fields || spaFieldsRes.result || {};
      const spaCodeToField: Record<string, string> = {};
      for (const [code] of Object.entries<any>(spaFields)) {
        const logical = normalizeCode(code);
        if (logical) spaCodeToField[logical] = code;
      }
      const dealField = spaCodeToField.DEAL_ORIGEM_ID || spaCodeToField.DEAL || spaCodeToField.DEAL_ID || spaCodeToField.DEALID;
      const urlField = spaCodeToField.DEAL_ORIGEM_URL || spaCodeToField.DEAL_URL;
      if (!dealField) return json({ error: "Campo DEAL não encontrado na SPA. Disponíveis: " + Object.keys(spaCodeToField).join(",") }, 400);

      // Buscar deals com link reverso preenchido
      const linked: any[] = [];
      let start: any = 0;
      const maxPages = limitParam > 0 ? Math.ceil(limitParam / 50) : 50;
      let pages = 0;
      while (pages < maxPages) {
        const r = await bx(ep, token, "crm.deal.list", {
          filter: { CATEGORY_ID: SOURCE_CATEGORY_ID, [`!${REVERSE_LINK_FIELD}`]: false },
          select: ["ID", "TITLE", "ASSIGNED_BY_ID", REVERSE_LINK_FIELD],
          order: { ID: "ASC" }, start,
        });
        if (r.error) throw new Error(`crm.deal.list: ${r.error_description}`);
        const items = (r.result || []).filter((d: any) => d[REVERSE_LINK_FIELD] && String(d[REVERSE_LINK_FIELD]).trim() !== "");
        linked.push(...items);
        if (limitParam > 0 && linked.length >= limitParam) { linked.length = limitParam; break; }
        if (typeof r.next === "undefined" || (r.result || []).length === 0) break;
        start = r.next;
        pages++;
      }

      const runBackfill = async () => {
        let success = 0, failed = 0;
        const buf: any[] = [];
        const flush = async () => {
          if (!buf.length) return;
          const c = buf.splice(0, buf.length);
          await supabase.from("spa_migration_log").insert(c);
        };
        for (const d of linked) {
          const spaId = String(d[REVERSE_LINK_FIELD]);
          const fields: Record<string, any> = { [dealField]: String(d.ID) };
          if (urlField) fields[urlField] = `${ep.replace(/\/rest\/$/, "")}/crm/deal/details/${d.ID}/`;
          if (d.ASSIGNED_BY_ID) fields.assignedById = d.ASSIGNED_BY_ID;
          const upd = await bx(ep, token, "crm.item.update.json", {
            entityTypeId: TARGET_ENTITY_TYPE_ID, id: spaId, fields,
          });
          if (upd.error) {
            failed++;
            buf.push({
              session_id: backfillSession, deal_id: String(d.ID), spa_item_id: spaId,
              source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
              source_stage_id: null, target_stage_id: null,
              deal_title: d.TITLE, status: "failed",
              error_message: `backfill: ${upd.error_description || upd.error}`,
              mode: "backfill", payload: fields,
            });
          } else {
            success++;
            buf.push({
              session_id: backfillSession, deal_id: String(d.ID), spa_item_id: spaId,
              source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
              source_stage_id: null, target_stage_id: null,
              deal_title: d.TITLE, status: "success", error_message: null,
              mode: "backfill", payload: fields,
            });
          }
          if (buf.length >= 50) await flush();
        }
        await flush();
        console.log(`[backfill] done. success=${success} failed=${failed}`);
      };

      if (linked.length > 20) {
        // @ts-ignore
        EdgeRuntime.waitUntil(runBackfill().catch(e => console.error("[bg backfill]", e)));
        return json({
          success: true, mode: "backfill", session_id: backfillSession, background: true,
          total_processed: linked.length, success_count: 0, failed_count: 0, skipped_count: 0,
          stage_map: {}, mapped_uf_fields: [`${dealField} <- deal.ID`],
          sample: [], message: `Backfill rodando em background para ${linked.length} items.`,
        });
      }
      await runBackfill();
      return json({
        success: true, mode: "backfill", session_id: backfillSession, background: false,
        total_processed: linked.length, success_count: linked.length, failed_count: 0, skipped_count: 0,
        stage_map: {}, mapped_uf_fields: [`${dealField} <- deal.ID`], sample: [],
      });
    }

    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!integration) return json({ error: "No integration" }, 404);

    const token = await ensureValidToken(supabase, integration);
    const ep = integration.client_endpoint;
    // Reuse session_id when chained (auto-retry continuation) so progress aggregates
    const sessionId = continueSession || crypto.randomUUID();
    if (continueSession) console.log(`[migrate] continuing session=${sessionId}`);

    if (mode === "fix_stages" && !continueSession) {
      await selfInvokeContinue(sessionId, limitParam, "fix_stages");
      return json({
        success: true, mode: "fix_stages", session_id: sessionId, background: true,
        total_processed: 0, success_count: 0, failed_count: 0, skipped_count: 0,
        stage_map: {}, mapped_uf_fields: [], sample: [],
        message: `Correção de etapas iniciada em background. Use mode=status&session_id=${sessionId} para acompanhar.`,
      });
    }

    // Build SPA + deal field maps
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
      const label = fieldLabel(meta);
      const spaLogicalCode = Object.entries(LABEL_TO_SPA_CODE)
        .find(([sourceLabel]) => normalize(sourceLabel) === normalize(label))?.[1];
      const spaTarget = spaLogicalCode ? spaCodeToField[spaLogicalCode] : null;
      if (spaTarget) dealUfToSpaField[code] = spaTarget;
    }

    // Stage mapping
    const dealStageEntityRes = await bx(ep, token, "crm.dealcategory.status.json", { id: SOURCE_CATEGORY_ID });
    const dealStageEntityId = dealStageEntityRes.result || `DEAL_STAGE_${SOURCE_CATEGORY_ID}`;
    let dealStagesRes = await bx(ep, token, "crm.status.list.json", { filter: { ENTITY_ID: dealStageEntityId } });
    let dealStages = dealStagesRes.result || [];
    if (dealStages.length === 0) {
      dealStagesRes = await bx(ep, token, "crm.dealcategory.stage.list.json", { id: SOURCE_CATEGORY_ID });
      dealStages = dealStagesRes.result || [];
    }
    if (dealStages.length === 0) {
      const allStatusesRes = await bx(ep, token, "crm.status.list.json", {});
      dealStages = (allStatusesRes.result || []).filter((s: any) =>
        s.ENTITY_ID === dealStageEntityId || String(s.STATUS_ID || "").startsWith(`C${SOURCE_CATEGORY_ID}:`)
      );
    }
    let spaStages: any[] = [];
    for (const entityId of [`DYNAMIC_${TARGET_ENTITY_TYPE_ID}_STAGE_0`, `DYNAMIC_${TARGET_ENTITY_TYPE_ID}_STAGE`]) {
      const r = await bx(ep, token, "crm.status.list.json", { filter: { ENTITY_ID: entityId } });
      if ((r.result || []).length > 0) { spaStages = r.result; break; }
    }
    if (spaStages.length === 0) {
      const allStatusesRes = await bx(ep, token, "crm.status.list.json", {});
      spaStages = (allStatusesRes.result || []).filter((s: any) =>
        String(s.ENTITY_ID || "").startsWith(`DYNAMIC_${TARGET_ENTITY_TYPE_ID}_STAGE`) ||
        String(s.STATUS_ID || "").startsWith(`DYNAMIC_${TARGET_ENTITY_TYPE_ID}_STAGE`)
      );
    }
    if (spaStages.length === 0 && spaFields.stageId?.items) {
      spaStages = spaFields.stageId.items.map((item: any) => ({
        STATUS_ID: item.ID || item.STATUS_ID || item.VALUE,
        NAME: item.VALUE || item.NAME || item.TITLE,
      }));
    }
    // Sort both lists by SORT (Bitrix order field) so positional fallback works
    const sortedDealStages = [...dealStages].sort(
      (a: any, b: any) => (parseInt(a.SORT) || 0) - (parseInt(b.SORT) || 0)
    );
    const sortedSpaStages = [...spaStages].sort(
      (a: any, b: any) => (parseInt(a.SORT) || 0) - (parseInt(b.SORT) || 0)
    );

    const stageMap: Record<string, string> = {};
    const unmatched: any[] = [];
    for (const ds of sortedDealStages) {
      const match = sortedSpaStages.find((ss: any) => normalize(ss.NAME) === normalize(ds.NAME));
      if (match) {
        stageMap[ds.STATUS_ID] = match.STATUS_ID;
      } else {
        unmatched.push(ds);
      }
    }

    // Positional fallback: para cada deal-stage não casado por nome, usa SPA stage no mesmo índice
    const usedSpaIds = new Set(Object.values(stageMap));
    for (const ds of unmatched) {
      const dsIdx = sortedDealStages.findIndex((x: any) => x.STATUS_ID === ds.STATUS_ID);
      const candidate = sortedSpaStages[dsIdx];
      if (candidate && !usedSpaIds.has(candidate.STATUS_ID)) {
        stageMap[ds.STATUS_ID] = candidate.STATUS_ID;
        usedSpaIds.add(candidate.STATUS_ID);
        console.log(`[stage-fallback] ${ds.STATUS_ID} (${ds.NAME}) -> ${candidate.STATUS_ID} (${candidate.NAME}) by index ${dsIdx}`);
      } else {
        console.warn(`[stage-unmatched] ${ds.STATUS_ID} (${ds.NAME}) — sem destino na SPA`);
      }
    }

    const defaultSpaStage = sortedSpaStages[0]?.STATUS_ID || `DYNAMIC_${TARGET_ENTITY_TYPE_ID}_STAGE_0:NEW`;

    // FIX_STAGES mode: atualiza stageId dos itens SPA já criados conforme STAGE_ID atual do deal
    if (mode === "fix_stages") {
      const fixSession = sessionId;
      const { data: migrated } = await supabase
        .from("spa_migration_log")
        .select("deal_id, spa_item_id, source_stage_id, created_at")
        .eq("source_category_id", SOURCE_CATEGORY_ID)
        .in("status", ["success", "skipped"])
        .not("spa_item_id", "is", null)
        .order("created_at", { ascending: true });

      const { data: alreadyProcessed } = await supabase
        .from("spa_migration_log")
        .select("spa_item_id")
        .eq("session_id", fixSession)
        .eq("mode", "fix_stages")
        .not("spa_item_id", "is", null);
      const processedSpaIds = new Set((alreadyProcessed || []).map((r: any) => String(r.spa_item_id)));

      const byItem = new Map<string, { deal_id: string; source_stage_id: string }>();
      for (const r of migrated || []) {
        if (r.spa_item_id && !processedSpaIds.has(String(r.spa_item_id))) {
          byItem.set(String(r.spa_item_id), { deal_id: String(r.deal_id), source_stage_id: r.source_stage_id });
        }
      }

      // Re-fetch deals para obter STAGE_ID atual
      const dealById: Record<string, any> = {};
      let s: any = 0;
      for (let p = 0; p < 50; p++) {
        const r = await bx(ep, token, "crm.deal.list", {
          filter: { CATEGORY_ID: SOURCE_CATEGORY_ID },
          select: ["ID", "STAGE_ID"], order: { ID: "ASC" }, start: s,
        });
        for (const d of (r.result || [])) dealById[String(d.ID)] = d;
        if (typeof r.next === "undefined" || (r.result || []).length === 0) break;
        s = r.next;
      }

      let fixed = 0, skipped = 0, failed = 0;
      const sample: any[] = [];
      const fixStartedAt = Date.now();
      const fixLogBuffer: any[] = [];
      const flushFixLogs = async () => {
        if (!fixLogBuffer.length) return;
        const chunk = fixLogBuffer.splice(0, fixLogBuffer.length);
        const { error } = await supabase.from("spa_migration_log").insert(chunk);
        if (error) console.error("[fix_stages] log insert error:", error);
      };
      for (const [spaId, info] of byItem) {
        if ((fixed + skipped + failed) >= FIX_STAGE_BATCH_SIZE || Date.now() - fixStartedAt > FIX_STAGE_TIME_BUDGET_MS) break;
        const currentStageId = dealById[info.deal_id]?.STAGE_ID || info.source_stage_id;
        const targetStage = stageMap[currentStageId];
        if (!targetStage) {
          skipped++;
          fixLogBuffer.push({
            session_id: fixSession, deal_id: String(info.deal_id), spa_item_id: spaId,
            source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
            source_stage_id: currentStageId, target_stage_id: null,
            deal_title: null, status: "skipped", error_message: "Etapa de destino não encontrada",
            mode: "fix_stages", payload: null,
          });
          if (fixLogBuffer.length >= 25) await flushFixLogs();
          continue;
        }
        const upd = await bx(ep, token, "crm.item.update.json", {
          entityTypeId: TARGET_ENTITY_TYPE_ID, id: spaId, fields: { stageId: targetStage },
        });
        if (upd.error) {
          failed++;
          if (sample.length < 5) sample.push({ spaId, error: upd.error_description || upd.error });
          fixLogBuffer.push({
            session_id: fixSession, deal_id: String(info.deal_id), spa_item_id: spaId,
            source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
            source_stage_id: currentStageId, target_stage_id: targetStage,
            deal_title: null, status: "failed", error_message: `fix_stages: ${upd.error_description || upd.error}`,
            mode: "fix_stages", payload: { stageId: targetStage },
          });
        } else {
          fixed++;
          fixLogBuffer.push({
            session_id: fixSession, deal_id: String(info.deal_id), spa_item_id: spaId,
            source_category_id: SOURCE_CATEGORY_ID, target_entity_type_id: TARGET_ENTITY_TYPE_ID,
            source_stage_id: currentStageId, target_stage_id: targetStage,
            deal_title: null, status: "success", error_message: null,
            mode: "fix_stages", payload: { stageId: targetStage },
          });
        }
        if (fixLogBuffer.length >= 25) await flushFixLogs();
      }
      await flushFixLogs();

      const processedNow = fixed + skipped + failed;
      const remaining = Math.max(0, byItem.size - processedNow);
      const shouldContinue = remaining > 0;
      if (shouldContinue) await selfInvokeContinue(fixSession, limitParam, "fix_stages");

      return json({
        success: true, mode: "fix_stages", session_id: fixSession, background: shouldContinue,
        total_processed: processedSpaIds.size + byItem.size,
        success_count: fixed, failed_count: failed, skipped_count: skipped,
        fixed, skipped, failed,
        stage_map: stageMap, unmatched_source_stages: unmatched.map((u: any) => ({ id: u.STATUS_ID, name: u.NAME })),
        mapped_uf_fields: [], sample,
        message: shouldContinue
          ? `Correção de etapas processou ${processedNow}; continuando em background (${remaining} restantes).`
          : `Correção de etapas concluída.`,
      });
    }

    // Fetch deals
    const allDeals: any[] = [];
    let start: any = 0;
    let pages = 0;
    const maxPages = limitParam > 0 ? Math.ceil(limitParam / 50) : 50;
    while (pages < maxPages) {
      const r = await bx(ep, token, "crm.deal.list", {
        filter: { CATEGORY_ID: SOURCE_CATEGORY_ID },
        select: ["*", "UF_*"], order: { ID: "ASC" }, start,
      });
      if (r.error) throw new Error(`crm.deal.list: ${r.error_description}`);
      const items = r.result || [];
      allDeals.push(...items);
      if (limitParam > 0 && allDeals.length >= limitParam) { allDeals.length = limitParam; break; }
      if (typeof r.next === "undefined" || items.length === 0) break;
      start = r.next;
      pages++;
    }

    // Decide background vs sync. Threshold: >20 deals in execute mode runs in background.
    const runInBackground = mode === "execute" && allDeals.length > 20;

    if (runInBackground) {
      // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
      EdgeRuntime.waitUntil(
        processMigration({
          supabase, ep, token, allDeals, dealUfToSpaField, spaCodeToField,
          stageMap, defaultSpaStage, sessionId, mode, limitParam,
        }).catch((e) => console.error("[bg migration]", e))
      );
      return json({
        success: true, mode, session_id: sessionId, background: true,
        total_processed: allDeals.length, success_count: 0, failed_count: 0, skipped_count: 0,
        stage_map: stageMap,
        mapped_uf_fields: Object.entries(dealUfToSpaField).map(([d, s]) => `${d} -> ${s}`),
        sample: [],
        message: `Migração rodando em background. Use mode=status&session_id=${sessionId} para acompanhar.`,
      });
    }

    // Synchronous (dry_run or small execute)
    await processMigration({
      supabase, ep, token, allDeals, dealUfToSpaField, spaCodeToField,
      stageMap, defaultSpaStage, sessionId, mode, limitParam,
    });

    const { data: logRows } = await supabase
      .from("spa_migration_log").select("status,payload,deal_id,spa_item_id")
      .eq("session_id", sessionId);
    const counts = { success: 0, failed: 0, skipped: 0, preview: 0 };
    for (const r of logRows || []) counts[r.status as keyof typeof counts] = (counts[r.status as keyof typeof counts] || 0) + 1;

    return json({
      success: true, mode, session_id: sessionId, background: false,
      total_processed: allDeals.length,
      success_count: counts.success + counts.preview,
      failed_count: counts.failed,
      skipped_count: counts.skipped,
      stage_map: stageMap,
      mapped_uf_fields: Object.entries(dealUfToSpaField).map(([d, s]) => `${d} -> ${s}`),
      sample: (logRows || []).slice(0, 5),
    });

  } catch (e) {
    console.error("[migrate-deals-to-spa]", e);
    return json({ error: String(e) }, 500);
  }
});
