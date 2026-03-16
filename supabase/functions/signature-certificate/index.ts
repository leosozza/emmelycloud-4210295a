import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const contractId = url.searchParams.get("contract_id");
    const token = url.searchParams.get("token");
    const format = url.searchParams.get("format");

    if (!contractId && !token) {
      return new Response(JSON.stringify({ error: "contract_id ou token obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find proposal (unified table)
    let proposalQuery = supabase.from("proposals").select("*");
    if (token) {
      proposalQuery = proposalQuery.eq("sign_token", token);
    } else {
      proposalQuery = proposalQuery.eq("id", contractId);
    }
    const { data: proposal, error: proposalError } = await proposalQuery.single();
    if (proposalError || !proposal) {
      // Fallback: try legacy contracts table
      let contractQuery = supabase.from("contracts").select("*");
      if (token) {
        contractQuery = contractQuery.eq("sign_token", token);
      } else {
        contractQuery = contractQuery.eq("id", contractId);
      }
      const { data: contract, error: contractError } = await contractQuery.single();
      if (contractError || !contract) {
        return new Response(JSON.stringify({ error: "Contrato não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Use legacy contract - fetch proposal for details
      const { data: legacyProposal } = await supabase
        .from("proposals")
        .select("title, value, description")
        .eq("id", contract.proposal_id)
        .single();

      return generateCertificate(supabase, contract, legacyProposal, contract.id, format, corsHeaders);
    }

    // Get digital signature - try proposal_id first, then contract_id fallback
    return generateCertificate(supabase, proposal, { title: proposal.title, value: proposal.value, description: proposal.description }, proposal.id, format, corsHeaders);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateCertificate(supabase: any, entity: any, proposal: any, entityId: string, format: string | null, corsHeaders: Record<string, string>) {
  // Get digital signature - try proposal_id first
  let { data: signature } = await supabase
    .from("digital_signatures")
    .select("*")
    .eq("proposal_id", entityId)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback to contract_id
  if (!signature) {
    const { data: sig2 } = await supabase
      .from("digital_signatures")
      .select("*")
      .eq("contract_id", entityId)
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    signature = sig2;
  }

  if (!signature) {
    return new Response(JSON.stringify({ error: "Assinatura digital não encontrada" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const methodLabels: Record<string, string> = {
    draw: "Assinatura Desenhada (Canvas)",
    selfie: "Reconhecimento por Selfie",
    ip_accept: "Aceite por IP / Dispositivo",
  };

  const signedDate = new Date(signature.signed_at);
  const formattedDate = signedDate.toLocaleDateString("pt-PT", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Europe/Lisbon",
  });

  const signatureImageBlock = signature.signature_image_url
    ? `<div class="section">
        <div class="section-title">Imagem da Assinatura</div>
        <div style="text-align:center; padding:20px; background:#fafafa; border-radius:8px; border:1px dashed #d1d5db;">
          <img src="${signature.signature_image_url}" alt="Assinatura" style="max-width:300px; max-height:150px;" />
        </div>
      </div>`
    : "";

  const geolocationBlock = signature.geolocation
    ? `<tr><td class="label">Geolocalização</td><td>${JSON.stringify(signature.geolocation)}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%); color: white; padding: 40px; text-align: center; position: relative; }
    .header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #3b82f6, #10b981, #3b82f6); }
    .header h1 { font-size: 22px; letter-spacing: 3px; margin-bottom: 4px; }
    .header .sub { font-size: 11px; letter-spacing: 5px; color: #94a3b8; text-transform: uppercase; }
    .badge { display: inline-block; margin-top: 16px; padding: 6px 20px; border-radius: 20px; background: rgba(16, 185, 129, 0.2); color: #10b981; font-size: 12px; font-weight: 600; letter-spacing: 1px; border: 1px solid rgba(16,185,129,0.3); }
    .content { padding: 36px 40px; }
    .cert-title { text-align: center; font-size: 20px; font-weight: 700; margin-bottom: 6px; color: #0f172a; }
    .cert-sub { text-align: center; font-size: 13px; color: #64748b; margin-bottom: 28px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    table.info { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.info td { padding: 7px 0; vertical-align: top; }
    table.info td.label { color: #64748b; width: 180px; font-weight: 500; }
    .hash-box { background: #f1f5f9; border-radius: 8px; padding: 16px; margin-top: 8px; font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; border: 1px solid #e2e8f0; color: #334155; line-height: 1.6; }
    .legal { margin-top: 30px; padding: 20px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a; font-size: 11px; color: #92400e; line-height: 1.7; }
    .legal strong { color: #78350f; }
    .footer { text-align: center; color: #94a3b8; font-size: 10px; padding: 20px 40px; border-top: 1px solid #e2e8f0; margin-top: 20px; }
    .footer .hash-ref { font-family: 'Courier New', monospace; font-size: 9px; color: #cbd5e1; margin-top: 4px; }
    .seal { display: inline-block; width: 60px; height: 60px; border-radius: 50%; border: 3px solid #10b981; text-align: center; line-height: 54px; font-size: 10px; font-weight: 700; color: #10b981; letter-spacing: 1px; margin: 0 auto 12px; background: rgba(16,185,129,0.05); }
  </style>
</head>
<body>
  <div class="header">
    <h1>EMMELY FERNANDES</h1>
    <div class="sub">Advocacia Internacional</div>
    <div class="badge">✓ ASSINATURA DIGITAL VERIFICADA</div>
  </div>
  <div class="content">
    <div style="text-align:center; margin-bottom:24px;"><div class="seal">VÁLIDO</div></div>
    <div class="cert-title">Certificado de Assinatura Digital</div>
    <div class="cert-sub">Documento gerado automaticamente como prova de assinatura eletrónica</div>

    ${proposal ? `
    <div class="section">
      <div class="section-title">Dados do Contrato</div>
      <table class="info">
        <tr><td class="label">Proposta</td><td><strong>${proposal.title}</strong></td></tr>
        <tr><td class="label">Valor</td><td>€ ${Number(proposal.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td></tr>
        ${proposal.description ? `<tr><td class="label">Descrição</td><td>${proposal.description}</td></tr>` : ""}
        <tr><td class="label">ID</td><td><code style="font-size:11px;color:#64748b;">${entityId}</code></td></tr>
      </table>
    </div>` : ""}

    <div class="section">
      <div class="section-title">Dados do Signatário</div>
      <table class="info">
        <tr><td class="label">Nome</td><td><strong>${signature.signer_name}</strong></td></tr>
        ${signature.signer_email ? `<tr><td class="label">Email</td><td>${signature.signer_email}</td></tr>` : ""}
        ${signature.signer_phone ? `<tr><td class="label">Telefone</td><td>${signature.signer_phone}</td></tr>` : ""}
        ${signature.signer_document ? `<tr><td class="label">CPF / NIF</td><td>${signature.signer_document}</td></tr>` : ""}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Evidências da Assinatura</div>
      <table class="info">
        <tr><td class="label">Método de Assinatura</td><td><strong>${methodLabels[signature.signature_method] || signature.signature_method}</strong></td></tr>
        <tr><td class="label">Data e Hora</td><td>${formattedDate} (Hora de Lisboa)</td></tr>
        <tr><td class="label">Endereço IP</td><td>${signature.ip_address || "N/A"}</td></tr>
        <tr><td class="label">User-Agent</td><td style="font-size:11px;word-break:break-all;">${signature.user_agent || "N/A"}</td></tr>
        ${geolocationBlock}
        <tr><td class="label">ID da Assinatura</td><td><code style="font-size:11px;color:#64748b;">${signature.id}</code></td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Hash de Evidência (SHA-256)</div>
      <div class="hash-box">${signature.evidence_hash}</div>
      <p style="font-size:11px; color:#94a3b8; margin-top:6px;">
        Este hash criptográfico garante a integridade e autenticidade da assinatura.
      </p>
    </div>

    ${signatureImageBlock}

    <div class="legal">
      <strong>Declaração de Validade Jurídica</strong><br><br>
      Este certificado atesta que o documento acima identificado foi assinado digitalmente pelo signatário mencionado, utilizando o método indicado, com registo de todas as evidências necessárias para a sua validade jurídica.<br><br>
      <strong>🇧🇷 Brasil:</strong> Assinatura eletrónica válida nos termos da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020.<br>
      <strong>🇵🇹 Portugal / UE:</strong> Assinatura eletrónica conforme o Regulamento eIDAS (UE) nº 910/2014 e o Decreto-Lei nº 12/2021.<br><br>
      A trilha de auditoria (IP, dispositivo, timestamp, hash SHA-256) constitui prova de autoria e integridade do ato de assinatura.
    </div>
  </div>
  <div class="footer">
    <div>Emmely Fernandes — Advocacia Internacional</div>
    <div>Certificado gerado em ${new Date().toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
    <div class="hash-ref">REF: ${signature.evidence_hash?.substring(0, 16)}...${signature.evidence_hash?.substring(48)}</div>
  </div>
</body>
</html>`;

  if (format === "html") {
    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const fileName = `certificate-${entityId}.html`;
  const { error: uploadError } = await supabase.storage
    .from("signatures")
    .upload(fileName, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html" });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("signatures").getPublicUrl(fileName);

  return new Response(JSON.stringify({ certificate_url: urlData.publicUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
