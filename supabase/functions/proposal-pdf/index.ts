import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface LayoutBlock {
  id: string;
  type: string;
  visible: boolean;
  content: Record<string, any>;
  styles?: Record<string, string>;
}

// ── Helper: build placeholder map for PDF ───────────────────────────────────

function buildPdfPlaceholders(proposal: any): Record<string, string> {
  const curr = "€";
  const value = proposal.value ? Number(proposal.value) : null;
  const installments = proposal.installments ? Number(proposal.installments) : 1;
  const upfrontValue = proposal.upfront_value ? Number(proposal.upfront_value) : null;
  const instValue = proposal.installment_value ? Number(proposal.installment_value) : null;
  const calcInstValue = instValue ?? (value && installments > 1 ? value / installments : null);

  const fmtNum = (n: number | null) =>
    n !== null ? `${curr} ${n.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}` : "";

  const genderTreatment = proposal.client_gender === "feminino" ? "Prezada"
    : proposal.client_gender === "masculino" ? "Prezado" : "Prezado(a)";

  const docValidity = proposal.client_document_validity
    ? new Date(proposal.client_document_validity).toLocaleDateString("pt-PT") : "";

  return {
    "{cliente.nome}": proposal.client_name ?? "",
    "{cliente.email}": proposal.client_email ?? "",
    "{cliente.telefone}": proposal.client_phone ?? "",
    "{cliente.documento}": proposal.client_document ?? "",
    "{cliente.morada}": proposal.client_address ?? "",
    "{cliente.tratamento}": genderTreatment,
    "{cliente.nacionalidade}": proposal.client_nationality ?? "",
    "{cliente.tipo_documento}": proposal.client_document_type ?? "",
    "{cliente.numero_documento}": proposal.client_document_number ?? "",
    "{cliente.validade_documento}": docValidity,
    "{cliente.orgao_emissor}": proposal.client_document_issuer ?? "",
    "{proposta.titulo}": proposal.title ?? "",
    "{proposta.valor}": fmtNum(value),
    "{proposta.validade}": proposal.valid_until ? new Date(proposal.valid_until).toLocaleDateString("pt-PT") : "",
    "{valor}": fmtNum(value),
    "{valor_total}": fmtNum(value),
    "{valor_entrada}": fmtNum(upfrontValue),
    "{valor_parcela}": fmtNum(calcInstValue),
    "{tipo_pagamento}": ({ fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado" } as Record<string, string>)[proposal.payment_type] ?? (proposal.payment_type ?? ""),
    "{parcelas}": String(installments),
    "{parcelas_valor}": fmtNum(calcInstValue),
    "{data}": new Date().toLocaleDateString("pt-PT"),
    "{nome_contratante}": proposal.client_name ?? "",
    "{nome_contratado}": "Emmely Fernandes Advocacia",
  };
}

function replacePlaceholders(text: string, ph: Record<string, string>): string {
  let result = text;
  for (const [key, val] of Object.entries(ph)) {
    result = result.split(key).join(val);
  }
  return result;
}

// ── Block renderer ──────────────────────────────────────────────────────────

function renderBlockToHtml(block: LayoutBlock, proposal: any, template: any, ph: Record<string, string>): string {
  if (!block.visible) return "";

  const headerColor = template?.header_color || "#1e293b";
  const accentColor = template?.accent_color || "#0f172a";
  const logoUrl = template?.logo_url || "";
  const cName = escapeHtml(template?.company_name || "");
  const cTagline = escapeHtml(template?.company_tagline || "");

  const value = proposal.value ? Number(proposal.value) : 0;
  const installments = proposal.installments ? Number(proposal.installments) : 1;
  const upfrontValue = proposal.upfront_value ? Number(proposal.upfront_value) : null;
  const instValue = proposal.installment_value ? Number(proposal.installment_value) : null;
  const calcInstValue = instValue ?? (installments > 1 ? value / installments : null);
  const valueFormatted = value.toLocaleString("pt-PT", { minimumFractionDigits: 2 });
  const paymentTypeLabels: Record<string, string> = { fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado" };

  const docTypeLabels: Record<string, string> = { nif: "NIF", cpf: "CPF", passaporte: "Passaporte", cc: "Cartão de Cidadão", bi: "BI" };

  switch (block.type) {
    case "header":
      return `<div style="background: linear-gradient(135deg, ${headerColor}, ${accentColor}); color: white; padding: 50px 40px; text-align: center;">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="height: 48px; margin: 0 auto 12px; display: block; object-fit: contain;" />` : ""}
        <h1 style="margin: 0; font-size: 28px; letter-spacing: 3px;">${cName || "EMPRESA"}</h1>
        ${cTagline ? `<p style="margin: 5px 0 0; font-size: 12px; letter-spacing: 5px; color: #94a3b8; text-transform: uppercase;">${cTagline}</p>` : ""}
      </div>`;

    case "client_info": {
      const cn = escapeHtml(proposal.client_name);
      if (!cn) return "";
      const ce = escapeHtml(proposal.client_email);
      const cp = escapeHtml(proposal.client_phone);
      const ca = escapeHtml(proposal.client_address);
      const nationality = escapeHtml(proposal.client_nationality);
      const docType = proposal.client_document_type ? (docTypeLabels[proposal.client_document_type] ?? proposal.client_document_type) : "";
      const docNum = escapeHtml(proposal.client_document_number || proposal.client_document);
      const docValidity = proposal.client_document_validity ? new Date(proposal.client_document_validity).toLocaleDateString("pt-PT") : "";
      const docIssuer = escapeHtml(proposal.client_document_issuer);

      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Dados do Cliente</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px;">
          <div><span style="color: #64748b;">Nome:</span> ${cn}</div>
          ${nationality ? `<div><span style="color: #64748b;">Nacionalidade:</span> ${nationality}</div>` : ""}
          ${ce ? `<div><span style="color: #64748b;">Email:</span> ${ce}</div>` : ""}
          ${cp ? `<div><span style="color: #64748b;">Telefone:</span> ${cp}</div>` : ""}
          ${docNum ? `<div><span style="color: #64748b;">${escapeHtml(docType) || "Documento"}:</span> ${docNum}</div>` : ""}
          ${docValidity ? `<div><span style="color: #64748b;">Validade:</span> ${docValidity}</div>` : ""}
          ${docIssuer ? `<div><span style="color: #64748b;">Órgão Emissor:</span> ${docIssuer}</div>` : ""}
          ${ca ? `<div style="grid-column: span 2"><span style="color: #64748b;">Morada:</span> ${ca}</div>` : ""}
        </div>
      </div>`;
    }

    case "description": {
      const desc = escapeHtml(proposal.description || block.content?.text);
      if (!desc) return "";
      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">O Processo Inclui</div>
        <div style="font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${desc}</div>
      </div>`;
    }

    case "services_table":
      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Serviços</div>
        <div style="font-size: 14px;">${escapeHtml(proposal.description || "")}</div>
      </div>`;

    case "payment": {
      let paymentDetail = `<div style="color: #64748b; font-size: 14px; margin-top: 5px;">${paymentTypeLabels[proposal.payment_type] || escapeHtml(proposal.payment_type)}</div>`;
      if (upfrontValue) {
        paymentDetail += `<div style="color: #64748b; font-size: 14px; margin-top: 8px;">Entrada: <strong style="color: #1a1a1a;">€ ${upfrontValue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong></div>`;
      }
      if (calcInstValue && installments > 1) {
        paymentDetail += `<div style="color: #64748b; font-size: 14px; margin-top: 4px;">${installments}x de <strong style="color: #1a1a1a;">€ ${calcInstValue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong></div>`;
      }

      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Orçamento</div>
        <div style="background: #f8fafc; border-radius: 12px; padding: 30px; text-align: center; margin: 10px 0;">
          <div style="font-size: 36px; font-weight: bold; color: ${accentColor};">€ ${valueFormatted}</div>
          ${paymentDetail}
        </div>
      </div>`;
    }

    case "conditions": {
      const cond = block.content?.text
        ? escapeHtml(replacePlaceholders(block.content.text, ph))
        : escapeHtml(proposal.conditions);
      if (!cond) return "";
      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Condições</div>
        <div style="font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${cond}</div>
      </div>`;
    }

    case "clauses": {
      const items: any[] = block.content?.items ?? [];
      if (items.length === 0) return "";
      let clausesHtml = "";
      items.forEach((item: any, idx: number) => {
        const title = escapeHtml(item.title ?? "Título");
        const text = escapeHtml(replacePlaceholders(item.text ?? "", ph));
        clausesHtml += `<div style="margin-bottom: 16px;">
          <p style="font-size: 14px; font-weight: 600; margin: 0 0 4px;">Cláusula ${item.number ?? idx + 1}ª — ${title}</p>
          <p style="font-size: 12px; color: #475569; line-height: 1.6; white-space: pre-wrap; margin: 0;">${text}</p>
        </div>`;
      });
      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Cláusulas</div>
        ${clausesHtml}
      </div>`;
    }

    case "signature": {
      const today = new Date().toLocaleDateString("pt-PT");
      const location = block.content?.location ? escapeHtml(block.content.location) : "";
      const partyA = escapeHtml(block.content?.partyA ?? "CONTRATANTE");
      const partyB = escapeHtml(block.content?.partyB ?? "CONTRATADO");
      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Assinatura</div>
        ${location ? `<p style="text-align: center; color: #64748b; font-size: 12px; margin-bottom: 20px;">${location}${block.content?.showDate !== false ? `, ${today}` : ""}</p>` : ""}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px;">
          <div style="text-align: center;">
            <div style="border-bottom: 1px solid #cbd5e1; height: 50px; margin-bottom: 4px;"></div>
            <p style="font-size: 11px; font-weight: 600; text-transform: uppercase; margin: 0;">${partyA}</p>
            <p style="font-size: 11px; color: #64748b; margin: 2px 0 0;">${escapeHtml(proposal.client_name)}</p>
          </div>
          <div style="text-align: center;">
            <div style="border-bottom: 1px solid #cbd5e1; height: 50px; margin-bottom: 4px;"></div>
            <p style="font-size: 11px; font-weight: 600; text-transform: uppercase; margin: 0;">${partyB}</p>
            <p style="font-size: 11px; color: #64748b; margin: 2px 0 0;">Emmely Fernandes Advocacia</p>
          </div>
        </div>
      </div>`;
    }

    case "witnesses": {
      const count = block.content?.count ?? 2;
      let witnessHtml = "";
      for (let i = 0; i < count; i++) {
        witnessHtml += `<div style="text-align: center;">
          <div style="border-bottom: 1px solid #cbd5e1; height: 40px; margin-bottom: 4px;"></div>
          <p style="font-size: 11px; color: #64748b; margin: 0;">Testemunha ${i + 1}</p>
        </div>`;
      }
      return `<div style="padding: 20px 40px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Testemunhas</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px;">
          ${witnessHtml}
        </div>
      </div>`;
    }

    case "text": {
      const title = escapeHtml(block.content?.title);
      const text = escapeHtml(replacePlaceholders(block.content?.text ?? "", ph));
      if (!text && !title) return "";
      return `<div style="padding: 20px 40px;">
        ${title ? `<div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">${title}</div>` : ""}
        <div style="font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${text || ""}</div>
      </div>`;
    }

    case "footer":
      return `<div style="text-align: center; color: #94a3b8; font-size: 11px; padding: 20px; border-top: 1px solid #e2e8f0; margin-top: 20px;">
        ${escapeHtml(block.content?.text || cName)}
      </div>`;

    default:
      return "";
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposal_id } = await req.json();
    if (!proposal_id) throw new Error("proposal_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: proposal, error } = await supabase
      .from("proposals")
      .select("*")
      .eq("id", proposal_id)
      .single();
    if (error || !proposal) throw new Error("Proposal not found");

    let template: any = null;
    if (proposal.template_id) {
      const { data: tpl } = await supabase.from("proposal_templates").select("*").eq("id", proposal.template_id).single();
      template = tpl;
    }

    const composedTitle = [proposal.title, proposal.client_name].filter(Boolean).join(" — ");
    const ph = buildPdfPlaceholders(proposal);

    let html: string;

    if (template?.layout_blocks && Array.isArray(template.layout_blocks)) {
      const blocks = template.layout_blocks as LayoutBlock[];
      let bodyHtml = "";

      for (const block of blocks) {
        bodyHtml += renderBlockToHtml(block, proposal, template, ph);
        if (block.type === "header" && block.visible) {
          const validityHtml = proposal.valid_until
            ? `<div style="text-align: center; color: #64748b; font-size: 13px; margin-bottom: 20px;">Válida até ${new Date(proposal.valid_until).toLocaleDateString("pt-PT")}</div>`
            : "";
          bodyHtml += `<div style="padding: 20px 40px;">
            <div style="text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 5px;">${escapeHtml(composedTitle)}</div>
            ${validityHtml}
          </div>`;
        }
      }

      html = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>${escapeHtml(composedTitle || "Proposta")}</title><style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }
</style></head>
<body>${bodyHtml}</body></html>`;
    } else {
      // Fallback: original hardcoded layout (kept for backwards compat)
      const valueFormatted = Number(proposal.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 });
      const installments = proposal.installments || 1;
      const upfrontValue = proposal.upfront_value ? Number(proposal.upfront_value) : null;
      const instValue = proposal.installment_value ? Number(proposal.installment_value) : null;
      const calcInstValue = instValue ?? (installments > 1 ? proposal.value / installments : null);

      const clientName = escapeHtml(proposal.client_name);
      const clientEmail = escapeHtml(proposal.client_email);
      const clientPhone = escapeHtml(proposal.client_phone);
      const clientAddress = escapeHtml(proposal.client_address);
      const nationality = escapeHtml(proposal.client_nationality);
      const docTypeLabels: Record<string, string> = { nif: "NIF", cpf: "CPF", passaporte: "Passaporte", cc: "Cartão de Cidadão", bi: "BI" };
      const docType = proposal.client_document_type ? (docTypeLabels[proposal.client_document_type] ?? proposal.client_document_type) : "";
      const docNum = escapeHtml(proposal.client_document_number || proposal.client_document);
      const docValidity = proposal.client_document_validity ? new Date(proposal.client_document_validity).toLocaleDateString("pt-PT") : "";
      const docIssuer = escapeHtml(proposal.client_document_issuer);
      const description = escapeHtml(proposal.description);
      const conditions = escapeHtml(proposal.conditions);

      const hColor = template?.header_color || "#1e293b";
      const aColor = template?.accent_color || "#0f172a";
      const cName = escapeHtml(template?.company_name || "EMMELY FERNANDES");
      const cTagline = escapeHtml(template?.company_tagline || "Advocacia Internacional");
      const logoHtml = template?.logo_url ? `<img src="${escapeHtml(template.logo_url)}" alt="Logo" style="height: 48px; margin: 0 auto 12px; display: block;" />` : "";
      const paymentTypeLabels: Record<string, string> = { fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado" };

      let paymentDetailHtml = `<div class="budget-detail">${paymentTypeLabels[proposal.payment_type] || escapeHtml(proposal.payment_type)}</div>`;
      if (upfrontValue) {
        paymentDetailHtml += `<div class="budget-detail" style="margin-top: 8px;">Entrada: <strong>€ ${upfrontValue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong></div>`;
      }
      if (calcInstValue && installments > 1) {
        paymentDetailHtml += `<div class="budget-detail" style="margin-top: 4px;">${installments}x de <strong>€ ${calcInstValue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong></div>`;
      }

      html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(composedTitle || "Proposta")}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }
    .header { background: linear-gradient(135deg, ${hColor}, ${aColor}); color: white; padding: 50px 40px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; letter-spacing: 3px; }
    .header p { margin: 5px 0 0; font-size: 12px; letter-spacing: 5px; color: #94a3b8; text-transform: uppercase; }
    .content { padding: 40px; }
    .title { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 5px; }
    .validity { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 30px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
    .section { margin-bottom: 25px; }
    .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px; }
    .client-grid .label { color: #64748b; }
    .description { font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
    .budget-box { background: #f8fafc; border-radius: 12px; padding: 30px; text-align: center; margin: 20px 0; }
    .budget-value { font-size: 36px; font-weight: bold; color: ${aColor}; }
    .budget-detail { color: #64748b; font-size: 14px; margin-top: 5px; }
    .conditions { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
    .footer { text-align: center; color: #94a3b8; font-size: 11px; padding: 20px; border-top: 1px solid #e2e8f0; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <h1>${cName}</h1>
    <p>${cTagline}</p>
  </div>
  <div class="content">
    <div class="title">${escapeHtml(composedTitle)}</div>
    ${proposal.valid_until ? `<div class="validity">Válida até ${new Date(proposal.valid_until).toLocaleDateString("pt-PT")}</div>` : ""}

    ${clientName ? `
    <div class="section">
      <div class="section-title">Dados do Cliente</div>
      <div class="client-grid">
        <div><span class="label">Nome:</span> ${clientName}</div>
        ${nationality ? `<div><span class="label">Nacionalidade:</span> ${nationality}</div>` : ""}
        ${clientEmail ? `<div><span class="label">Email:</span> ${clientEmail}</div>` : ""}
        ${clientPhone ? `<div><span class="label">Telefone:</span> ${clientPhone}</div>` : ""}
        ${docNum ? `<div><span class="label">${escapeHtml(docType) || "Documento"}:</span> ${docNum}</div>` : ""}
        ${docValidity ? `<div><span class="label">Validade:</span> ${docValidity}</div>` : ""}
        ${docIssuer ? `<div><span class="label">Órgão Emissor:</span> ${docIssuer}</div>` : ""}
        ${clientAddress ? `<div style="grid-column: span 2"><span class="label">Morada:</span> ${clientAddress}</div>` : ""}
      </div>
    </div>` : ""}

    ${description ? `
    <div class="section">
      <div class="section-title">O Processo Inclui</div>
      <div class="description">${description}</div>
    </div>` : ""}

    <div class="section">
      <div class="section-title">Orçamento</div>
      <div class="budget-box">
        <div class="budget-value">€ ${valueFormatted}</div>
        ${paymentDetailHtml}
      </div>
    </div>

    ${conditions ? `
    <div class="section">
      <div class="section-title">Condições</div>
      <div class="conditions">${conditions}</div>
    </div>` : ""}
  </div>
  <div class="footer">${cName} — ${cTagline}</div>
</body>
</html>`;
    }

    // Store the HTML as a file in storage
    const fileName = `proposal-${proposal.id}.html`;
    const { error: uploadError } = await supabase.storage
      .from("proposal-files")
      .upload(fileName, new Blob([html], { type: "text/html; charset=utf-8" }), { upsert: true, contentType: "text/html; charset=utf-8" });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("proposal-files").getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    await supabase.from("proposals").update({ pdf_url: pdfUrl }).eq("id", proposal.id);

    return new Response(JSON.stringify({ pdf_url: pdfUrl, html, document_title: composedTitle || proposal.title || "Proposta" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
