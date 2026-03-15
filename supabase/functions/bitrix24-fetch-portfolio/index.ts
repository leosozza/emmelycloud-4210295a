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

    // Fetch clients imported from Access
    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, name, document_number, notes")
      .ilike("notes", "%Access%")
      .order("name", { ascending: true })
      .limit(2000);

    if (clientsErr || !clients || clients.length === 0) {
      return json({ success: true, clients: [], totals: { value: 0, paid: 0, pending: 0, overdue: 0 } });
    }

    const clientIds = clients.map((c) => c.id);

    // Fetch leads with nested cases -> contracts -> financial_records
    // Batch clientIds in chunks of 200 to avoid URL length limits
    const allLeads: any[] = [];
    for (let i = 0; i < clientIds.length; i += 200) {
      const chunk = clientIds.slice(i, i + 200);
      const { data: leadsChunk } = await supabase
        .from("leads")
        .select("id, name, notes, client_id, cases(id, title, contracts(id, status, financial_records(id, description, installment_number, total_installments, installment_value, total_value, status, due_date, paid_at, created_at)))")
        .in("client_id", chunk)
        .eq("sync_source", "access_import");
      if (leadsChunk) allLeads.push(...leadsChunk);
    }

    // Group leads by client_id
    const leadsByClient: Record<string, any[]> = {};
    for (const l of allLeads) {
      if (!leadsByClient[l.client_id]) leadsByClient[l.client_id] = [];
      leadsByClient[l.client_id].push(l);
    }

    const now = new Date();
    let totalValue = 0, totalPaid = 0, totalPending = 0, totalOverdue = 0;

    const result = clients.map((c) => {
      const cLeads = leadsByClient[c.id] || [];
      let cv = 0, cp = 0, cpn = 0, co = 0;
      const allRecords: any[] = [];

      for (const lead of cLeads) {
        for (const cas of (lead.cases || [])) {
          for (const contract of (cas.contracts || [])) {
            for (const fr of (contract.financial_records || [])) {
              const val = parseFloat(fr.installment_value) || 0;
              cv += val;
              if (fr.status === "paga") cp += val;
              else if (fr.due_date && new Date(fr.due_date) < now && fr.status !== "paga") co += val;
              else cpn += val;
              allRecords.push({ ...fr, caseName: cas.title, leadName: lead.name });
            }
          }
        }
      }

      totalValue += cv;
      totalPaid += cp;
      totalPending += cpn;
      totalOverdue += co;

      // Extract Access ID from notes
      const match = c.notes?.match(/Access \(ID:\s*(\d+)\)/);
      const accessId = match ? match[1] : null;

      return {
        client: c,
        accessId,
        leads: cLeads,
        totalValue: cv,
        totalPaid: cp,
        totalPending: cpn,
        totalOverdue: co,
        serviceCount: cLeads.length,
        allRecords,
      };
    });

    return json({
      success: true,
      clients: result,
      totals: { value: totalValue, paid: totalPaid, pending: totalPending, overdue: totalOverdue },
    });
  } catch (error) {
    console.error("[bitrix24-fetch-portfolio] Error:", error);
    return json({ error: String(error) }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
