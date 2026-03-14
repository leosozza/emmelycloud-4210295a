import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposal_id, accept_token } = await req.json();
    if (!proposal_id && !accept_token) throw new Error("proposal_id or accept_token required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get client IP and user-agent
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Find proposal
    let query = supabase.from("proposals").select("*");
    if (accept_token) {
      query = query.eq("accept_token", accept_token);
    } else {
      query = query.eq("id", proposal_id);
    }
    const { data: proposal, error: findErr } = await query.single();
    if (findErr || !proposal) throw new Error("Proposta não encontrada");

    // Validate status
    if (proposal.status === "aceita") {
      return new Response(JSON.stringify({ success: true, already_accepted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (proposal.status === "recusada") throw new Error("Proposta já foi recusada");
    if (proposal.status === "expirada") throw new Error("Proposta expirada");
    if (proposal.valid_until && new Date(proposal.valid_until) < new Date()) {
      // Auto-expire
      await supabase.from("proposals").update({ status: "expirada" }).eq("id", proposal.id);
      throw new Error("Proposta expirada");
    }

    // 1. Update proposal status with legal evidence
    const { error: upErr } = await supabase.from("proposals").update({
      status: "aceita",
      accepted_at: new Date().toISOString(),
      accepted_ip: clientIp,
      accepted_user_agent: userAgent,
    }).eq("id", proposal.id);
    if (upErr) throw upErr;

    // 2. Create contract
    const { error: contractErr } = await supabase.from("contracts").insert({
      proposal_id: proposal.id,
      case_id: proposal.case_id,
    });
    if (contractErr) console.error("[PROPOSAL-ACCEPT] Contract creation error:", contractErr);

    // 3. Update lead funnel stage
    const { data: caseData } = await supabase
      .from("cases")
      .select("lead_id")
      .eq("id", proposal.case_id)
      .single();

    if (caseData?.lead_id) {
      await supabase
        .from("leads")
        .update({ funnel_stage: "contrato" })
        .eq("id", caseData.lead_id);
    }

    // 4. Notify responsible users (admins + advogados)
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "advogado"]);

      if (roles?.length) {
        const notifications = roles.map((r: any) => ({
          user_id: r.user_id,
          type: "proposal",
          title: "Proposta Aceita",
          message: `O cliente ${escapeHtml(proposal.client_name || "N/A")} aceitou a proposta "${escapeHtml(proposal.title)}".`,
          entity_type: "proposal",
          entity_id: proposal.id,
        }));
        await supabase.from("notifications").insert(notifications);
      }
    } catch (notifErr) {
      console.error("[PROPOSAL-ACCEPT] Notification error:", notifErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
