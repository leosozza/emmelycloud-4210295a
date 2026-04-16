import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LateFeeConfig {
  penalty_pct: number;
  interest_monthly_pct: number;
  max_interest_days: number;
  grace_days: number;
}

const DEFAULT_LATE_FEE_CONFIG: LateFeeConfig = {
  penalty_pct: 10,
  interest_monthly_pct: 1,
  max_interest_days: 365,
  grace_days: 0,
};

function calculateLateFees(amount: number, daysLate: number, config: LateFeeConfig) {
  const effectiveDays = Math.max(0, daysLate - config.grace_days);
  const cappedDays = Math.min(effectiveDays, config.max_interest_days);
  if (cappedDays <= 0) return { daysLate: 0, penalty: 0, interest: 0, charges: 0, total: amount };
  const penalty = Math.round(amount * (config.penalty_pct / 100) * 100) / 100;
  const interest = Math.round(amount * (config.interest_monthly_pct / 100) * (cappedDays / 30) * 100) / 100;
  const charges = penalty + interest;
  return { daysLate: cappedDays, penalty, interest, charges, total: Math.round((amount + charges) * 100) / 100 };
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return dateStr; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("<h1>Token inválido</h1>", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Find receipt link
  const { data: link, error: linkErr } = await supabase
    .from("receipt_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (linkErr || !link) {
    return new Response("<h1>Comprovante não encontrado</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Fetch all financial records for this contract/deal
  let query = supabase.from("financial_records")
    .select("*")
    .order("installment_number", { ascending: true });

  if (link.contract_id) {
    query = query.eq("contract_id", link.contract_id);
  } else if (link.bitrix24_deal_id) {
    query = query.eq("bitrix24_deal_id", link.bitrix24_deal_id);
  } else {
    return new Response("<h1>Sem registos associados</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const { data: records } = await query;
  const installments = records || [];

  if (installments.length === 0) {
    return new Response("<h1>Nenhuma parcela encontrada</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Load late fee config
  let lateFeeConfig = DEFAULT_LATE_FEE_CONFIG;
  const { data: lfRow } = await supabase
    .from("payment_gateway_config")
    .select("config, is_active")
    .eq("gateway", "late_fees")
    .eq("is_active", true)
    .maybeSingle();
  if (lfRow?.config) {
    const c = lfRow.config as any;
    lateFeeConfig = {
      penalty_pct: c.penalty_pct ?? 10,
      interest_monthly_pct: c.interest_monthly_pct ?? 1,
      max_interest_days: c.max_interest_days ?? 365,
      grace_days: c.grace_days ?? 0,
    };
  }

  const now = new Date();
  const currency = installments[0]?.currency || "EUR";
  const totalValue = installments[0]?.total_value || installments.reduce((s: number, r: any) => s + (r.installment_value || 0), 0);

  // Build rows
  let totalCharges = 0;
  const rows = installments.map((rec: any) => {
    const value = rec.installment_value || 0;
    const isPaid = rec.status === "paga";
    // Detect overdue by due_date, not just status string
    const isOverdue = !isPaid && rec.due_date && new Date(rec.due_date) < now;
    // For paid installments, check if they were paid late
    const wasPaidLate = isPaid && rec.due_date && rec.paid_at && new Date(rec.paid_at) > new Date(rec.due_date);
    
    let lateFee = { daysLate: 0, penalty: 0, interest: 0, charges: 0, total: value };
    if (isOverdue && rec.due_date) {
      const daysLate = Math.floor((now.getTime() - new Date(rec.due_date).getTime()) / (1000 * 60 * 60 * 24));
      lateFee = calculateLateFees(value, daysLate, lateFeeConfig);
      totalCharges += lateFee.charges;
    } else if (wasPaidLate) {
      const daysLate = Math.floor((new Date(rec.paid_at).getTime() - new Date(rec.due_date).getTime()) / (1000 * 60 * 60 * 24));
      lateFee = calculateLateFees(value, daysLate, lateFeeConfig);
    }

    const statusLabel = isPaid ? "PAGO" : isOverdue ? "ATRASADO" : "PENDENTE";
    const statusColor = isPaid ? "#10b981" : isOverdue ? "#ef4444" : "#f59e0b";
    const statusBg = isPaid ? "#ecfdf5" : isOverdue ? "#fef2f2" : "#fffbeb";
    
    const jurosCell = lateFee.charges > 0 
      ? formatCurrency(lateFee.charges, currency) 
      : "—";

    const paidAmount = isPaid ? formatCurrency(value, currency) : "—";

    const payButton = !isPaid
      ? `<button class="btn-pay" data-record-id="${rec.id}" onclick="payInstallment(this)">💳 Pagar</button>`
      : "";

    return `<tr>
      <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:center;font-weight:600">${rec.installment_number || 1}/${rec.total_installments || 1}</td>
      <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:center">${formatDate(rec.due_date)}</td>
      <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:right">${formatCurrency(value, currency)}</td>
      <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:right;color:${lateFee.charges > 0 ? '#ef4444' : '#6b7280'}">${jurosCell}</td>
      <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:600;color:${isPaid ? '#10b981' : '#6b7280'}">${paidAmount}</td>
      <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:center">${formatDate(rec.paid_at)}</td>
      <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap">
        <span style="background:${statusBg};color:${statusColor};font-weight:700;font-size:11px;padding:3px 10px;border-radius:12px;display:inline-block">${statusLabel}</span>
        ${payButton ? `<div style="margin-top:6px">${payButton}</div>` : ""}
      </td>
    </tr>`;
  }).join("");

  const paidTotal = installments.filter((r: any) => r.status === "paga").reduce((s: number, r: any) => s + (r.installment_value || 0), 0);
  const openBase = installments.filter((r: any) => r.status !== "paga").reduce((s: number, r: any) => s + (r.installment_value || 0), 0);
  const openTotal = openBase + totalCharges;
  const paidCount = installments.filter((r: any) => r.status === "paga").length;
  const today = formatDate(now.toISOString());

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Controle de Parcelas — ${(link.client_name || "").replace(/</g, "&lt;")}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 0; color: #333; background: #f8fafc; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; min-height: 100vh; }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); color: white; padding: 32px 40px; }
    .header h1 { font-size: 20px; margin: 0; letter-spacing: 2px; font-weight: 800; }
    .header p { margin: 4px 0 0; font-size: 11px; letter-spacing: 4px; color: #94a3b8; text-transform: uppercase; }
    .content { padding: 32px 40px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px; font-size: 13px; }
    .info-grid .label { color: #64748b; }
    .info-grid .value { font-weight: 600; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { padding: 16px; border-radius: 10px; text-align: center; }
    .summary-card.total { background: #eff6ff; }
    .summary-card.paid { background: #ecfdf5; }
    .summary-card.open { background: #fef2f2; }
    .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 700; margin-bottom: 4px; }
    .summary-value { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
    .summary-card.paid .summary-value { color: #059669; }
    .summary-card.open .summary-value { color: #dc2626; }
    .progress { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 24px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #06b6d4); border-radius: 4px; transition: width 0.5s; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 24px; font-size: 12px; }
    th { background: #f1f5f9; padding: 10px 12px; border: 1px solid #e5e7eb; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; font-weight: 700; }
    .footer { text-align: center; color: #94a3b8; font-size: 10px; padding: 24px 40px; border-top: 1px solid #e5e7eb; line-height: 1.8; }
    .btn-print { display: inline-flex; align-items: center; gap: 6px; background: #1e293b; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 24px; }
    .btn-print:hover { background: #334155; }
    .btn-pay { background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 4px rgba(16,185,129,0.3); transition: all 0.2s; }
    .btn-pay:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(16,185,129,0.4); }
    .btn-pay:disabled { opacity: 0.6; cursor: wait; }
    .pay-notice { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: #065f46; }
    @media print {
      body { background: white; }
      .container { box-shadow: none; }
      .btn-print, .btn-pay, .pay-notice { display: none !important; }
      .content { padding: 20px 30px; }
    }
    @media (max-width: 600px) {
      .content { padding: 20px; }
      .header { padding: 24px 20px; }
      .summary { grid-template-columns: 1fr; }
      .info-grid { grid-template-columns: 1fr; }
      table { font-size: 10px; }
      th, td { padding: 6px 8px !important; }
    }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>EMMELY FERNANDES</h1>
    <p>Advocacia Internacional</p>
  </div>
  <div class="content">
    <button class="btn-print" onclick="window.print()">📥 Baixar / Imprimir PDF</button>

    ${installments.some((r: any) => r.status !== "paga") ? `<div class="pay-notice">💳 <strong>Clique em "Pagar"</strong> em qualquer parcela em aberto para gerar o link de cobrança imediatamente (Multibanco, MB Way, Pix ou Cartão).</div>` : ""}

    <div class="info-grid">
      <div><span class="label">Cliente:</span> <span class="value">${(link.client_name || "—").replace(/</g, "&lt;")}</span></div>
      <div><span class="label">Serviço:</span> <span class="value">${(link.deal_title || "—").replace(/</g, "&lt;")}</span></div>
      <div><span class="label">Data:</span> <span class="value">${today}</span></div>
      <div><span class="label">Parcelas:</span> <span class="value">${paidCount}/${installments.length} pagas</span></div>
    </div>

    <div class="summary">
      <div class="summary-card total">
        <div class="summary-label">Total</div>
        <div class="summary-value">${formatCurrency(totalValue, currency)}</div>
      </div>
      <div class="summary-card paid">
        <div class="summary-label">Pago</div>
        <div class="summary-value">${formatCurrency(paidTotal, currency)}</div>
      </div>
      <div class="summary-card open">
        <div class="summary-label">Em Aberto${totalCharges > 0 ? ' (c/ juros)' : ''}</div>
        <div class="summary-value">${formatCurrency(openTotal, currency)}</div>
      </div>
    </div>

    <div class="progress">
      <div class="progress-fill" style="width:${totalValue > 0 ? Math.round((paidTotal / totalValue) * 100) : 0}%"></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Parcela</th>
          <th>Vencimento</th>
          <th>Valor</th>
          <th>Juros/Multa</th>
          <th>Pago</th>
          <th>Data Pgto</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="footer">
    Emmely Fernandes Advocacia Internacional<br>
    Documento gerado automaticamente em ${today}<br>
    Este comprovante é atualizado em tempo real.
  </div>
</div>
<script>
  const RECEIPT_TOKEN = ${JSON.stringify(token)};
  const PAYMENT_API = ${JSON.stringify(`${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-create-link`)};

  async function payInstallment(btn) {
    const recordId = btn.getAttribute('data-record-id');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Aguarde...';
    try {
      const res = await fetch(PAYMENT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: RECEIPT_TOKEN, financial_record_id: recordId }),
      });
      const data = await res.json();
      if (!res.ok || !data.payment_url) {
        alert('Erro ao gerar pagamento: ' + (data.error || 'desconhecido'));
        btn.disabled = false;
        btn.innerHTML = original;
        return;
      }
      window.location.href = data.payment_url;
    } catch (e) {
      alert('Erro de rede: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
});
