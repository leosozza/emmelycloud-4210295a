import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Frame-Options": "ALLOWALL",
  "Content-Security-Policy": "frame-ancestors *",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const memberIdParam = url.searchParams.get("member_id");
    const categoryIdParam = url.searchParams.get("category_id");

    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch {}
    }

    const memberId = memberIdParam || body.member_id;
    const categoryId = categoryIdParam || body.category_id || "15";

    if (!memberId) {
      return new Response(JSON.stringify({ error: "member_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch integration
    const { data: integration, error: intErr } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .eq("member_id", memberId)
      .single();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endpoint = integration.client_endpoint;
    let accessToken = integration.access_token;

    if (!endpoint || !accessToken) {
      return new Response(JSON.stringify({ error: "Missing Bitrix24 credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure valid token (refresh if expired)
    async function ensureValidToken(): Promise<string> {
      const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null;
      if (expiresAt && expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
        return accessToken;
      }
      const clientId = Deno.env.get("BITRIX24_CLIENT_ID");
      const clientSecret = Deno.env.get("BITRIX24_CLIENT_SECRET");
      if (!clientId || !clientSecret || !integration.refresh_token) {
        throw new Error("Cannot refresh token: missing credentials");
      }
      const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: integration.refresh_token,
        }),
      });
      const data = await res.json();
      if (data.error || !data.access_token) {
        throw new Error(`Token refresh failed: ${data.error || "unknown"}`);
      }
      await supabase.from("bitrix24_integrations").update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
      }).eq("id", integration.id);
      accessToken = data.access_token;
      console.log("[cleanup] Token refreshed successfully");
      return data.access_token;
    }

    // Refresh token before proceeding
    accessToken = await ensureValidToken();

    // Helper: call Bitrix API
    async function bitrixCall(method: string, params: Record<string, any>) {
      const res = await fetch(`${endpoint}${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: accessToken, ...params }),
      });
      return res.json();
    }

    // Helper: paginated fetch of all deals in a given pipeline
    async function fetchAllDeals(catId: string): Promise<any[]> {
      const allDeals: any[] = [];
      let start = 0;
      while (true) {
        const res = await fetch(`${endpoint}crm.deal.list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auth: accessToken,
            filter: { CATEGORY_ID: catId },
            select: [
              "ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "CONTACT_ID",
              "STAGE_ID", "DATE_CREATE", "ASSIGNED_BY_ID",
              "UF_CRM_1768312831", "UF_CRM_1733687549802",
            ],
            order: { DATE_CREATE: "ASC" },
            start,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(`Bitrix API error: ${data.error}`);
        const deals = data.result || [];
        allDeals.push(...deals);
        if (!data.next) break;
        start = data.next;
      }
      return allDeals;
    }

    // Helper: paginated fetch of financial_records for deal IDs
    async function fetchAllFinancialRecords(dealIds: string[]) {
      const allRecords: any[] = [];
      const batchSize = 200;
      for (let i = 0; i < dealIds.length; i += batchSize) {
        const batch = dealIds.slice(i, i + batchSize);
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase
            .from("financial_records")
            .select("bitrix24_deal_id, status, due_date, paid_at")
            .in("bitrix24_deal_id", batch)
            .range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          allRecords.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }
      return allRecords;
    }

    // ==================== LIST PIPELINES ====================
    if (action === "list_pipelines") {
      console.log("[cleanup] Listing pipelines...");

      // Fetch all deal categories (pipelines)
      const catRes = await bitrixCall("crm.dealcategory.list", {});
      const categories = catRes.result || [];

      // Add default pipeline (ID 0)
      const pipelines: any[] = [{ ID: "0", NAME: "Pipeline Geral (Padrão)" }];
      for (const cat of categories) {
        pipelines.push({ ID: String(cat.ID), NAME: cat.NAME });
      }

      // Fetch stages and deal counts for each pipeline
      const result: any[] = [];
      for (const pipeline of pipelines) {
        // Get stages
        const stagesRes = await bitrixCall("crm.dealcategory.stage.list", {
          id: pipeline.ID,
        });
        const stages = (stagesRes.result || []).map((s: any) => ({
          STATUS_ID: s.STATUS_ID,
          NAME: s.NAME,
          SORT: s.SORT,
          SEMANTICS: s.SEMANTICS || null,
        }));

        // Get deal count
        const countRes = await bitrixCall("crm.deal.list", {
          filter: { CATEGORY_ID: pipeline.ID },
          select: ["ID"],
          start: 0,
        });
        const totalDeals = countRes.total || 0;

        result.push({
          id: pipeline.ID,
          name: pipeline.NAME,
          total_deals: totalDeals,
          stages,
        });
      }

      return new Response(JSON.stringify({ success: true, pipelines: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== SCAN ====================
    if (action === "scan") {
      console.log(`[cleanup] Scanning Pipeline ${categoryId} for duplicates...`);
      const allDeals = await fetchAllDeals(categoryId);
      console.log(`[cleanup] Found ${allDeals.length} total deals`);

      // Group by Access ID
      const groups: Record<string, any[]> = {};
      for (const deal of allDeals) {
        const accessId = deal.UF_CRM_1768312831 || "";
        const nif = deal.UF_CRM_1733687549802 || "";
        const key = accessId || nif || `contact_${deal.CONTACT_ID || "none"}_${deal.TITLE}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(deal);
      }

      // Only return groups with duplicates
      const duplicateGroups = Object.entries(groups)
        .filter(([_, deals]) => deals.length > 1)
        .map(([key, deals]) => ({
          key,
          access_id: deals[0].UF_CRM_1768312831 || null,
          nif: deals[0].UF_CRM_1733687549802 || null,
          deals: deals.map(d => ({
            id: d.ID,
            title: d.TITLE,
            opportunity: parseFloat(d.OPPORTUNITY) || 0,
            stage_id: d.STAGE_ID,
            contact_id: d.CONTACT_ID,
            date_create: d.DATE_CREATE,
            assigned_by_id: d.ASSIGNED_BY_ID,
          })),
        }));

      // Log
      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration.id,
        event_type: "cleanup_scan",
        direction: "internal",
        payload: { category_id: categoryId, total_deals: allDeals.length, duplicate_groups: duplicateGroups.length },
      });

      return new Response(JSON.stringify({
        success: true,
        category_id: categoryId,
        total_deals: allDeals.length,
        duplicate_groups: duplicateGroups,
        unique_deals: Object.values(groups).filter(g => g.length === 1).length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ==================== MERGE ====================
    if (action === "merge") {
      const { keep_id, delete_ids } = body;
      if (!keep_id || !delete_ids || !Array.isArray(delete_ids) || delete_ids.length === 0) {
        return new Response(JSON.stringify({ error: "keep_id and delete_ids[] required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[cleanup] Merging: keep=${keep_id}, delete=${delete_ids.join(",")}`);
      const results: any[] = [];

      for (const delId of delete_ids) {
        // 1. Transfer activities
        try {
          const actRes = await bitrixCall("crm.activity.list", {
            filter: { OWNER_TYPE_ID: 2, OWNER_ID: delId },
            select: ["ID"],
          });
          const activities = actRes.result || [];
          for (const act of activities) {
            await bitrixCall("crm.activity.update", {
              id: act.ID,
              fields: { OWNER_ID: keep_id },
            });
          }
          console.log(`[cleanup] Transferred ${activities.length} activities from deal ${delId} to ${keep_id}`);
        } catch (e) {
          console.error(`[cleanup] Activity transfer error for deal ${delId}:`, e);
        }

        // 2. Update local financial_records
        const { data: updated, error: upErr } = await supabase
          .from("financial_records")
          .update({ bitrix24_deal_id: keep_id })
          .eq("bitrix24_deal_id", delId)
          .select("id");

        const updatedCount = updated?.length || 0;
        if (upErr) console.error(`[cleanup] DB update error:`, upErr);

        // 3. Delete duplicate deal
        const delRes = await bitrixCall("crm.deal.delete", { id: delId });
        const deleted = !delRes.error;

        results.push({
          deal_id: delId,
          activities_transferred: true,
          financial_records_updated: updatedCount,
          deleted,
          error: delRes.error || null,
        });
      }

      // Log
      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration.id,
        event_type: "cleanup_merge",
        direction: "outbound",
        payload: { keep_id, delete_ids, results },
      });

      return new Response(JSON.stringify({ success: true, keep_id, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== FIX STAGES ====================
    if (action === "fix_stages") {
      const overdueStage = body.overdue_stage || url.searchParams.get("overdue_stage");
      const wonStage = body.won_stage || url.searchParams.get("won_stage");
      const newStage = body.new_stage || url.searchParams.get("new_stage");

      console.log(`[cleanup] Fixing stages in Pipeline ${categoryId}...`);
      const allDeals = await fetchAllDeals(categoryId);

      // If stages not provided, try to resolve dynamically
      let stageWon = wonStage;
      let stageOverdue = overdueStage;
      let stageNew = newStage;

      if (!stageWon || !stageNew) {
        const stagesRes = await bitrixCall("crm.dealcategory.stage.list", { id: categoryId });
        const stages = stagesRes.result || [];
        if (!stageWon) {
          const won = stages.find((s: any) => s.SEMANTICS === "S");
          stageWon = won?.STATUS_ID || `C${categoryId}:WON`;
        }
        if (!stageNew) {
          const first = stages.find((s: any) => s.SEMANTICS === "P" || !s.SEMANTICS);
          stageNew = first?.STATUS_ID || `C${categoryId}:NEW`;
        }
      }

      // Get all financial records (paginated)
      const dealIds = allDeals.map(d => d.ID);
      const allRecords = await fetchAllFinancialRecords(dealIds);
      console.log(`[cleanup] Fetched ${allRecords.length} financial records for ${dealIds.length} deals`);

      // Group records by deal
      const recordsByDeal: Record<string, any[]> = {};
      for (const r of allRecords) {
        if (!r.bitrix24_deal_id) continue;
        if (!recordsByDeal[r.bitrix24_deal_id]) recordsByDeal[r.bitrix24_deal_id] = [];
        recordsByDeal[r.bitrix24_deal_id].push(r);
      }

      const now = new Date();
      let corrected = 0;
      let alreadyCorrect = 0;
      let noRecords = 0;
      const corrections: any[] = [];

      // Build list of deals that need stage changes
      const pendingUpdates: { deal: any; correctStage: string }[] = [];

      for (const deal of allDeals) {
        const recs = recordsByDeal[deal.ID] || [];
        if (recs.length === 0) {
          noRecords++;
          continue;
        }

        const allPaid = recs.every(r => r.status === "paga");
        const hasOverdue = recs.some(r => r.status !== "paga" && r.due_date && new Date(r.due_date) < now);

        let correctStage: string;
        if (allPaid) {
          correctStage = stageWon!;
        } else if (hasOverdue && stageOverdue) {
          correctStage = stageOverdue;
        } else if (hasOverdue) {
          correctStage = stageNew!;
        } else {
          correctStage = stageNew!;
        }

        if (deal.STAGE_ID === correctStage) {
          alreadyCorrect++;
          continue;
        }

        pendingUpdates.push({ deal, correctStage });
      }

      console.log(`[cleanup] ${pendingUpdates.length} deals need stage update, ${alreadyCorrect} already correct, ${noRecords} no records`);

      // Process updates using Bitrix24 batch API (50 commands per batch)
      const BATCH_SIZE = 50;
      for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
        const batch = pendingUpdates.slice(i, i + BATCH_SIZE);
        const cmd: Record<string, string> = {};
        for (let j = 0; j < batch.length; j++) {
          const { deal, correctStage } = batch[j];
          cmd[`update_${j}`] = `crm.deal.update?id=${deal.ID}&fields[STAGE_ID]=${encodeURIComponent(correctStage)}`;
        }

        const batchRes = await fetch(`${endpoint}batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auth: accessToken, halt: 0, cmd }),
        });
        const batchData = await batchRes.json();
        const results = batchData.result?.result || {};
        const errors = batchData.result?.result_error || {};

        for (let j = 0; j < batch.length; j++) {
          const { deal, correctStage } = batch[j];
          const key = `update_${j}`;
          if (errors[key]) {
            corrections.push({
              deal_id: deal.ID,
              title: deal.TITLE,
              from: deal.STAGE_ID,
              to: correctStage,
              error: errors[key],
            });
          } else {
            corrected++;
            corrections.push({
              deal_id: deal.ID,
              title: deal.TITLE,
              from: deal.STAGE_ID,
              to: correctStage,
            });
          }
        }

        console.log(`[cleanup] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pendingUpdates.length / BATCH_SIZE)} processed`);
      }

      // Log
      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration.id,
        event_type: "cleanup_fix_stages",
        direction: "outbound",
        payload: { category_id: categoryId, total: allDeals.length, corrected, alreadyCorrect, noRecords, records_fetched: allRecords.length },
      });

      return new Response(JSON.stringify({
        success: true,
        category_id: categoryId,
        total_deals: allDeals.length,
        records_fetched: allRecords.length,
        corrected,
        already_correct: alreadyCorrect,
        no_records: noRecords,
        corrections,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: list_pipelines, scan, merge, fix_stages" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[cleanup] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
