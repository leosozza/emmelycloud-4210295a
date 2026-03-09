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
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Token obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: contract, error } = await supabase
        .from("contracts")
        .select("id, status, starts_at, expires_at, signer_name, signer_email, signer_phone, file_url, proposal_id, sign_token")
        .eq("sign_token", token)
        .single();

      if (error || !contract) {
        return new Response(JSON.stringify({ error: "Contrato não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get proposal title and value
      const { data: proposal } = await supabase
        .from("proposals")
        .select("title, value, description")
        .eq("id", contract.proposal_id)
        .single();

      // Check if already signed
      const { data: existingSignature } = await supabase
        .from("digital_signatures")
        .select("id, signature_method, signed_at, evidence_hash")
        .eq("contract_id", contract.id)
        .limit(1)
        .maybeSingle();

      return new Response(JSON.stringify({
        contract: {
          id: contract.id,
          status: contract.status,
          starts_at: contract.starts_at,
          expires_at: contract.expires_at,
          signer_name: contract.signer_name,
          signer_email: contract.signer_email,
          signer_phone: contract.signer_phone,
          file_url: contract.file_url,
        },
        proposal: proposal ? { title: proposal.title, value: proposal.value, description: proposal.description } : null,
        signature: existingSignature,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { token, method, signature_data, signer_name, signer_email, signer_phone, signer_document, geolocation } = body;

      if (!token || !method) {
        return new Response(JSON.stringify({ error: "Token e método obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find contract
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("id, status, case_id, proposal_id")
        .eq("sign_token", token)
        .single();

      if (contractError || !contract) {
        return new Response(JSON.stringify({ error: "Contrato não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (contract.status !== "pendente") {
        return new Response(JSON.stringify({ error: "Contrato já não está pendente" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";
      const signedAt = new Date().toISOString();

      // Calculate evidence hash
      const evidenceHash = await sha256(`${token}|${ip}|${signedAt}|${method}|${signature_data || ""}`);

      // Upload signature image if draw/selfie
      let signatureImageUrl: string | null = null;
      if (signature_data && (method === "draw" || method === "selfie")) {
        const base64Data = signature_data.replace(/^data:image\/\w+;base64,/, "");
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const ext = method === "selfie" ? "jpg" : "png";
        const filePath = `${contract.id}/${method}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("signatures")
          .upload(filePath, binaryData, { contentType: `image/${ext}`, upsert: true });

        if (!uploadError) {
          const { data: publicUrl } = supabase.storage.from("signatures").getPublicUrl(filePath);
          signatureImageUrl = publicUrl.publicUrl;
        }
      }

      // Insert digital signature
      const { data: signature, error: sigError } = await supabase
        .from("digital_signatures")
        .insert({
          contract_id: contract.id,
          signer_name: signer_name || "Signatário",
          signer_email,
          signer_phone,
          signer_document,
          signature_method: method,
          signature_image_url: signatureImageUrl,
          ip_address: ip,
          user_agent: userAgent,
          device_info: { platform: req.headers.get("sec-ch-ua-platform"), mobile: req.headers.get("sec-ch-ua-mobile") },
          geolocation: geolocation || null,
          evidence_hash: evidenceHash,
          signed_at: signedAt,
        })
        .select("id")
        .single();

      if (sigError) {
        return new Response(JSON.stringify({ error: "Erro ao registar assinatura", details: sigError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Update contract status
      await supabase.from("contracts").update({
        status: "assinado",
        signed_at: signedAt,
      }).eq("id", contract.id);

      // Update case and lead
      if (contract.case_id) {
        await supabase.from("cases").update({ status: "em_andamento" }).eq("id", contract.case_id);

        const { data: linkedCase } = await supabase.from("cases").select("lead_id").eq("id", contract.case_id).single();
        if (linkedCase?.lead_id) {
          await supabase.from("leads").update({ funnel_stage: "fechado" }).eq("id", linkedCase.lead_id);
        }
      }

      // --- Bitrix24 Badge: emmely_contract_signed ---
      try {
        // Find deal via case -> lead -> bitrix24_id
        let bitrixDealId: string | null = null;
        if (contract.case_id) {
          const { data: linkedCase } = await supabase.from("cases").select("lead_id").eq("id", contract.case_id).single();
          if (linkedCase?.lead_id) {
            const { data: lead } = await supabase.from("leads").select("bitrix24_id").eq("id", linkedCase.lead_id).single();
            bitrixDealId = lead?.bitrix24_id || null;
          }
        }

        if (bitrixDealId) {
          const { data: integration } = await supabase
            .from("bitrix24_integrations")
            .select("client_endpoint, access_token")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (integration?.client_endpoint && integration?.access_token) {
            const endpoint = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
            await fetch(`${endpoint}crm.activity.configurable.add`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                auth: integration.access_token,
                ownerTypeId: 2,
                ownerId: parseInt(bitrixDealId),
                fields: { completed: true, isIncomingChannel: "N", responsibleId: 1, badgeCode: "emmely_contract_signed" },
                layout: {
                  icon: { code: "done" },
                  header: { title: "Contrato Assinado" },
                  body: { logo: { code: "robot" }, blocks: {
                    signer: { type: "text", properties: { value: signer_name || "Signatário" } },
                    method: { type: "text", properties: { value: method } },
                    date: { type: "text", properties: { value: new Date(signedAt).toLocaleDateString("pt-PT") } },
                  } },
                },
              }),
            });
            console.log(`[SIGN-CONTRACT] Badge emmely_contract_signed for deal ${bitrixDealId}`);
          }
        }
      } catch (badgeErr) {
        console.error("[SIGN-CONTRACT] Badge error:", badgeErr);
      }

      return new Response(JSON.stringify({
        success: true,
        signature_id: signature.id,
        evidence_hash: evidenceHash,
        signed_at: signedAt,
        ip_address: ip,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
