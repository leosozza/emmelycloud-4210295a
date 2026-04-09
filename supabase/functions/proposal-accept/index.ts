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
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get client IP and user-agent for legal evidence
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
      // Return sign_url even for already-accepted proposals so the frontend can redirect
      const signToken = proposal.sign_token;
      const signUrl = signToken ? `${frontendUrl}/sign/${signToken}` : null;
      return new Response(JSON.stringify({
        success: true,
        already_accepted: true,
        sign_token: signToken || null,
        sign_url: signUrl || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (proposal.status === "recusada") throw new Error("Proposta já foi recusada");
    if (proposal.status === "expirada") throw new Error("Proposta expirada");
    if (proposal.valid_until && new Date(proposal.valid_until) < new Date()) {
      await supabase.from("proposals").update({ status: "expirada" }).eq("id", proposal.id);
      throw new Error("Proposta expirada");
    }

    // 1. Ensure sign_token exists (generate if missing)
    const signToken: string = proposal.sign_token || crypto.randomUUID();
    const signUrl = `${frontendUrl}/sign/${signToken}`;

    // 2. Update proposal status with legal evidence
    const { error: upErr } = await supabase.from("proposals").update({
      status: "aceita",
      accepted_at: new Date().toISOString(),
      accepted_ip: clientIp,
      accepted_user_agent: userAgent,
      contract_status: "pendente",
      sign_token: signToken,
    }).eq("id", proposal.id);
    if (upErr) throw upErr;

    // 3. Bitrix24: move deal stage + add timeline comment with sign link
    if (proposal.bitrix24_deal_id) {
      try {
        // FIX: use order + limit instead of blindly grabbing first row (multi-tenant safety)
        const { data: bxIntegration } = await supabase
          .from("bitrix24_integrations")
          .select("client_endpoint, access_token")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bxIntegration?.client_endpoint && bxIntegration?.access_token) {
          const endpoint = bxIntegration.client_endpoint.endsWith("/")
            ? bxIntegration.client_endpoint
            : bxIntegration.client_endpoint + "/";
          const auth = bxIntegration.access_token;
          const dealId = parseInt(proposal.bitrix24_deal_id);

          // 3a. Move stage if accept_stage_id configured
          if (proposal.accept_stage_id) {
            await fetch(`${endpoint}crm.deal.update`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ID: dealId,
                fields: { STAGE_ID: proposal.accept_stage_id },
                auth,
              }),
            });
            console.log(`[PROPOSAL-ACCEPT] Deal ${dealId} moved to stage ${proposal.accept_stage_id}`);
          }

          // 3b. Always add timeline comment with sign link
          const currSymbol: Record<string, string> = { EUR: "€", BRL: "R$", USD: "$", GBP: "£" };
          const curr = currSymbol[proposal.currency || "EUR"] || "€";
          const formattedValue = `${curr} ${Number(proposal.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`;

          await fetch(`${endpoint}crm.timeline.comment.add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: {
                ENTITY_ID: dealId,
                ENTITY_TYPE: "deal",
                COMMENT: `✅ Proposta aceita pelo cliente\n\nCliente: ${proposal.client_name || "N/A"}\nProposta: ${proposal.title}\nValor: ${formattedValue}\nData: ${new Date().toLocaleDateString("pt-PT")}\nIP: ${clientIp}\n\n📝 Link para assinar o contrato:\n${signUrl}`,
              },
              auth,
            }),
          });
          console.log(`[PROPOSAL-ACCEPT] Timeline comment added to deal ${dealId}`);
        }
      } catch (bxErr) {
        console.error("[PROPOSAL-ACCEPT] Bitrix24 update error:", bxErr);
      }
    }

    // 4. Trigger accept_flow_id if configured
    if (proposal.accept_flow_id) {
      try {
        let conversationId: string | null = null;
        const { data: flowCase } = await supabase
          .from("cases")
          .select("lead_id")
          .eq("id", proposal.case_id)
          .single();

        if (flowCase?.lead_id) {
          const { data: flowLead } = await supabase
            .from("leads")
            .select("conversation_id")
            .eq("id", flowCase.lead_id)
            .single();
          conversationId = flowLead?.conversation_id || null;
        }

        if (conversationId) {
          await supabase
            .from("conversations")
            .update({
              bot_state: { force_flow_id: proposal.accept_flow_id },
              attendance_mode: "bot",
            })
            .eq("id", conversationId);

          await fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              conversation_id: conversationId,
              message: `[SISTEMA] Proposta "${proposal.title}" aceite pelo cliente.`,
            }),
          });
          console.log(`[PROPOSAL-ACCEPT] Flow ${proposal.accept_flow_id} triggered for conversation ${conversationId}`);
        }
      } catch (flowErr) {
        console.error("[PROPOSAL-ACCEPT] Flow trigger error:", flowErr);
      }
    }

    // 5. Create legacy contract record for backward compat
    const { error: contractErr } = await supabase.from("contracts").insert({
      proposal_id: proposal.id,
      case_id: proposal.case_id,
    });
    if (contractErr) console.error("[PROPOSAL-ACCEPT] Contract (compat) error:", contractErr);

    // 6. Get case data for lead update and notifications
    const { data: caseData } = await supabase
      .from("cases")
      .select("lead_id, assigned_attorney_id")
      .eq("id", proposal.case_id)
      .single();

    // 7. Update lead funnel stage
    if (caseData?.lead_id) {
      await supabase
        .from("leads")
        .update({ funnel_stage: "contrato" })
        .eq("id", caseData.lead_id);
    }

    // 8. Notify assigned attorney + admins
    try {
      const notifyUserIds = new Set<string>();

      if (caseData?.assigned_attorney_id) {
        const { data: attorneyProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", caseData.assigned_attorney_id)
          .single();
        if (attorneyProfile?.user_id) notifyUserIds.add(attorneyProfile.user_id);
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

    // 9. Notify client via WhatsApp/Instagram with sign link
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
            .select("id, channel")
            .eq("id", lead.conversation_id)
            .single();

          if (conv && (conv.channel === "whatsapp" || conv.channel === "instagram")) {
            const clientName = proposal.client_name ? `, ${proposal.client_name}` : "";
            const confirmMsg =
              `✅ Proposta aceita com sucesso${clientName}!\n\n` +
              `Obrigado por confiar na Emmely Fernandes Advocacia.\n\n` +
              `📝 *Próximo passo: assine o contrato*\n` +
              `Acesse o link abaixo para assinar digitalmente:\n${signUrl}\n\n` +
              `Após a assinatura, enviaremos o link de pagamento.`;

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
            console.log(`[PROPOSAL-ACCEPT] Client notified via ${conv.channel} with sign link`);
          }
        }
      }
    } catch (clientNotifErr) {
      console.error("[PROPOSAL-ACCEPT] Client notification error:", clientNotifErr);
    }

    // 10. Audit log
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
          sign_url: signUrl,
        },
      });
    } catch (logErr) {
      console.error("[PROPOSAL-ACCEPT] Audit log error:", logErr);
    }

    // Return sign_token and sign_url so the frontend can redirect immediately
    return new Response(JSON.stringify({
      success: true,
      sign_token: signToken,
      sign_url: signUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
