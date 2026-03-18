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
    const memberId = url.searchParams.get("member_id");
    const clientDetailId = url.searchParams.get("client_id");

    if (!memberId) {
      return json({ error: "member_id is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify integration exists
    const { data: integration, error: intErr } = await supabase
      .from("bitrix24_integrations")
      .select("id")
      .eq("member_id", memberId)
      .single();

    if (intErr || !integration) {
      return json({ error: "Integration not found" }, 404);
    }

    // ── MODE: Client detail (lazy-load on expand) ──
    if (clientDetailId) {
      return await handleClientDetail(supabase, clientDetailId);
    }

    // ── MODE: Full portfolio (aggregated, no allRecords) ──
    return await handleFullPortfolio(supabase);
  } catch (error) {
    console.error("[bitrix24-fetch-portfolio] Error:", error);
    return json({ error: String(error) }, 500);
  }
});

async function handleClientDetail(supabase: any, clientId: string) {
  // Fetch leads for this specific client with nested data
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, name, notes, client_id, cases(id, title, contracts(id, status, financial_records(id, description, installment_number, total_installments, installment_value, total_value, status, due_date, paid_at, created_at)))")
    .eq("client_id", clientId)
    .eq("sync_source", "access_import")
    .limit(500);

  if (error) {
    console.error("[detail] leads error:", error);
    return json({ error: "Failed to fetch client detail" }, 500);
  }

  return json({ success: true, leads: leads || [] });
}

async function handleFullPortfolio(supabase: any) {
  // 1. Fetch ALL clients with pagination (bypass 1000 limit)
  const allClients: any[] = [];
  let offset = 0;
  const PAGE_SIZE = 999;
  while (true) {
    const { data: chunk, error } = await supabase
      .from("clients")
      .select("id, name, document_number, notes, id_access, bitrix24_id")
      .not("id_access", "is", null)
      .order("name", { ascending: true })
      .range(offset, offset + PAGE_SIZE);

    if (error) {
      console.error("[portfolio] clients error:", error);
      break;
    }
    if (!chunk || chunk.length === 0) break;
    allClients.push(...chunk);
    if (chunk.length <= PAGE_SIZE) break; // last page
    offset += PAGE_SIZE + 1;
  }

  if (allClients.length === 0) {
    return json({ success: true, clients: [], totals: { value: 0, paid: 0, pending: 0, overdue: 0 } });
  }

  const clientIds = allClients.map((c) => c.id);

  // 2. Fetch ALL leads with pagination in small chunks
  const allLeads: any[] = [];
  const CHUNK_SIZE = 50;
  for (let i = 0; i < clientIds.length; i += CHUNK_SIZE) {
    const idsChunk = clientIds.slice(i, i + CHUNK_SIZE);
    let leadOffset = 0;
    while (true) {
      const { data: leadsPage } = await supabase
        .from("leads")
        .select("id, name, client_id, cases(id, title, contracts(id, financial_records(id, installment_value, status, due_date, bitrix24_deal_id)))")
        .in("client_id", idsChunk)
        .eq("sync_source", "access_import")
        .range(leadOffset, leadOffset + PAGE_SIZE);

      if (!leadsPage || leadsPage.length === 0) break;
      allLeads.push(...leadsPage);
      if (leadsPage.length <= PAGE_SIZE) break;
      leadOffset += PAGE_SIZE + 1;
    }
  }

  // 3. Group leads by client_id and aggregate
  const leadsByClient: Record<string, any[]> = {};
  for (const l of allLeads) {
    if (!leadsByClient[l.client_id]) leadsByClient[l.client_id] = [];
    leadsByClient[l.client_id].push(l);
  }

  const now = new Date();
  let totalValue = 0, totalPaid = 0, totalPending = 0, totalOverdue = 0;

  const result = allClients.map((c) => {
    const cLeads = leadsByClient[c.id] || [];
    let cv = 0, cp = 0, cpn = 0, co = 0;
    let serviceCount = 0;

    let firstDealId: string | null = null;
    for (const lead of cLeads) {
      for (const cas of (lead.cases || [])) {
        serviceCount++;
        for (const contract of (cas.contracts || [])) {
          for (const fr of (contract.financial_records || [])) {
            const val = parseFloat(fr.installment_value) || 0;
            cv += val;
            if (fr.status === "paga") cp += val;
            else if (fr.due_date && new Date(fr.due_date) < now && fr.status !== "paga") co += val;
            else cpn += val;
            if (!firstDealId && fr.bitrix24_deal_id) firstDealId = fr.bitrix24_deal_id;
          }
        }
      }
    }

    totalValue += cv;
    totalPaid += cp;
    totalPending += cpn;
    totalOverdue += co;

    return {
      client: { id: c.id, name: c.name, document_number: c.document_number, bitrix24_id: c.bitrix24_id },
      accessId: c.id_access || null,
      totalValue: cv,
      totalPaid: cp,
      totalPending: cpn,
      totalOverdue: co,
      serviceCount: serviceCount || cLeads.length,
    };
  });

  return json({
    success: true,
    clients: result,
    totals: { value: totalValue, paid: totalPaid, pending: totalPending, overdue: totalOverdue },
    meta: { clientCount: allClients.length, leadCount: allLeads.length },
  });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
