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
      await supabase.from("proposals").update({ status: "expirada" }).eq("id", proposal.id);
      throw new Error("Proposta expirada");
    }

    // 1. Update proposal status with legal evidence + contract_status
    const { error: upErr } = await supabase.from("proposals").update({
      status: "aceita",
      accepted_at: new Date().toISOString(),
      accepted_ip: clientIp,
      accepted_user_agent: userAgent,
      contract_status: "pendente",
      sign_token: proposal.sign_token || crypto.randomUUID(),
    }).eq("id", proposal.id);
    if (upErr) throw upErr;

    // 2. Also create a contract record for backward compat
    const { error: contractErr } = await supabase.from("contracts").insert({
      proposal_id: proposal.id,
      case_id: proposal.case_id,
    });
    if (contractErr) console.error("[PROPOSAL-ACCEPT] Contract creation (compat) error:", contractErr);

    // 3. Get case data for lead update and attorney notification
    const { data: caseData } = await supabase
      .from("cases")
      .select("lead_id, assigned_attorney_id")
      .eq("id", proposal.case_id)
      .single();

    // 4. Update lead funnel stage
    if (caseData?.lead_id) {
      await supabase
        .from("leads")
        .update({ funnel_stage: "contrato" })
        .eq("id", caseData.lead_id);
    }

    // 5. Notify assigned attorney specifically + all admins
    try {
      const notifyUserIds = new Set<string>();

      if (caseData?.assigned_attorney_id) {
        const { data: attorneyProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", caseData.assigned_attorney_id)
          .single();
        if (attorneyProfile?.user_id) {
          notifyUserIds.add(attorneyProfile.user_id);
        }
      }

      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminRoles) {
        for (const r of adminRoles) notifyUserIds.add(r.user_id);
      }

      if (notifyUserIds.size > 0) {
        const notifications = Array.from(notifyUserIds).map((uid) => ({
          user_id: uid,
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

    // 6. Attempt to notify client via existing conversation
    try {
      if (caseData?.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("conversation_id")
          .eq("id", caseData.lead_id)
          .single();

        if (lead?.conversation_id) {
          const { data: conv } = await supabase
            .from("conversations")
            .select("id, channel, contact_phone, contact_instagram")
            .eq("id", lead.conversation_id)
            .single();

          if (conv && (conv.channel === "whatsapp" || conv.channel === "instagram")) {
            const confirmMsg = `✅ Obrigado, ${proposal.client_name || ""}! A sua proposta "${proposal.title}" foi aceite com sucesso. Entraremos em contacto brevemente para os próximos passos.`;
            
            try {
              await fetch(`${supabaseUrl}/functions/v1/message-send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  conversation_id: conv.id,
                  content: confirmMsg,
                }),
              });
              console.log(`[PROPOSAL-ACCEPT] Client notified via ${conv.channel}`);
            } catch (sendErr) {
              console.error("[PROPOSAL-ACCEPT] Failed to notify client via channel:", sendErr);
            }
          }
        }
      }
    } catch (clientNotifErr) {
      console.error("[PROPOSAL-ACCEPT] Client notification lookup error:", clientNotifErr);
    }

    // 7. Audit log
    try {
      await supabase.from("bitrix24_debug_logs").insert({
        event_type: "proposal_accepted",
        direction: "inbound",
        payload: {
          proposal_id: proposal.id,
          client_name: proposal.client_name,
          value: proposal.value,
          accepted_ip: clientIp,
          accepted_user_agent: userAgent,
          accepted_at: new Date().toISOString(),
        },
      });
    } catch (logErr) {
      console.error("[PROPOSAL-ACCEPT] Audit log error:", logErr);
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
