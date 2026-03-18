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

    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch {}
    }

    const memberId = memberIdParam || body.member_id;
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
    const accessToken = integration.access_token;

    if (!endpoint || !accessToken) {
      return new Response(JSON.stringify({ error: "Missing Bitrix24 credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: paginated fetch of all deals in Pipeline 15
    async function fetchAllDeals(): Promise<any[]> {
      const allDeals: any[] = [];
      let start = 0;
      while (true) {
        const res = await fetch(`${endpoint}crm.deal.list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auth: accessToken,
            filter: { CATEGORY_ID: "15" },
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

    // Helper: call Bitrix API
    async function bitrixCall(method: string, params: Record<string, any>) {
      const res = await fetch(`${endpoint}${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: accessToken, ...params }),
      });
      return res.json();
    }

    // ==================== SCAN ====================
    if (action === "scan") {
      console.log("[cleanup] Scanning Pipeline 15 for duplicates...");
      const allDeals = await fetchAllDeals();
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
        payload: { total_deals: allDeals.length, duplicate_groups: duplicateGroups.length },
      });

      return new Response(JSON.stringify({
        success: true,
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
      console.log("[cleanup] Fixing stages in Pipeline 15...");
      const allDeals = await fetchAllDeals();

      // Get all bitrix24_deal_ids from financial_records
      const dealIds = allDeals.map(d => d.ID);
      const { data: records } = await supabase
        .from("financial_records")
        .select("bitrix24_deal_id, status, due_date, paid_at")
        .in("bitrix24_deal_id", dealIds);

      // Group records by deal
      const recordsByDeal: Record<string, any[]> = {};
      for (const r of (records || [])) {
        if (!r.bitrix24_deal_id) continue;
        if (!recordsByDeal[r.bitrix24_deal_id]) recordsByDeal[r.bitrix24_deal_id] = [];
        recordsByDeal[r.bitrix24_deal_id].push(r);
      }

      const now = new Date();
      let corrected = 0;
      let alreadyCorrect = 0;
      let noRecords = 0;
      const corrections: any[] = [];

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
          correctStage = "C15:WON";
        } else if (hasOverdue) {
          correctStage = "C15:UC_S7RLFB";
        } else {
          correctStage = "C15:NEW";
        }

        if (deal.STAGE_ID === correctStage) {
          alreadyCorrect++;
          continue;
        }

        // Update stage
        const upRes = await bitrixCall("crm.deal.update", {
          id: deal.ID,
          fields: { STAGE_ID: correctStage },
        });

        if (!upRes.error) {
          corrected++;
          corrections.push({
            deal_id: deal.ID,
            title: deal.TITLE,
            from: deal.STAGE_ID,
            to: correctStage,
          });
        } else {
          corrections.push({
            deal_id: deal.ID,
            title: deal.TITLE,
            from: deal.STAGE_ID,
            to: correctStage,
            error: upRes.error,
          });
        }
      }

      // Log
      await supabase.from("bitrix24_debug_logs").insert({
        integration_id: integration.id,
        event_type: "cleanup_fix_stages",
        direction: "outbound",
        payload: { total: allDeals.length, corrected, alreadyCorrect, noRecords },
      });

      return new Response(JSON.stringify({
        success: true,
        total_deals: allDeals.length,
        corrected,
        already_correct: alreadyCorrect,
        no_records: noRecords,
        corrections,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: scan, merge, fix_stages" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[cleanup] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
