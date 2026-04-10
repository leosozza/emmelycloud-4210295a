import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── GET: fetch contract data for the signing page ──────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Token obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: proposal, error } = await supabase
        .from("proposals")
        .select("id, status, contract_status, starts_at, expires_at, signer_name, signer_email, signer_phone, file_url, title, value, description, sign_token, case_id, client_name, client_phone, client_email, currency")
        .eq("sign_token", token)
        .single();

      if (error || !proposal) {
        return new Response(JSON.stringify({ error: "Contrato não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already signed (proposals table first, then legacy)
      const { data: existingSignature } = await supabase
        .from("digital_signatures")
        .select("id, signature_method, signed_at, evidence_hash")
        .eq("proposal_id", proposal.id)
        .limit(1)
        .maybeSingle();

      let legacySignature = existingSignature;
      if (!legacySignature) {
        const { data: legacySig } = await supabase
          .from("digital_signatures")
          .select("id, signature_method, signed_at, evidence_hash")
          .eq("contract_id", proposal.id)
          .limit(1)
          .maybeSingle();
        legacySignature = legacySig;
      }

      return new Response(JSON.stringify({
        contract: {
          id: proposal.id,
          status: proposal.contract_status || "pendente",
          starts_at: proposal.starts_at,
          expires_at: proposal.expires_at,
          signer_name: proposal.signer_name || proposal.client_name,
          signer_email: proposal.signer_email || proposal.client_email,
          signer_phone: proposal.signer_phone || proposal.client_phone,
          file_url: proposal.file_url,
        },
        proposal: {
          title: proposal.title,
          value: proposal.value,
          description: proposal.description,
          currency: proposal.currency || "EUR",
        },
        signature: legacySignature,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── POST: submit signature ─────────────────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json();
      const { token, method, signature_data, signer_name, signer_email, signer_phone, signer_document, geolocation } = body;

      if (!token || !method) {
        return new Response(JSON.stringify({ error: "Token e método obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch full proposal (need client_phone, bitrix24_deal_id, case_id, auto_payment_config, etc.)
      const { data: proposal, error: proposalError } = await supabase
        .from("proposals")
        .select("id, contract_status, case_id, title, value, currency, client_name, client_phone, client_email, bitrix24_deal_id, auto_payment_config, signed_flow_id")
        .eq("sign_token", token)
        .single();

      if (proposalError || !proposal) {
        return new Response(JSON.stringify({ error: "Contrato não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (proposal.contract_status !== "pendente") {
        return new Response(JSON.stringify({ error: "Contrato já não está pendente" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("cf-connecting-ip")
        || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";
      const signedAt = new Date().toISOString();

      // Evidence hash
      const evidenceHash = await sha256(`${token}|${ip}|${signedAt}|${method}|${signature_data || ""}`);

      // Upload signature image if draw/selfie
      let signatureImageUrl: string | null = null;
      if (signature_data && (method === "draw" || method === "selfie")) {
        try {
          const base64Data = signature_data.replace(/^data:image\/\w+;base64,/, "");
          const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const ext = method === "selfie" ? "jpg" : "png";
          const filePath = `${proposal.id}/${method}_${Date.now()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("signatures")
            .upload(filePath, binaryData, { contentType: `image/${ext}`, upsert: true });
          if (!uploadError) {
            const { data: publicUrl } = supabase.storage.from("signatures").getPublicUrl(filePath);
            signatureImageUrl = publicUrl.publicUrl;
          }
        } catch (uploadErr) {
          console.error("[SIGN-CONTRACT] Signature image upload error:", uploadErr);
        }
      }

      // Insert digital signature
      const sigPayload = {
        contract_id: proposal.id,
        proposal_id: proposal.id,
        signer_name: signer_name || proposal.client_name || "Signatário",
        signer_email: signer_email || proposal.client_email || null,
        signer_phone: signer_phone || proposal.client_phone || null,
        signer_document,
        signature_method: method,
        signature_image_url: signatureImageUrl,
        ip_address: ip,
        user_agent: userAgent,
        device_info: {
          platform: req.headers.get("sec-ch-ua-platform"),
          mobile: req.headers.get("sec-ch-ua-mobile"),
        },
        geolocation: geolocation || null,
        evidence_hash: evidenceHash,
        signed_at: signedAt,
      };

      let sigId: string | undefined;
      const { data: signature, error: sigError } = await supabase
        .from("digital_signatures")
        .insert(sigPayload)
        .select("id")
        .single();

      if (sigError) {
        // Retry without contract_id if FK constraint fails
        const { data: sig2, error: sig2Err } = await supabase
          .from("digital_signatures")
          .insert({ ...sigPayload, contract_id: undefined })
          .select("id")
          .single();
        if (sig2Err) {
          return new Response(JSON.stringify({ error: "Erro ao registar assinatura", details: sig2Err.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        sigId = sig2?.id;
      } else {
        sigId = signature?.id;
      }

      // Update proposal contract_status → assinado
      await supabase.from("proposals").update({
        contract_status: "assinado",
        signed_at: signedAt,
      }).eq("id", proposal.id);

      // Update legacy contracts table
      await supabase.from("contracts").update({
        status: "assinado",
        signed_at: signedAt,
      }).eq("proposal_id", proposal.id);

      // Update case and lead funnel stage
      if (proposal.case_id) {
        await supabase.from("cases").update({ status: "em_andamento" }).eq("id", proposal.case_id);
        const { data: linkedCase } = await supabase
          .from("cases")
          .select("lead_id")
          .eq("id", proposal.case_id)
          .single();
        if (linkedCase?.lead_id) {
          await supabase.from("leads")
            .update({ funnel_stage: "fechado" })
            .eq("id", linkedCase.lead_id);
        }
      }

      // ── Bitrix24: badge + timeline comment ───────────────────────────────
      try {
        // Resolve bitrix deal ID: from proposal directly or via case → lead
        let bitrixDealId: string | null = proposal.bitrix24_deal_id || null;
        if (!bitrixDealId && proposal.case_id) {
          const { data: lc } = await supabase
            .from("cases").select("lead_id").eq("id", proposal.case_id).single();
          if (lc?.lead_id) {
            const { data: ld } = await supabase
              .from("leads").select("bitrix24_id").eq("id", lc.lead_id).single();
            bitrixDealId = ld?.bitrix24_id || null;
          }
        }

        if (bitrixDealId) {
          const { data: bxInt } = await supabase
            .from("bitrix24_integrations")
            .select("client_endpoint, access_token")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (bxInt?.client_endpoint && bxInt?.access_token) {
            const ep = bxInt.client_endpoint.endsWith("/")
              ? bxInt.client_endpoint
              : bxInt.client_endpoint + "/";
            const auth = bxInt.access_token;
            const dealId = parseInt(bitrixDealId);

            // Timeline comment: contract signed
            await fetch(`${ep}crm.timeline.comment.add`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fields: {
                  ENTITY_ID: dealId,
                  ENTITY_TYPE: "deal",
                  COMMENT: `✍️ Contrato assinado digitalmente\n\nSignatário: ${signer_name || proposal.client_name || "N/A"}\nMétodo: ${method}\nData: ${new Date(signedAt).toLocaleDateString("pt-PT")}\nHash de evidência: ${evidenceHash}\n\n💳 Próximo passo: enviar link de pagamento ao cliente.`,
                },
                auth,
              }),
            });

            // Configurable activity badge
            await fetch(`${ep}crm.activity.configurable.add`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ownerTypeId: 2,
                ownerId: dealId,
                fields: {
                  completed: true,
                  isIncomingChannel: "N",
                  responsibleId: 1,
                  badgeCode: "emmely_contract_signed",
                },
                layout: {
                  icon: { code: "done" },
                  header: { title: "Contrato Assinado" },
                  body: {
                    logo: { code: "robot" },
                    blocks: {
                      signer: { type: "text", properties: { value: signer_name || proposal.client_name || "Signatário" } },
                      method: { type: "text", properties: { value: method } },
                      date: { type: "text", properties: { value: new Date(signedAt).toLocaleDateString("pt-PT") } },
                    },
                  },
                },
                auth,
              }),
            });
            console.log(`[SIGN-CONTRACT] Bitrix24 badge + comment for deal ${dealId}`);
          }
        }
      } catch (bxErr) {
        console.error("[SIGN-CONTRACT] Bitrix24 error:", bxErr);
      }

      // ── Notify client via WhatsApp with payment instructions ──────────────
      try {
        let conversationId: string | null = null;
        const clientPhone = signer_phone || proposal.client_phone || null;

        if (proposal.case_id) {
          const { data: lc } = await supabase
            .from("cases").select("lead_id").eq("id", proposal.case_id).single();
          if (lc?.lead_id) {
            const { data: ld } = await supabase
              .from("leads").select("conversation_id").eq("id", lc.lead_id).single();
            conversationId = ld?.conversation_id || null;
          }
        }

        if (conversationId) {
          const clientName = signer_name || proposal.client_name || "cliente";
          const currSymbol: Record<string, string> = { EUR: "€", BRL: "R$", USD: "$", GBP: "£" };
          const curr = currSymbol[proposal.currency || "EUR"] || "€";
          const formattedValue = `${curr} ${Number(proposal.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`;

          const signedMsg =
            `✍️ *Contrato assinado com sucesso!*\n\n` +
            `Obrigado, ${clientName}!\n\n` +
            `📋 Contrato: ${proposal.title || ""}\n` +
            `💰 Valor: ${formattedValue}\n` +
            `🗓️ Data: ${new Date(signedAt).toLocaleDateString("pt-PT")}\n\n` +
            `💳 *Próximo passo: pagamento*\n` +
            `Em breve receberá o link de pagamento. Aguarde um momento.`;

          await fetch(`${supabaseUrl}/functions/v1/message-send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              conversation_id: conversationId,
              content: signedMsg,
            }),
          });
          console.log(`[SIGN-CONTRACT] Client notified via conversation ${conversationId}`);
        } else if (clientPhone) {
          console.log(`[SIGN-CONTRACT] No conversation found for phone ${clientPhone}, skipping WhatsApp notification`);
        }
      } catch (notifErr) {
        console.error("[SIGN-CONTRACT] Post-sign notification error:", notifErr);
      }

      // ── Auto-payment: create charge and send link if configured ─────────
      const autoPayCfg = proposal.auto_payment_config as any;
      if (autoPayCfg?.enabled === true) {
        try {
          console.log(`[SIGN-CONTRACT] Auto-payment triggered for proposal ${proposal.id}`);

          // Resolve conversation for WhatsApp notification
          let conversationIdForPayment: string | null = null;
          if (proposal.case_id) {
            const { data: lc2 } = await supabase
              .from("cases").select("lead_id").eq("id", proposal.case_id).single();
            if (lc2?.lead_id) {
              const { data: ld2 } = await supabase
                .from("leads").select("conversation_id").eq("id", lc2.lead_id).single();
              conversationIdForPayment = ld2?.conversation_id || null;
            }
          }

          // Create charge via payment-create
          const chargeRes = await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              amount: proposal.value,
              currency: proposal.currency || "EUR",
              payment_method: autoPayCfg.payment_method || "card",
              installments: autoPayCfg.installments || 1,
              customer_data: {
                name: signer_name || proposal.client_name || "",
                email: signer_email || proposal.client_email || "",
                country: (proposal.currency || "EUR") === "BRL" ? "Brasil" : "Portugal",
              },
              description: `Pagamento: ${proposal.title || "Serviço Jurídico"}`,
              metadata: {
                proposal_id: proposal.id,
                bitrix_deal_id: autoPayCfg.deal_id || proposal.bitrix24_deal_id || "",
                source: "auto_payment_after_sign",
              },
            }),
          });

          const chargeData = await chargeRes.json();
          console.log(`[SIGN-CONTRACT] Auto-payment charge created:`, JSON.stringify(chargeData).substring(0, 300));

          const paymentUrl = chargeData.payment_url || chargeData.checkout_url || "";
          const pixCode = chargeData.pix_code || "";

          // Send payment link via WhatsApp
          if (conversationIdForPayment && paymentUrl) {
            const clientName2 = signer_name || proposal.client_name || "cliente";
            const currSymbol2: Record<string, string> = { EUR: "€", BRL: "R$", USD: "$", GBP: "£" };
            const curr2 = currSymbol2[proposal.currency || "EUR"] || "€";
            const formattedValue2 = `${curr2} ${Number(proposal.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`;

            let payMsg =
              `💳 *Link de Pagamento*\n\n` +
              `${clientName2}, o seu contrato foi assinado com sucesso!\n\n` +
              `📋 ${proposal.title || "Serviço Jurídico"}\n` +
              `💰 Valor: *${formattedValue2}*\n\n` +
              `👇 Clique para pagar:\n${paymentUrl}`;

            if (pixCode) {
              payMsg += `\n\n📱 *Código Pix:*\n\`\`\`${pixCode}\`\`\``;
            }

            await fetch(`${supabaseUrl}/functions/v1/message-send`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ conversation_id: conversationIdForPayment, content: payMsg }),
            });
            console.log(`[SIGN-CONTRACT] Payment link sent via conversation ${conversationIdForPayment}`);
          }

          // Save payment URL to Bitrix24 deal field
          const bxDealId = autoPayCfg.deal_id || proposal.bitrix24_deal_id || null;
          if (bxDealId && paymentUrl) {
            try {
              const { data: bxInt2 } = await supabase
                .from("bitrix24_integrations")
                .select("client_endpoint, access_token")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (bxInt2?.client_endpoint && bxInt2?.access_token) {
                const ep2 = bxInt2.client_endpoint.endsWith("/") ? bxInt2.client_endpoint : bxInt2.client_endpoint + "/";
                await fetch(`${ep2}crm.deal.update`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ID: bxDealId,
                    fields: { UF_CRM_EMMELY_PAYMENT_URL: paymentUrl, UF_CRM_EMMELY_PAYMENT_STATUS: "Pendente" },
                    auth: bxInt2.access_token,
                  }),
                });
                await fetch(`${ep2}crm.timeline.comment.add`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fields: {
                      ENTITY_ID: parseInt(String(bxDealId)),
                      ENTITY_TYPE: "deal",
                      COMMENT: `💳 Link de pagamento enviado automaticamente ao cliente\n\nURL: ${paymentUrl}`,
                    },
                    auth: bxInt2.access_token,
                  }),
                });
              }
            } catch (bxPayErr) {
              console.error("[SIGN-CONTRACT] Bitrix24 payment URL update error:", bxPayErr);
            }
          }
        } catch (autoPayErr) {
          // Non-fatal: log but don't fail the signature response
          console.error("[SIGN-CONTRACT] Auto-payment error:", autoPayErr);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        signature_id: sigId,
        evidence_hash: evidenceHash,
        signed_at: signedAt,
        ip_address: ip,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
