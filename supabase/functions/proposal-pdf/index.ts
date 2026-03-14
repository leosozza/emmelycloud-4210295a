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

    const paymentTypeLabels: Record<string, string> = {
      fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado",
    };

    const valueFormatted = Number(proposal.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 });
    const installmentValue = proposal.installments > 1
      ? (proposal.value / proposal.installments).toLocaleString("pt-PT", { minimumFractionDigits: 2 })
      : null;

    // Sanitize all user-provided fields
    const title = escapeHtml(proposal.title);
    const clientName = escapeHtml(proposal.client_name);
    const clientEmail = escapeHtml(proposal.client_email);
    const clientPhone = escapeHtml(proposal.client_phone);
    const clientDocument = escapeHtml(proposal.client_document);
    const clientAddress = escapeHtml(proposal.client_address);
    const description = escapeHtml(proposal.description);
    const conditions = escapeHtml(proposal.conditions);

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); color: white; padding: 50px 40px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; letter-spacing: 3px; }
    .header p { margin: 5px 0 0; font-size: 12px; letter-spacing: 5px; color: #94a3b8; text-transform: uppercase; }
    .header .tagline { margin-top: 20px; font-style: italic; color: #cbd5e1; font-size: 13px; }
    .content { padding: 40px; }
    .title { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 5px; }
    .validity { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 30px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
    .section { margin-bottom: 25px; }
    .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px; }
    .client-grid .label { color: #64748b; }
    .description { font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
    .budget-box { background: #f8fafc; border-radius: 12px; padding: 30px; text-align: center; margin: 20px 0; }
    .budget-value { font-size: 36px; font-weight: bold; color: #0f172a; }
    .budget-detail { color: #64748b; font-size: 14px; margin-top: 5px; }
    .conditions { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
    .footer { text-align: center; color: #94a3b8; font-size: 11px; padding: 20px; border-top: 1px solid #e2e8f0; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>EMMELY FERNANDES</h1>
    <p>Advocacia Internacional</p>
    <div class="tagline">Mais do que processos, cuidamos de pessoas e dos seus direitos.</div>
  </div>
  <div class="content">
    <div class="title">${title}</div>
    ${proposal.valid_until ? `<div class="validity">Válida até ${new Date(proposal.valid_until).toLocaleDateString("pt-PT")}</div>` : ""}

    ${clientName ? `
    <div class="section">
      <div class="section-title">Dados do Cliente</div>
      <div class="client-grid">
        <div><span class="label">Nome:</span> ${clientName}</div>
        ${clientEmail ? `<div><span class="label">Email:</span> ${clientEmail}</div>` : ""}
        ${clientPhone ? `<div><span class="label">Telefone:</span> ${clientPhone}</div>` : ""}
        ${clientDocument ? `<div><span class="label">Documento:</span> ${clientDocument}</div>` : ""}
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
        <div class="budget-detail">
          ${paymentTypeLabels[proposal.payment_type] || escapeHtml(proposal.payment_type)}
          ${installmentValue ? ` — ${proposal.installments}x de € ${installmentValue}` : ""}
        </div>
      </div>
    </div>

    ${conditions ? `
    <div class="section">
      <div class="section-title">Condições</div>
      <div class="conditions">${conditions}</div>
    </div>` : ""}
  </div>
  <div class="footer">Emmely Fernandes — Advocacia Internacional</div>
</body>
</html>`;

    // Store the HTML as a file in storage
    const fileName = `proposal-${proposal.id}.html`;
    const { error: uploadError } = await supabase.storage
      .from("proposal-files")
      .upload(fileName, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html" });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("proposal-files").getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    // Update proposal with pdf_url
    await supabase.from("proposals").update({ pdf_url: pdfUrl }).eq("id", proposal.id);

    return new Response(JSON.stringify({ pdf_url: pdfUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
