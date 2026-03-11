import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cspValue = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "connect-src *",
  "frame-ancestors *",
  "font-src * data:",
].join("; ");

const htmlHeaders = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspValue,
  "X-Frame-Options": "ALLOWALL",
};

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return integration.access_token;
  }
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh: ${data.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return data.access_token;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(value);
}

function icon(name: string, size = 14): string {
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0"`;
  const icons: Record<string, string> = {
    bank: `<svg ${s}><rect x="1" y="6" width="22" height="15" rx="2"/><path d="M1 10h22"/><path d="M7 15h0"/><path d="M12 15h0"/></svg>`,
    "credit-card": `<svg ${s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    calendar: `<svg ${s}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    clock: `<svg ${s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    pencil: `<svg ${s}><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    link: `<svg ${s}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    check: `<svg ${s}><polyline points="20 6 9 17 4 12"/></svg>`,
    "check-circle": `<svg ${s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    send: `<svg ${s}><path d="m22 2-7 20-4-9-9-4Z"/><path d="m22 2-11 11"/></svg>`,
    "alert-triangle": `<svg ${s}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    "file-text": `<svg ${s}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
    paperclip: `<svg ${s}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    building: `<svg ${s}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`,
  };
  return icons[name] || "";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return dateStr; }
}

interface InstallmentData {
  id: string;
  number: number;
  total: number;
  value: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  currency: string;
  description: string;
  transaction_id?: string;
  payment_url?: string;
  is_down_payment?: boolean;
  invoice_id?: number;
  is_direct?: boolean;
  company_name?: string;
  payment_method?: string;
  metadata?: any;
}

function getStatusColor(status: string): { bg: string; bgDark: string; text: string; textDark: string; label: string } {
  switch (status) {
    case "paga":
      return { bg: "#e0f5d7", bgDark: "#2a4a2a", text: "#589731", textDark: "#8bc34a", label: "Pago" };
    case "atrasada":
      return { bg: "#fce4e1", bgDark: "#4a2a2a", text: "#df532d", textDark: "#ef5350", label: "Em Atraso" };
    case "vencendo":
      return { bg: "#fef4d6", bgDark: "#4a4229", text: "#c49c00", textDark: "#ffd54f", label: "Vencendo" };
    default:
      return { bg: "#eef2f4", bgDark: "#33444f", text: "#959ca4", textDark: "#7b8b97", label: "Pendente" };
  }
}

function renderPaymentTab(opts: {
  entityId: string;
  dealTitle: string;
  totalValue: number;
  paidValue: number;
  openValue: number;
  currency: string;
  installments: InstallmentData[];
  supabaseUrl: string;
  memberId: string;
  flows: { id: string; name: string }[];
  contactPhone: string;
  noData: boolean;
  gateway?: string;
  paymentMethod?: string;
  nextDueDate?: string | null;
  createdAt?: string | null;
}): string {
  const { dealTitle, totalValue, paidValue, openValue, currency, installments, supabaseUrl, memberId, flows, contactPhone, noData } = opts;
  const EUR_TO_BRL = 6.10;

  const paidPct = totalValue > 0 ? Math.round((paidValue / totalValue) * 100) : 0;

  const installmentRows = installments.map((inst) => {
    const statusClass = inst.status === "paga" ? "status-paga" : inst.status === "atrasada" ? "status-atrasada" : inst.status === "vencendo" ? "status-vencendo" : "status-pendente";
    const s = getStatusColor(inst.status);
    const flowOptions = flows.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
    const label = inst.is_down_payment ? "Entrada" : `Parcela ${inst.number}/${inst.total}`;
    const totalLabel = inst.total > 1 ? `<span class="b24-item-total">Total: ${formatCurrency(inst.value * inst.total, inst.currency)}</span>` : "";

    // Missing fields detection
    const missingFields: string[] = [];
    if (!inst.due_date) missingFields.push("vencimento");
    if (!inst.payment_method || inst.payment_method === "card") { /* card is default, not necessarily missing */ }
    if (!inst.value || inst.value <= 0) missingFields.push("valor");
    const hasMissing = missingFields.length > 0 && inst.status !== "paga";
    const missingClass = hasMissing ? " has-missing" : "";
    const missingIndicator = hasMissing ? `<span class="b24-missing-icon" title="Campos em falta: ${missingFields.join(', ')}">${icon("alert-triangle", 12)} ${missingFields.length} campo(s)</span>` : "";

    // Discount/paid info from metadata
    const meta = inst.metadata || {};
    const discountInfo = meta.discount_amount > 0 ? `<span style="color:#e6a817;font-size:11px">Desconto: ${formatCurrency(meta.discount_amount, inst.currency)} — ${meta.discount_reason || ''}</span>` : "";
    const paidAmountInfo = meta.paid_amount != null && inst.status === "paga" ? `<span style="color:var(--value-paid);font-size:11px">Pago: ${formatCurrency(meta.paid_amount, inst.currency)}</span>` : "";
    const proofInfo = meta.proof_url ? `<a href="${meta.proof_url}" target="_blank" class="b24-link" style="font-size:11px">${icon("paperclip", 12)} Comprovante</a>` : "";

    // Serialize installment data for JS
    const instJson = JSON.stringify({
      id: inst.id,
      transaction_id: inst.transaction_id,
      entity_id: opts.entityId,
      value: inst.value,
      due_date: inst.due_date,
      payment_method: inst.payment_method || "card",
      currency: inst.currency,
      invoice_id: inst.invoice_id,
      description: inst.description,
      notes: meta.notes || "",
    }).replace(/"/g, "&quot;");

    // Dual currency display
    const valueBRL = inst.currency === "EUR" ? inst.value * EUR_TO_BRL : inst.value;
    const valueEUR = inst.currency === "BRL" ? inst.value / EUR_TO_BRL : inst.value;
    const dualDisplay = inst.currency === "EUR"
      ? `<span class="b24-dual-currency">≈ ${formatCurrency(valueBRL, "BRL")}</span>`
      : `<span class="b24-dual-currency">≈ ${formatCurrency(valueEUR, "EUR")}</span>`;

    return `
      <div class="b24-item ${statusClass}${missingClass}">
        <div class="b24-item-row">
          <div class="b24-item-left">
            <span class="b24-item-title">${label}</span>
            <span class="b24-item-value">${formatCurrency(inst.value, inst.currency)}</span>
            ${dualDisplay}
            ${missingIndicator}
          </div>
          <span class="b24-badge" style="--badge-bg:${s.bg};--badge-bg-dark:${s.bgDark};--badge-text:${s.text};--badge-text-dark:${s.textDark}">${s.label}</span>
        </div>
        ${inst.company_name ? `<div class="b24-item-meta"><span style="font-weight:600">${icon("building", 13)} ${inst.company_name}</span></div>` : ""}
        <div class="b24-item-meta">
          ${inst.due_date
            ? `<span>${icon("calendar", 13)} Vence: ${formatDate(inst.due_date)}</span>`
            : `<span onclick='openEditModal(${instJson})' class="b24-missing b24-clickable" title="Clique para definir">${icon("calendar", 13)} Vencimento: ${icon("alert-triangle", 11)} Definir</span>`}
          ${inst.paid_at ? `<span>${icon("check-circle", 13)} Pago: ${formatDate(inst.paid_at)}</span>` : ""}
          ${inst.payment_method
            ? `<span>${icon("credit-card", 13)} ${inst.payment_method}</span>`
            : `<span onclick='openEditModal(${instJson})' class="b24-missing b24-clickable" title="Clique para definir">${icon("credit-card", 13)} Método: ${icon("alert-triangle", 11)} Definir</span>`}
          ${totalLabel}
        </div>
        ${discountInfo || paidAmountInfo || proofInfo ? `<div class="b24-item-meta">${paidAmountInfo} ${discountInfo} ${proofInfo}</div>` : ""}
        ${inst.description ? `<div class="b24-item-desc">${inst.description}</div>` : ""}
        ${inst.payment_url && inst.status !== "paga" ? `<div class="b24-link-row"><a href="${inst.payment_url}" target="_blank" class="b24-link">Link de pagamento</a><button class="b24-btn-copy" onclick="copyLink(this,'${inst.payment_url.replace(/'/g, "\\'")}')" title="Copiar link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>` : ""}
        ${inst.invoice_id ? `<div class="b24-link-row"><a href="javascript:void(0)" onclick="openInvoice(${inst.invoice_id})" class="b24-link">${icon("file-text", 13)} Ver Fatura #${inst.invoice_id}</a></div>` : ""}
        ${inst.status !== "paga" ? `
          <div class="b24-item-actions">
            <button onclick='openEditModal(${instJson})' class="b24-btn-action" title="Editar Parcela">${icon("pencil", 13)} Editar</button>
            <button onclick='generatePaymentLink(${instJson})' class="b24-btn-action" title="Gerar Link de Pagamento">${icon("link", 13)} Link</button>
            <button onclick='openBaixaModal(${instJson})' class="b24-btn-action b24-btn-baixa" title="Dar Baixa">${icon("check", 13)} Baixa</button>
            ${contactPhone && flows.length > 0 ? `<button onclick='toggleFlowRow("${inst.id}")' class="b24-btn-action b24-btn-fluxo" title="Enviar Fluxo">${icon("send", 13)} Fluxo</button>` : ""}
          </div>
          ${contactPhone && flows.length > 0 ? `
          <div class="b24-item-actions" id="flow-row-${inst.id}" style="display:none">
            <select id="flow-${inst.id}" class="b24-select">
              <option value="">Selecionar fluxo...</option>
              ${flowOptions}
            </select>
            <button onclick="triggerFlow('${inst.id}','${contactPhone}',${inst.number})" class="b24-btn-emmely">Enviar</button>
            <button onclick='toggleFlowRow("${inst.id}")' class="b24-btn-outline" style="height:32px;padding:0 10px">✕</button>
          </div>
          ` : ""}
        ` : ""}
      </div>`;
  }).join("");

  const noDataHtml = `
    <div class="b24-empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      <div class="b24-empty-title">Nenhum pagamento registado</div>
      <div class="b24-empty-desc">Este negócio ainda não possui registos financeiros associados.</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Emmely Pay</title>
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    :root {
      --bg-page: #f4f6f8;
      --bg-card: #ffffff;
      --text-primary: #111827;
      --text-secondary: #6b7280;
      --text-tertiary: #9ca3af;
      --border-color: #e5e7eb;
      --border-light: #f3f4f6;
      --progress-bg: #e5e7eb;
      --progress-fill: linear-gradient(90deg, #3b82f6, #06b6d4);
      --progress-fill-flat: #3b82f6;
      --link-color: #2563eb;
      --value-paid: #059669;
      --value-open: #dc2626;
      --accent-paid: #10b981;
      --accent-pending: #f59e0b;
      --accent-overdue: #ef4444;
      --accent-default: #cbd5e1;
      --shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --shadow-lg: 0 8px 24px rgba(0,0,0,0.1);
      --radius: 10px;
      --radius-sm: 6px;
      --stat-total-bg: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      --stat-total-icon: #3b82f6;
      --stat-paid-bg: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
      --stat-paid-icon: #10b981;
      --stat-open-bg: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%);
      --stat-open-icon: #ef4444;
      --stat-total-bg-flat: #eff6ff;
      --stat-paid-bg-flat: #ecfdf5;
      --stat-open-bg-flat: #fef2f2;
    }
    body.dark {
      --bg-page: #0f172a;
      --bg-card: #1e293b;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-tertiary: #64748b;
      --border-color: #334155;
      --border-light: #1e293b;
      --progress-bg: #334155;
      --progress-fill: linear-gradient(90deg, #60a5fa, #22d3ee);
      --progress-fill-flat: #60a5fa;
      --link-color: #60a5fa;
      --value-paid: #34d399;
      --value-open: #f87171;
      --accent-paid: #34d399;
      --accent-pending: #fbbf24;
      --accent-overdue: #f87171;
      --accent-default: #475569;
      --shadow-xs: 0 1px 2px rgba(0,0,0,0.2);
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.2);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
      --shadow-lg: 0 8px 24px rgba(0,0,0,0.4);
      --stat-total-bg: linear-gradient(135deg, #1e293b 0%, #1e3a5f 100%);
      --stat-total-icon: #60a5fa;
      --stat-paid-bg: linear-gradient(135deg, #1e293b 0%, #064e3b 100%);
      --stat-paid-icon: #34d399;
      --stat-open-bg: linear-gradient(135deg, #1e293b 0%, #7f1d1d 100%);
      --stat-open-icon: #f87171;
      --stat-total-bg-flat: #1e293b;
      --stat-paid-bg-flat: #1e293b;
      --stat-open-bg-flat: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 13px; background: var(--bg-page); color: var(--text-primary); line-height: 1.5;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    #app { display: flex; flex-direction: column; min-height: 100vh; }

    /* ── Summary ── */
    .b24-summary { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 20px 24px 16px; }
    .b24-summary-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; letter-spacing: -0.01em; }
    .b24-summary-title svg { opacity: 0.7; }
    .b24-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
    .b24-summary-item { background: var(--stat-total-bg); border-radius: var(--radius); padding: 14px 16px; transition: box-shadow 0.2s, transform 0.15s; position: relative; overflow: hidden; }
    .b24-summary-item::before { content: ''; position: absolute; top: 0; right: 0; width: 60px; height: 60px; border-radius: 50%; opacity: 0.07; transform: translate(15px, -15px); }
    .b24-summary-item:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .b24-summary-item.stat-paid { background: var(--stat-paid-bg); }
    .b24-summary-item.stat-open { background: var(--stat-open-bg); }
    .b24-summary-item::before { background: var(--stat-total-icon); }
    .b24-summary-item.stat-paid::before { background: var(--stat-paid-icon); }
    .b24-summary-item.stat-open::before { background: var(--stat-open-icon); }
    .b24-summary-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; background: rgba(59,130,246,0.1); color: var(--stat-total-icon); }
    .stat-paid .b24-summary-icon { background: rgba(16,185,129,0.1); color: var(--stat-paid-icon); }
    .stat-open .b24-summary-icon { background: rgba(239,68,68,0.1); color: var(--stat-open-icon); }
    .b24-summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-tertiary); margin-bottom: 4px; }
    .b24-summary-value { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
    .b24-summary-value .b24-dual-currency { margin-left: 4px; }
    .b24-progress-wrap { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
    .b24-progress { flex: 1; height: 8px; background: var(--progress-bg); border-radius: 4px; overflow: hidden; }
    .b24-progress-fill { height: 100%; background: var(--progress-fill); border-radius: 4px; transition: width 0.8s cubic-bezier(0.22,1,0.36,1); position: relative; }
    .b24-progress-fill::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%); animation: shimmer 2s infinite; }
    @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    .b24-progress-label { font-size: 12px; font-weight: 800; color: var(--text-primary); white-space: nowrap; min-width: 36px; text-align: right; }

    /* ── Summary info pills ── */
    .b24-summary-info { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-light); }
    .b24-summary-info span { display: inline-flex; align-items: center; gap: 5px; background: var(--bg-page); border: 1px solid var(--border-color); border-radius: 20px; padding: 5px 14px 5px 10px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; transition: all 0.15s; }
    .b24-summary-info span:hover { border-color: var(--progress-fill-flat); background: var(--stat-total-bg-flat); }
    .b24-summary-info strong { font-weight: 700; color: var(--text-primary); }

    /* ── List ── */
    .b24-list { padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; }
    .b24-item { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 16px 18px; border-left: 5px solid var(--accent-default); box-shadow: var(--shadow-xs); transition: box-shadow 0.2s, transform 0.15s, border-color 0.2s; }
    .b24-item:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
    .b24-item.status-paga { border-left-color: var(--accent-paid); }
    .b24-item.status-atrasada { border-left-color: var(--accent-overdue); }
    .b24-item.status-vencendo { border-left-color: var(--accent-pending); }
    .b24-item.status-pendente { border-left-color: var(--accent-default); }
    .b24-item.has-missing { border-left-color: var(--accent-pending); background: linear-gradient(135deg, var(--bg-card) 95%, rgba(245,158,11,0.05) 100%); }
    .b24-item-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .b24-item-left { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .b24-item-title { font-size: 13px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
    .b24-item-value { font-size: 16px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
    .b24-missing-icon { color: #f59e0b; font-size: 11px; cursor: help; display: inline-flex; align-items: center; gap: 3px; background: rgba(245,158,11,0.08); padding: 2px 8px; border-radius: 12px; }
    .b24-badge { display: inline-flex; align-items: center; background: var(--badge-bg); color: var(--badge-text); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; white-space: nowrap; letter-spacing: 0.3px; text-transform: uppercase; }
    body.dark .b24-badge { background: var(--badge-bg-dark); color: var(--badge-text-dark); }
    .b24-item-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; flex-wrap: wrap; align-items: center; }
    .b24-item-meta span { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; }
    .b24-item-meta .b24-missing { color: #f59e0b; font-weight: 600; }
    .b24-item-total { font-weight: 600; color: var(--text-primary); font-size: 11px; }
    .b24-item-desc { font-size: 11px; color: var(--text-tertiary); font-style: italic; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-light); }
    .b24-link-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; margin-top: 6px; }
    .b24-link { font-size: 12px; color: var(--link-color); text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; transition: opacity 0.15s; }
    .b24-link:hover { text-decoration: underline; opacity: 0.85; }
    .b24-btn-copy { background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 4px 8px; cursor: pointer; color: var(--text-secondary); display: inline-flex; align-items: center; transition: all 0.15s; }
    .b24-btn-copy:hover { background: var(--bg-page); color: var(--text-primary); border-color: var(--text-secondary); }
    .b24-btn-copy.copied { border-color: var(--accent-paid); color: var(--accent-paid); }

    /* ── Action buttons ── */
    .b24-item-actions { display: flex; gap: 8px; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light); }
    .b24-select { flex: 1; height: 34px; font-size: 13px; font-family: inherit; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0 10px; background: var(--bg-card); color: var(--text-primary); outline: none; transition: all 0.15s; }
    .b24-select:focus { border-color: var(--progress-fill-flat); box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
    .b24-btn-emmely { background: #2563eb; color: #fff; border: none; padding: 0 16px; height: 34px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
    .b24-btn-emmely:hover { background: #1d4ed8; box-shadow: 0 2px 8px rgba(37,99,235,0.3); }
    .b24-btn-primary { background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; border: none; padding: 0 20px; height: 36px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(37,99,235,0.2); }
    .b24-btn-primary:hover { background: linear-gradient(135deg, #2563eb, #1d4ed8); box-shadow: 0 4px 12px rgba(37,99,235,0.3); transform: translateY(-1px); }
    .b24-btn-primary:active { transform: translateY(0); }
    .b24-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .b24-btn-outline { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0 16px; height: 36px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.15s; }
    .b24-btn-outline:hover { background: var(--bg-page); border-color: var(--text-secondary); }

    .b24-create-bar { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 12px 24px; display: flex; justify-content: flex-end; }
    .b24-form-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; justify-content: center; align-items: center; backdrop-filter: blur(4px); }
    .b24-form-overlay.active { display: flex; }
    .b24-form-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; width: 440px; max-width: 92vw; max-height: 85vh; overflow-y: auto; box-shadow: var(--shadow-lg); }
    .b24-form-title { font-size: 16px; font-weight: 800; margin-bottom: 20px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; letter-spacing: -0.02em; }
    .b24-form-group { margin-bottom: 14px; }
    .b24-form-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-tertiary); margin-bottom: 5px; }
    .b24-input { width: 100%; height: 36px; font-size: 13px; font-family: inherit; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0 12px; background: var(--bg-card); color: var(--text-primary); outline: none; box-sizing: border-box; transition: border-color 0.15s, box-shadow 0.15s; }
    .b24-input:focus { border-color: var(--progress-fill-flat); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
    .b24-form-row { display: flex; gap: 12px; }
    .b24-form-row > * { flex: 1; }
    .b24-form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
    .b24-form-hint { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; }
    .b24-discount-row { background: #fef9c3; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; font-size: 12px; color: #92400e; }
    body.dark .b24-discount-row { background: #422006; color: #fbbf24; border-color: #92400e; }
    .b24-readonly { font-size: 18px; font-weight: 800; color: var(--text-primary); padding: 6px 0; letter-spacing: -0.02em; }
    .b24-dual-currency { font-size: 10px; color: var(--text-tertiary); font-weight: 400; white-space: nowrap; }
    .b24-dates-preview { background: var(--bg-page); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; margin-top: 8px; font-size: 12px; }
    .b24-dates-preview div { padding: 3px 0; color: var(--text-secondary); }

    .b24-btn-action { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 14px; font-size: 12px; font-family: inherit; cursor: pointer; color: var(--text-primary); transition: all 0.15s; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
    .b24-btn-action:hover { background: var(--bg-page); border-color: var(--text-secondary); box-shadow: var(--shadow-xs); }
    .b24-btn-baixa { border-color: var(--accent-paid); color: var(--accent-paid); }
    .b24-btn-baixa:hover { background: var(--stat-paid-bg-flat); box-shadow: 0 2px 8px rgba(16,185,129,0.15); }
    .b24-btn-fluxo { border-color: var(--link-color); color: var(--link-color); }
    .b24-btn-fluxo:hover { background: var(--stat-total-bg-flat); box-shadow: 0 2px 8px rgba(37,99,235,0.15); }
    .b24-clickable { cursor: pointer; text-decoration: underline dotted; }
    .b24-clickable:hover { opacity: 0.7; }

    .b24-empty { text-align: center; padding: 72px 24px; color: var(--text-secondary); }
    .b24-empty svg { margin: 0 auto 20px; display: block; opacity: 0.2; }
    .b24-empty-title { font-size: 16px; font-weight: 800; margin-bottom: 8px; color: var(--text-primary); letter-spacing: -0.02em; }
    .b24-empty-desc { font-size: 13px; max-width: 300px; margin: 0 auto; line-height: 1.6; }

    #status-msg { font-size: 12px; color: var(--text-secondary); text-align: center; padding: 10px 24px; min-height: 20px; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
  </style>
</head>
<body>
<div id="app">
  <div class="b24-create-bar">
    <button class="b24-btn-primary" onclick="openCreateForm()">${icon("file-text", 14)} Criar Cobrança</button>
  </div>
  ${noData ? noDataHtml : `
  <div class="b24-summary">
    <div class="b24-summary-title">${icon("bank", 16)} Emmely Pay — ${(dealTitle || "Negócio").replace(/</g, "&lt;")}</div>
    <div class="b24-summary-grid">
      <div class="b24-summary-item">
        <div class="b24-summary-label">Total</div>
        <div class="b24-summary-value">${formatCurrency(totalValue, currency)} <span class="b24-dual-currency">≈ ${formatCurrency(totalValue * EUR_TO_BRL, "BRL")}</span></div>
      </div>
      <div class="b24-summary-item stat-paid">
        <div class="b24-summary-label">Pago</div>
        <div class="b24-summary-value" style="color:var(--value-paid)">${formatCurrency(paidValue, currency)} <span class="b24-dual-currency">≈ ${formatCurrency(paidValue * EUR_TO_BRL, "BRL")}</span></div>
      </div>
      <div class="b24-summary-item stat-open">
        <div class="b24-summary-label">Em Aberto</div>
        <div class="b24-summary-value" style="color:${openValue > 0 ? 'var(--value-open)' : 'var(--value-paid)'}">${formatCurrency(openValue, currency)} <span class="b24-dual-currency">≈ ${formatCurrency(openValue * EUR_TO_BRL, "BRL")}</span></div>
      </div>
    </div>
    <div class="b24-progress-wrap">
      <div class="b24-progress">
        <div class="b24-progress-fill" style="width:${paidPct}%"></div>
      </div>
      <div class="b24-progress-label">${paidPct}%</div>
    </div>
    <div class="b24-summary-info">
      <span>${icon("bank", 13)} Gateway: <strong>${opts.gateway || "—"}</strong></span>
      <span>${icon("credit-card", 13)} Método: <strong>${opts.paymentMethod || "—"}</strong></span>
      ${opts.nextDueDate ? `<span>${icon("calendar", 13)} Próx. vencimento: <strong>${formatDate(opts.nextDueDate)}</strong></span>` : `<span>${icon("calendar", 13)} Próx. vencimento: <strong>—</strong></span>`}
      <span>${icon("clock", 13)} Criado: <strong>${opts.createdAt ? formatDate(opts.createdAt) : "—"}</strong></span>
    </div>
  </div>

  <div class="b24-list">
    ${installmentRows}
  </div>
  `}
  <div id="status-msg"></div>
</div>

<!-- Create Payment Modal -->
<div class="b24-form-overlay" id="create-overlay">
  <div class="b24-form-card">
    <div class="b24-form-title">Criar Cobrança</div>
    <div class="b24-form-group">
      <label class="b24-form-label">Valor Total</label>
      <input type="number" id="pay-amount" class="b24-input" step="0.01" min="0.01" placeholder="0.00" oninput="calcInstallments()">
    </div>
    <div class="b24-form-row">
      <div class="b24-form-group">
        <label class="b24-form-label">Entrada</label>
        <input type="number" id="pay-down" class="b24-input" step="0.01" min="0" value="0" placeholder="0.00" oninput="calcInstallments()">
      </div>
      <div class="b24-form-group">
        <label class="b24-form-label">Nº Parcelas</label>
        <select id="pay-installments" class="b24-input" style="height:32px" onchange="calcInstallments()">
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n => `<option value="${n}">${n}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="b24-form-row">
      <div class="b24-form-group">
        <label class="b24-form-label">Intervalo (dias)</label>
        <select id="pay-interval" class="b24-input" style="height:32px" onchange="calcInstallments()">
          <option value="30">30 dias</option>
          <option value="60">60 dias</option>
          <option value="90">90 dias</option>
        </select>
      </div>
      <div class="b24-form-group">
        <label class="b24-form-label">1º Vencimento</label>
        <input type="date" id="pay-first-due" class="b24-input" onchange="calcInstallments()">
      </div>
    </div>
    <div id="installment-preview" style="background:var(--bg-page);border:1px solid var(--border-color);border-radius:4px;padding:10px 12px;margin-bottom:12px;font-size:12px;display:none">
    </div>
    <div class="b24-form-row">
      <div class="b24-form-group">
        <label class="b24-form-label">Moeda</label>
        <select id="pay-currency" class="b24-input" style="height:32px">
          <option value="EUR" ${currency === "EUR" ? "selected" : ""}>EUR</option>
          <option value="BRL" ${currency === "BRL" ? "selected" : ""}>BRL</option>
        </select>
      </div>
      <div class="b24-form-group">
        <label class="b24-form-label">Método</label>
        <select id="pay-method" class="b24-input" style="height:32px" onchange="toggleMethodFields()">
          <option value="card">Cartão</option>
          <option value="pix">PIX</option>
          <option value="boleto">Boleto</option>
          <option value="direto">Recebimento Direto</option>
        </select>
      </div>
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Descrição</label>
      <input type="text" id="pay-desc" class="b24-input" placeholder="${(dealTitle || "Negócio").replace(/"/g, "&quot;")}" value="${(dealTitle || "").replace(/"/g, "&quot;")}">
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Nome do cliente</label>
      <input type="text" id="pay-name" class="b24-input" placeholder="Nome">
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Email</label>
      <input type="email" id="pay-email" class="b24-input" placeholder="email@exemplo.com">
    </div>
    <div id="cpf-group" class="b24-form-group" style="display:none">
      <label class="b24-form-label">CPF/CNPJ</label>
      <input type="text" id="pay-cpf" class="b24-input" placeholder="000.000.000-00">
      <div class="b24-form-hint">Obrigatório para cobranças em BRL</div>
    </div>
    <div class="b24-form-actions">
      <button class="b24-btn-outline" onclick="closeCreateForm()">Cancelar</button>
      <button class="b24-btn-primary" id="pay-submit" onclick="submitInstallments()">Criar Cobrança</button>
    </div>
    <div id="pay-result" style="margin-top:12px;font-size:12px;display:none"></div>
  </div>
</div>

<!-- Edit Installment Modal -->
<div class="b24-form-overlay" id="edit-overlay">
  <div class="b24-form-card">
    <div class="b24-form-title">${icon("pencil", 16)} Editar Parcela</div>
    <input type="hidden" id="edit-tx-id">
    <input type="hidden" id="edit-invoice-id">
    <input type="hidden" id="edit-original-total">
    <div class="b24-form-row">
      <div class="b24-form-group">
        <label class="b24-form-label">Nº de Parcelas</label>
        <select id="edit-num-installments" class="b24-input" style="height:32px" onchange="recalcEditInstallments()">
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n => `<option value="${n}">${n}</option>`).join("")}
        </select>
      </div>
      <div class="b24-form-group">
        <label class="b24-form-label">Intervalo (dias)</label>
        <select id="edit-interval" class="b24-input" style="height:32px" onchange="recalcEditInstallments()">
          <option value="30">30 dias</option>
          <option value="60">60 dias</option>
          <option value="90">90 dias</option>
        </select>
      </div>
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Valor da Parcela</label>
      <input type="number" id="edit-amount" class="b24-input" step="0.01" min="0.01" oninput="updateEditDualCurrency()">
      <div class="b24-dual-currency" id="edit-dual-currency"></div>
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Data de Vencimento (1ª parcela)</label>
      <input type="date" id="edit-due-date" class="b24-input" onchange="recalcEditInstallments()">
    </div>
    <div id="edit-dates-preview" class="b24-dates-preview" style="display:none"></div>
    <div class="b24-form-group">
      <label class="b24-form-label">Método de Pagamento</label>
      <select id="edit-method" class="b24-input" style="height:32px">
        <option value="card">Cartão</option>
        <option value="pix">PIX</option>
        <option value="boleto">Boleto</option>
        <option value="multibanco">Multibanco</option>
        <option value="mb_way">MB Way</option>
        <option value="direto">Recebimento Direto</option>
      </select>
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Notas</label>
      <input type="text" id="edit-notes" class="b24-input" placeholder="Notas adicionais...">
    </div>
    <div class="b24-form-actions">
      <button class="b24-btn-outline" onclick="closeEditModal()">Cancelar</button>
      <button class="b24-btn-primary" id="edit-submit" onclick="submitEdit()">Guardar</button>
    </div>
    <div id="edit-result" style="margin-top:12px;font-size:12px;display:none"></div>
  </div>
</div>

<!-- Baixa (Reconciliation) Modal -->
<div class="b24-form-overlay" id="baixa-overlay">
  <div class="b24-form-card">
    <div class="b24-form-title">${icon("check", 16)} Dar Baixa</div>
    <input type="hidden" id="baixa-tx-id">
    <input type="hidden" id="baixa-invoice-id">
    <input type="hidden" id="baixa-currency">
    <div class="b24-form-group">
      <label class="b24-form-label">Valor da Parcela</label>
      <div class="b24-readonly" id="baixa-total-display">—</div>
    </div>
    <div class="b24-form-row">
      <div class="b24-form-group">
        <label class="b24-form-label">Valor Efetivamente Pago</label>
        <input type="number" id="baixa-paid" class="b24-input" step="0.01" min="0" oninput="calcDiscount()">
      </div>
      <div class="b24-form-group">
        <label class="b24-form-label">Data do Pagamento</label>
        <input type="date" id="baixa-date" class="b24-input">
      </div>
    </div>
    <div class="b24-discount-row" id="baixa-discount-row" style="display:none">
      <div id="baixa-discount-display"></div>
    </div>
    <div class="b24-form-group" id="baixa-reason-group" style="display:none">
      <label class="b24-form-label">Justificativa do Desconto</label>
      <select id="baixa-reason" class="b24-input" style="height:32px" onchange="toggleReasonOther()">
        <option value="Abatimento">Abatimento</option>
        <option value="Desconto comercial">Desconto comercial</option>
        <option value="Quitação antecipada">Quitação antecipada</option>
        <option value="Negociação de cobrança">Negociação de cobrança</option>
        <option value="Outro">Outro</option>
      </select>
    </div>
    <div class="b24-form-group" id="baixa-reason-other-group" style="display:none">
      <label class="b24-form-label">Descreva o motivo</label>
      <input type="text" id="baixa-reason-other" class="b24-input" placeholder="Motivo do desconto...">
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Comprovante (opcional)</label>
      <input type="file" id="baixa-proof" class="b24-input" style="padding:4px 8px;height:auto" accept="image/*,.pdf">
      <div class="b24-form-hint">Imagem ou PDF do comprovante de pagamento</div>
    </div>
    <div class="b24-form-actions">
      <button class="b24-btn-outline" onclick="closeBaixaModal()">Cancelar</button>
      <button class="b24-btn-primary" id="baixa-submit" style="background:#589731" onclick="submitBaixa()">Confirmar Baixa</button>
    </div>
    <div id="baixa-result" style="margin-top:12px;font-size:12px;display:none"></div>
  </div>
</div>

<script>
  var SUPABASE_URL = "${supabaseUrl}";
  var SUPABASE_KEY = "${Deno.env.get("SUPABASE_ANON_KEY") || ""}";
  var MEMBER_ID = "${memberId}";
  var ENTITY_ID = "${opts.entityId}";
  var EUR_TO_BRL = 6.10;
  var _baixaOriginalAmount = 0;

  // Ensure a real transaction exists — creates one if txId is synthetic (e.g. "deal-123")
  async function ensureTxExists(txId, overlayEl, amount, currency, description) {
    if (!txId || !txId.startsWith('deal-')) return txId;
    // Create real transaction via payment-create POST
    var entityId = (overlayEl && overlayEl.dataset && overlayEl.dataset.entityId) || ENTITY_ID;
    var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({
        amount: amount || 0,
        currency: currency || 'EUR',
        payment_method: 'direto',
        force_gateway: 'direto',
        description: description || 'Parcela',
        metadata: { bitrix_deal_id: entityId, source: 'bitrix24_payment_tab_synthetic' }
      })
    });
    var data = await res.json();
    if (data.error) throw new Error('Erro ao criar transação: ' + data.error);
    if (data.transaction && data.transaction.id) return data.transaction.id;
    throw new Error('Não foi possível criar a transação');
  }

  function setStatus(msg, color) {
    var el = document.getElementById('status-msg');
    if (el) { el.textContent = msg; el.style.color = color || 'var(--text-secondary)'; }
  }

  function copyLink(btn, url) {
    navigator.clipboard.writeText(url).then(function() {
      btn.classList.add('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(function() {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      }, 2000);
    }).catch(function() { setStatus('Erro ao copiar link', 'var(--value-open)'); });
  }

  // === Create form ===
  function openCreateForm() { document.getElementById('create-overlay').classList.add('active'); }
  function closeCreateForm() {
    document.getElementById('create-overlay').classList.remove('active');
    document.getElementById('pay-result').style.display = 'none';
  }

  document.getElementById('pay-currency').addEventListener('change', function() {
    document.getElementById('cpf-group').style.display = this.value === 'BRL' ? 'block' : 'none';
    toggleMethodFields();
  });

  function toggleMethodFields() {
    var method = document.getElementById('pay-method').value;
    var isDireto = method === 'direto';
    var emailEl = document.getElementById('pay-email');
    if (emailEl) emailEl.closest('.b24-form-group').style.opacity = isDireto ? '0.5' : '1';
  }

  function initForm() {
    var interval = parseInt(document.getElementById('pay-interval').value) || 30;
    var d = new Date();
    d.setDate(d.getDate() + interval);
    document.getElementById('pay-first-due').value = d.toISOString().split('T')[0];
    calcInstallments();
  }
  initForm();

  function calcInstallments() {
    var total = parseFloat(document.getElementById('pay-amount').value) || 0;
    var down = parseFloat(document.getElementById('pay-down').value) || 0;
    var numInst = parseInt(document.getElementById('pay-installments').value) || 1;
    var interval = parseInt(document.getElementById('pay-interval').value) || 30;
    var firstDue = document.getElementById('pay-first-due').value;
    var preview = document.getElementById('installment-preview');
    if (total <= 0) { preview.style.display = 'none'; return; }
    if (down > total) down = total;
    var remaining = total - down;
    var instValue = numInst > 0 ? Math.floor(remaining * 100 / numInst) / 100 : 0;
    var lastInst = remaining - (instValue * (numInst - 1));
    var lines = [];
    lines.push('<div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">Resumo do parcelamento</div>');
    lines.push('<div>Total: <strong>' + total.toFixed(2) + '</strong></div>');
    if (down > 0) lines.push('<div>Entrada: <strong>' + down.toFixed(2) + '</strong> (vence hoje)</div>');
    if (numInst > 0 && remaining > 0) {
      lines.push('<div>Parcelas: <strong>' + numInst + 'x de ' + instValue.toFixed(2) + '</strong></div>');
      if (Math.abs(lastInst - instValue) > 0.001) lines.push('<div style="font-size:11px;color:var(--text-secondary)">Última parcela: ' + lastInst.toFixed(2) + ' (ajuste)</div>');
      if (firstDue) {
        var dates = [];
        for (var i = 0; i < numInst && i < 6; i++) {
          var d = new Date(firstDue); d.setDate(d.getDate() + (interval * i));
          dates.push(d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }));
        }
        if (numInst > 6) dates.push('...');
        lines.push('<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">Vencimentos: ' + dates.join(', ') + '</div>');
      }
    }
    var totalParcelas = (down > 0 ? 1 : 0) + numInst;
    lines.push('<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">Total de faturas: ' + totalParcelas + '</div>');
    preview.innerHTML = lines.join('');
    preview.style.display = 'block';
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async function submitInstallments() {
    var totalAmount = parseFloat(document.getElementById('pay-amount').value);
    if (!totalAmount || totalAmount <= 0) { showPayResult('Informe um valor válido.', true); return; }
    var downPayment = parseFloat(document.getElementById('pay-down').value) || 0;
    var numInstallments = parseInt(document.getElementById('pay-installments').value) || 1;
    var interval = parseInt(document.getElementById('pay-interval').value) || 30;
    var firstDue = document.getElementById('pay-first-due').value;
    var currency = document.getElementById('pay-currency').value;
    var method = document.getElementById('pay-method').value;
    var desc = document.getElementById('pay-desc').value || 'Pagamento';
    var name = document.getElementById('pay-name').value;
    var email = document.getElementById('pay-email').value;
    var cpf = document.getElementById('pay-cpf').value;
    if (downPayment > totalAmount) { showPayResult('Entrada não pode ser maior que o total.', true); return; }
    if (currency === 'BRL' && !cpf) { showPayResult('CPF/CNPJ é obrigatório para BRL.', true); return; }
    var remaining = totalAmount - downPayment;
    var instValue = numInstallments > 0 ? Math.floor(remaining * 100 / numInstallments) / 100 : 0;
    var lastInstValue = remaining - (instValue * (numInstallments - 1));
    var groupId = generateUUID();
    var hasDown = downPayment > 0;
    var totalCount = (hasDown ? 1 : 0) + numInstallments;
    var parcels = [];
    if (hasDown) {
      parcels.push({ amount: downPayment, due_date: new Date().toISOString().split('T')[0], installment_number: 0, is_down_payment: true });
    }
    for (var i = 0; i < numInstallments; i++) {
      var dueDate = new Date(firstDue); dueDate.setDate(dueDate.getDate() + (interval * i));
      var val = (i === numInstallments - 1) ? lastInstValue : instValue;
      parcels.push({ amount: val, due_date: dueDate.toISOString().split('T')[0], installment_number: i + 1, is_down_payment: false });
    }
    if (currency === 'BRL') {
      for (var p = 0; p < parcels.length; p++) {
        if (parcels[p].amount < 5) { showPayResult('Cada parcela deve ter no mínimo R$ 5,00. Parcela ' + (p+1) + ' tem R$ ' + parcels[p].amount.toFixed(2), true); return; }
      }
    }
    var btn = document.getElementById('pay-submit');
    btn.disabled = true;
    var errors = [];
    var createdTxIds = [];
    for (var j = 0; j < parcels.length; j++) {
      var parcel = parcels[j];
      btn.textContent = 'A criar ' + (j+1) + '/' + parcels.length + '...';
      showPayResult('A criar fatura ' + (j+1) + ' de ' + parcels.length + '...', false);
      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({
            amount: parcel.amount, currency: currency, payment_method: method,
            description: desc + (parcels.length > 1 ? (parcel.is_down_payment ? ' (Entrada)' : ' (Parcela ' + parcel.installment_number + '/' + numInstallments + ')') : ''),
            customer_data: { name: name, email: email, cpf_cnpj: cpf || undefined },
            due_date: parcel.due_date, installment_number: parcel.installment_number,
            total_installments: totalCount, installment_group_id: groupId, is_down_payment: parcel.is_down_payment,
            metadata: { bitrix_deal_id: ENTITY_ID, source: 'bitrix24_payment_tab' }
          })
        });
        var data = await res.json();
        if (data.error) { errors.push('Fatura ' + (j+1) + ': ' + data.error); }
        else if (data.transaction) { createdTxIds.push({ txId: data.transaction.id, parcel: parcel, index: j }); }
      } catch (e) { errors.push('Fatura ' + (j+1) + ': ' + e.message); }
    }
    if (createdTxIds.length > 0 && typeof BX24 !== 'undefined') {
      btn.textContent = 'A criar faturas no CRM...';
      showPayResult('A criar Smart Invoices no Bitrix24...', false);
      try {
        for (var k = 0; k < createdTxIds.length; k++) {
          var item = createdTxIds[k];
          var invoiceLabel = item.parcel.is_down_payment ? 'Entrada' : ('Parcela ' + item.parcel.installment_number + '/' + numInstallments);
          var invoiceTitle = invoiceLabel + ' - ' + (desc || 'Negócio');
          await new Promise(function(resolve) {
            BX24.callMethod('crm.item.add', {
              entityTypeId: 31,
              fields: { title: invoiceTitle, opportunity: item.parcel.amount, currencyId: currency, isManualOpportunity: 'Y', parentId2: parseInt(ENTITY_ID), begindate: new Date().toISOString().split('T')[0], closedate: item.parcel.due_date, comments: 'Fatura gerada automaticamente pelo Emmely Pay. ' + invoiceLabel + '. Grupo: ' + groupId }
            }, function(result) {
              if (result.error()) { console.error('Smart Invoice error:', result.error()); resolve(null); }
              else {
                var invoiceId = result.data() && result.data().item ? result.data().item.id : null;
                if (invoiceId) {
                  fetch(SUPABASE_URL + '/functions/v1/payment-create', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY }, body: JSON.stringify({ transaction_id: item.txId, metadata_update: { bitrix_invoice_id: invoiceId } }) }).then(function() { resolve(invoiceId); }).catch(function() { resolve(invoiceId); });
                } else { resolve(null); }
              }
            });
          });
        }
      } catch (e) { console.error('Smart Invoice creation error:', e); }
    }
    btn.disabled = false;
    btn.textContent = 'Criar Cobrança';
    if (errors.length > 0) { showPayResult('Erros: ' + errors.join('; '), true); }
    else { showPayResult(parcels.length + ' fatura(s) criada(s) com sucesso!', false); setTimeout(function() { location.reload(); }, 2000); }
  }

  function showPayResult(msg, isError) {
    var el = document.getElementById('pay-result');
    el.innerHTML = msg; el.style.display = 'block';
    el.style.color = isError ? 'var(--value-open)' : 'var(--value-paid)';
  }

  // === Toggle Flow Row ===
  function toggleFlowRow(instId) {
    var row = document.getElementById('flow-row-' + instId);
    if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  }

  async function generatePaymentLink(inst) {
    setStatus('A gerar link de pagamento...', 'var(--text-secondary)');
    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({
          amount: inst.value || 0,
          currency: inst.currency || 'EUR',
          payment_method: inst.payment_method || 'card',
          description: inst.description || 'Pagamento',
          metadata: { bitrix_deal_id: ENTITY_ID, source: 'bitrix24_payment_tab_link' }
        })
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.transaction && data.transaction.payment_url) {
        navigator.clipboard.writeText(data.transaction.payment_url).catch(function(){});
        setStatus('✅ Link gerado e copiado! ' + data.transaction.payment_url, 'var(--value-paid)');
        setTimeout(function() { location.reload(); }, 3000);
      } else {
        setStatus('⚠ Cobrança criada mas sem link (método direto?)', 'var(--text-secondary)');
        setTimeout(function() { location.reload(); }, 2000);
      }
    } catch(e) {
      setStatus('Erro: ' + e.message, 'var(--value-open)');
    }
  }

  // === Edit Modal ===
  function openEditModal(inst) {
    document.getElementById('edit-tx-id').value = inst.transaction_id || inst.id;
    document.getElementById('edit-invoice-id').value = inst.invoice_id || '';
    document.getElementById('edit-amount').value = inst.value || '';
    document.getElementById('edit-due-date').value = inst.due_date ? inst.due_date.split('T')[0] : '';
    document.getElementById('edit-method').value = inst.payment_method || 'card';
    document.getElementById('edit-notes').value = inst.notes || '';
    document.getElementById('edit-num-installments').value = '1';
    document.getElementById('edit-original-total').value = inst.value || '0';
    document.getElementById('edit-result').style.display = 'none';
    document.getElementById('edit-dates-preview').style.display = 'none';
    // Store data for ensureTxExists
    var editOverlay = document.getElementById('edit-overlay');
    editOverlay.dataset.entityId = inst.entity_id || ENTITY_ID;
    editOverlay.dataset.currency = inst.currency || 'EUR';
    editOverlay.dataset.description = inst.description || '';
    editOverlay.dataset.amount = inst.value || '0';
    editOverlay.classList.add('active');
    updateEditDualCurrency();
  }
  function closeEditModal() { document.getElementById('edit-overlay').classList.remove('active'); }

  function updateEditDualCurrency() {
    var val = parseFloat(document.getElementById('edit-amount').value) || 0;
    var cur = document.getElementById('edit-overlay').dataset.currency || 'EUR';
    var el = document.getElementById('edit-dual-currency');
    if (cur === 'EUR') {
      el.textContent = '≈ ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val * EUR_TO_BRL);
    } else {
      el.textContent = '≈ ' + new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val / EUR_TO_BRL);
    }
  }

  function recalcEditInstallments() {
    var numInst = parseInt(document.getElementById('edit-num-installments').value) || 1;
    var interval = parseInt(document.getElementById('edit-interval').value) || 30;
    var firstDue = document.getElementById('edit-due-date').value;
    var totalVal = parseFloat(document.getElementById('edit-original-total').value) || 0;
    var preview = document.getElementById('edit-dates-preview');
    if (numInst <= 1) {
      preview.style.display = 'none';
      return;
    }
    var instVal = Math.floor(totalVal * 100 / numInst) / 100;
    var lastVal = totalVal - (instVal * (numInst - 1));
    document.getElementById('edit-amount').value = instVal.toFixed(2);
    updateEditDualCurrency();
    var lines = ['<div style="font-weight:600;margin-bottom:4px;color:var(--text-primary)">Parcelas geradas</div>'];
    for (var i = 0; i < numInst; i++) {
      var val = (i === numInst - 1) ? lastVal : instVal;
      var dateStr = '—';
      if (firstDue) {
        var d = new Date(firstDue); d.setDate(d.getDate() + (interval * i));
        dateStr = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
      var cur = document.getElementById('edit-overlay').dataset.currency || 'EUR';
      var fmtVal = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur }).format(val);
      var dualVal = cur === 'EUR'
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val * EUR_TO_BRL)
        : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val / EUR_TO_BRL);
      lines.push('<div>' + (i+1) + 'ª parcela: ' + dateStr + ' — <strong>' + fmtVal + '</strong> <span style="font-size:11px;color:var(--text-secondary)">≈ ' + dualVal + '</span></div>');
    }
    preview.innerHTML = lines.join('');
    preview.style.display = 'block';
  }

  async function submitEdit() {
    var txId = document.getElementById('edit-tx-id').value;
    var invoiceId = document.getElementById('edit-invoice-id').value;
    var btn = document.getElementById('edit-submit');
    btn.disabled = true; btn.textContent = 'A guardar...';
    var el = document.getElementById('edit-result');
    try {
      // Ensure transaction exists (create if synthetic)
      var editOverlay = document.getElementById('edit-overlay');
      txId = await ensureTxExists(txId, editOverlay, parseFloat(editOverlay.dataset.amount) || 0, editOverlay.dataset.currency || 'EUR', editOverlay.dataset.description || '');

      var payload = {
        transaction_id: txId,
        amount_update: parseFloat(document.getElementById('edit-amount').value) || undefined,
        due_date_update: document.getElementById('edit-due-date').value || undefined,
        payment_method_update: document.getElementById('edit-method').value || undefined,
        notes: document.getElementById('edit-notes').value || undefined,
      };
      var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);

      // Update Smart Invoice in Bitrix24 if exists
      if (invoiceId && typeof BX24 !== 'undefined') {
        var fields = {};
        if (payload.amount_update) fields.opportunity = payload.amount_update;
        if (payload.due_date_update) fields.closedate = payload.due_date_update;
        if (Object.keys(fields).length > 0) {
          fields.isManualOpportunity = 'Y';
          await new Promise(function(resolve) {
            BX24.callMethod('crm.item.update', { entityTypeId: 31, id: parseInt(invoiceId), fields: fields }, function(r) { resolve(null); });
          });
        }
      }

      el.innerHTML = 'Parcela atualizada com sucesso!'; el.style.color = 'var(--value-paid)'; el.style.display = 'block';
      setTimeout(function() { location.reload(); }, 1500);
    } catch(e) {
      el.innerHTML = 'Erro: ' + e.message; el.style.color = 'var(--value-open)'; el.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Guardar';
  }

  // === Baixa Modal ===
  function openBaixaModal(inst) {
    _baixaOriginalAmount = inst.value || 0;
    var cur = inst.currency || 'EUR';
    document.getElementById('baixa-tx-id').value = inst.transaction_id || inst.id;
    document.getElementById('baixa-invoice-id').value = inst.invoice_id || '';
    document.getElementById('baixa-currency').value = cur;
    document.getElementById('baixa-total-display').textContent = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur }).format(_baixaOriginalAmount);
    document.getElementById('baixa-paid').value = _baixaOriginalAmount;
    document.getElementById('baixa-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('baixa-discount-row').style.display = 'none';
    document.getElementById('baixa-reason-group').style.display = 'none';
    document.getElementById('baixa-reason-other-group').style.display = 'none';
    document.getElementById('baixa-proof').value = '';
    document.getElementById('baixa-result').style.display = 'none';
    // Store entity info for synthetic creation
    document.getElementById('baixa-overlay').dataset.entityId = inst.entity_id || ENTITY_ID;
    document.getElementById('baixa-overlay').dataset.currency = cur;
    document.getElementById('baixa-overlay').dataset.description = inst.description || '';
    document.getElementById('baixa-overlay').classList.add('active');
    calcDiscount();
  }
  function closeBaixaModal() { document.getElementById('baixa-overlay').classList.remove('active'); }

  function calcDiscount() {
    var paid = parseFloat(document.getElementById('baixa-paid').value) || 0;
    var discount = _baixaOriginalAmount - paid;
    var cur = document.getElementById('baixa-currency').value || 'EUR';
    var fmt = function(v) { return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur }).format(v); };
    if (discount > 0.001) {
      document.getElementById('baixa-discount-row').style.display = 'block';
      document.getElementById('baixa-discount-display').innerHTML = '💰 <strong>Desconto/Abatimento: ' + fmt(discount) + '</strong><br><span style="font-size:11px">Parcela: ' + fmt(_baixaOriginalAmount) + ' → Pago: ' + fmt(paid) + '</span>';
      document.getElementById('baixa-reason-group').style.display = 'block';
    } else {
      document.getElementById('baixa-discount-row').style.display = 'none';
      document.getElementById('baixa-reason-group').style.display = 'none';
      document.getElementById('baixa-reason-other-group').style.display = 'none';
    }
  }

  function toggleReasonOther() {
    var val = document.getElementById('baixa-reason').value;
    document.getElementById('baixa-reason-other-group').style.display = val === 'Outro' ? 'block' : 'none';
  }

  async function submitBaixa() {
    var txId = document.getElementById('baixa-tx-id').value;
    var invoiceId = document.getElementById('baixa-invoice-id').value;
    var paidAmount = parseFloat(document.getElementById('baixa-paid').value) || 0;
    var paidDate = document.getElementById('baixa-date').value || new Date().toISOString().split('T')[0];
    var discount = _baixaOriginalAmount - paidAmount;
    var reason = '';
    if (discount > 0.001) {
      reason = document.getElementById('baixa-reason').value;
      if (reason === 'Outro') reason = document.getElementById('baixa-reason-other').value || 'Outro';
    }
    var btn = document.getElementById('baixa-submit');
    btn.disabled = true; btn.textContent = 'A processar...';
    var el = document.getElementById('baixa-result');

    try {
      // Ensure transaction exists (create if synthetic)
      var overlay = document.getElementById('baixa-overlay');
      txId = await ensureTxExists(txId, overlay, _baixaOriginalAmount, overlay.dataset.currency || 'EUR', overlay.dataset.description || '');

      // Upload proof if provided
      var proofUrl = null;
      var fileInput = document.getElementById('baixa-proof');
      if (fileInput.files && fileInput.files.length > 0) {
        btn.textContent = 'A enviar comprovante...';
        var file = fileInput.files[0];
        var ext = file.name.split('.').pop() || 'png';
        var path = 'payment-proofs/' + txId + '.' + ext;
        var formData = new FormData();
        formData.append('', file);
        var uploadRes = await fetch(SUPABASE_URL + '/storage/v1/object/signatures/' + path, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
          body: file,
        });
        if (uploadRes.ok) {
          proofUrl = SUPABASE_URL + '/storage/v1/object/public/signatures/' + path;
        } else {
          console.error('Upload error:', await uploadRes.text());
        }
      }

      btn.textContent = 'A dar baixa...';
      var payload = {
        transaction_id: txId,
        status_update: 'confirmed',
        paid_amount: paidAmount,
        metadata_update: { manual_paid: true, paid_at: paidDate + 'T00:00:00Z' },
      };
      if (discount > 0.001) {
        payload.discount_amount = discount;
        payload.discount_reason = reason;
      }
      if (proofUrl) payload.proof_url = proofUrl;

      var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);

      // Update Smart Invoice in Bitrix24
      if (invoiceId && typeof BX24 !== 'undefined') {
        btn.textContent = 'A atualizar fatura...';
        await new Promise(function(resolve) {
          BX24.callMethod('crm.item.update', {
            entityTypeId: 31, id: parseInt(invoiceId),
            fields: { stageId: 'DT31_6:P', moved: 'Y' }
          }, function(r) {
            if (r.error()) {
              console.error('Invoice close error:', r.error());
              BX24.callMethod('crm.invoice.update', { ID: parseInt(invoiceId), fields: { STATUS_ID: 'P' } }, function() { resolve(null); });
            } else { resolve(null); }
          });
        });
      }

      var msg = 'Baixa registada com sucesso!';
      if (discount > 0.001) msg += ' (Desconto: ' + new Intl.NumberFormat('pt-PT', { style: 'currency', currency: document.getElementById('baixa-currency').value }).format(discount) + ')';
      el.innerHTML = msg; el.style.color = 'var(--value-paid)'; el.style.display = 'block';
      setTimeout(function() { location.reload(); }, 2000);
    } catch(e) {
      el.innerHTML = 'Erro: ' + e.message; el.style.color = 'var(--value-open)'; el.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Confirmar Baixa';
  }

  function triggerFlow(installmentId, phone, installmentNum) {
    var sel = document.getElementById('flow-' + installmentId);
    if (!sel || !sel.value) { setStatus('Selecione um fluxo primeiro.', 'var(--value-open)'); return; }
    var flowId = sel.value;
    setStatus('A disparar fluxo...', 'var(--text-secondary)');
    fetch(SUPABASE_URL + '/functions/v1/flow-engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ phone: phone, message: 'Lembrete parcela ' + installmentNum, flow_id: flowId, source: 'bitrix24_payment_tab' })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) { if (d.error) throw new Error(d.error); setStatus('Fluxo disparado com sucesso para ' + phone, 'var(--value-paid)'); })
    .catch(function(e) { setStatus('Erro: ' + e.message, 'var(--value-open)'); });
  }

  // Theme
  function applyTheme(isDark) { document.body.classList.toggle('dark', isDark); }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme(true);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) { applyTheme(e.matches); });
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    var d = e.data;
    if (d.action === 'ChangeColorScheme' || d.action === 'themeChange') { var s = d.scheme || d.colorScheme || d.theme; if (s) applyTheme(s === 'dark'); }
    else if (d.type === 'B24Frame:theme' && d.payload && d.payload.type) applyTheme(d.payload.type === 'dark');
    else if (d.colorScheme) applyTheme(d.colorScheme === 'dark');
    else if (d.theme === 'dark' || d.theme === 'light') applyTheme(d.theme === 'dark');
  });

  function openInvoice(invoiceId) {
    try { BX24.openPath('/crm/invoice/show/' + invoiceId + '/'); }
    catch(e) { try { BX24.openPath('/crm/type/31/details/' + invoiceId + '/'); } catch(e2) {} setStatus('Fatura #' + invoiceId, 'var(--link-color)'); }
  }

  try { BX24.init(function() { BX24.fitWindow(); }); } catch(e) {}
</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    let body: Record<string, any> = {};

    if (contentType.includes("application/json")) {
      try { body = JSON.parse(bodyText); } catch {}
    } else {
      const params = new URLSearchParams(bodyText);
      for (const [k, v] of params.entries()) body[k] = v;
    }

    console.log("[PAYMENT-TAB] Body keys:", Object.keys(body));

    const memberId = body.member_id || body.MEMBER_ID || "";

    let placementOptions: Record<string, any> = {};
    if (body.PLACEMENT_OPTIONS) {
      try {
        placementOptions = typeof body.PLACEMENT_OPTIONS === "string"
          ? JSON.parse(body.PLACEMENT_OPTIONS)
          : body.PLACEMENT_OPTIONS;
      } catch { placementOptions = {}; }
    }

    const entityId = placementOptions.ID || placementOptions.ENTITY_ID || body.ENTITY_ID || "";
    const entityTypeId = placementOptions.ENTITY_TYPE_ID || body.ENTITY_TYPE_ID || "2";

    console.log("[PAYMENT-TAB] entityId:", entityId, "entityTypeId:", entityTypeId);

    let integration: any = null;
    if (memberId) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").eq("member_id", memberId).single();
      integration = data;
    }
    if (!integration) {
      const { data } = await supabase.from("bitrix24_integrations").select("*").order("created_at", { ascending: false }).limit(1).single();
      integration = data;
    }

    if (!integration) {
      return new Response(renderPaymentTab({
        entityId, dealTitle: "Negócio", totalValue: 0, paidValue: 0, openValue: 0,
        currency: "EUR", installments: [], supabaseUrl, memberId,
        flows: [], contactPhone: "", noData: true,
      }), { headers: htmlHeaders });
    }

    const bodyAuthToken = body.AUTH_ID || body.auth_id || "";
    let accessToken = bodyAuthToken || await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint;

    let dealTitle = "Negócio";
    let dealAmount = 0;
    let dealCurrency = "EUR";
    let contactPhone = "";
    let contactId = "";
    let dealGateway = "";
    let dealPaymentMethod = "";
    let dealCreatedAt = "";

    try {
      const dealResult = await callBitrix(endpoint, accessToken, "crm.deal.get", { ID: entityId });
      const deal = dealResult.result || {};
      dealTitle = deal.TITLE || "Negócio";
      dealAmount = parseFloat(deal.OPPORTUNITY || "0");
      dealCurrency = deal.CURRENCY_ID || "EUR";
      contactId = deal.CONTACT_ID || "";
      dealCreatedAt = deal.DATE_CREATE || deal.CREATED_DATE || "";
      // Read UF_CRM_EMMELY_* fields (list fields return item IDs, not labels)
      const rawGateway = deal.UF_CRM_EMMELY_GATEWAY || "";
      const rawMethod = deal.UF_CRM_EMMELY_PAYMENT_METHOD || "";

      // Resolve list field IDs to display values
      if (rawGateway || rawMethod) {
        try {
          const fieldsResult = await callBitrix(endpoint, accessToken, "crm.deal.fields", {});
          const fields = fieldsResult.result || {};
          const resolveListValue = (fieldDef: any, rawVal: string): string => {
            if (!fieldDef || !rawVal) return "";
            const items = fieldDef.items || fieldDef.ITEMS || [];
            if (Array.isArray(items)) {
              const match = items.find((item: any) => String(item.ID) === String(rawVal) || String(item.VALUE) === String(rawVal));
              if (match) return match.VALUE || match.value || rawVal;
            }
            // If the raw value is purely numeric, it's an unresolved list ID — return empty
            if (/^\d+$/.test(rawVal)) return "";
            return rawVal;
          };
          dealGateway = resolveListValue(fields.UF_CRM_EMMELY_GATEWAY, rawGateway);
          dealPaymentMethod = resolveListValue(fields.UF_CRM_EMMELY_PAYMENT_METHOD, rawMethod);
        } catch (e) {
          console.error("[PAYMENT-TAB] Error resolving list fields:", e);
          // Fallback: if numeric, skip; otherwise use raw
          dealGateway = /^\d+$/.test(rawGateway) ? "" : rawGateway;
          dealPaymentMethod = /^\d+$/.test(rawMethod) ? "" : rawMethod;
        }
      }
      if (contactId) {
        const contactResult = await callBitrix(endpoint, accessToken, "crm.contact.get", { ID: contactId });
        const contact = contactResult.result || {};
        const phones = contact.PHONE || [];
        if (Array.isArray(phones) && phones.length > 0) {
          contactPhone = (phones[0].VALUE || "").replace(/\D/g, "");
        }
      }
    } catch (e) {
      console.error("[PAYMENT-TAB] Error fetching deal:", e);
    }

    const { data: transactions } = await supabase
      .from("payment_transactions")
      .select("*")
      .order("created_at", { ascending: true });

    const dealTransactions = (transactions || []).filter((tx: any) => {
      const meta = tx.metadata || {};
      if (meta.bitrix_deal_id === entityId || meta.bitrix_deal_id === String(entityId)) return true;
      if (meta.bitrix_entity_id === entityId || meta.bitrix_entity_id === String(entityId)) return true;
      return false;
    });

    const contractIds = dealTransactions.filter((tx: any) => tx.contract_id).map((tx: any) => tx.contract_id);
    let financialRecords: any[] = [];
    if (contractIds.length > 0) {
      const uniqueContractIds = [...new Set(contractIds)];
      const { data: records } = await supabase
        .from("financial_records")
        .select("*")
        .in("contract_id", uniqueContractIds)
        .order("installment_number", { ascending: true });
      financialRecords = records || [];
    }

    let installments: InstallmentData[] = [];
    let totalValue = 0;
    let paidValue = 0;
    let currency = dealCurrency;

    if (financialRecords.length > 0) {
      const firstRecord = financialRecords[0];
      totalValue = firstRecord.total_value || 0;
      currency = "EUR";
      installments = financialRecords.map((rec: any) => {
        const matchingTx = dealTransactions.find((tx: any) => tx.financial_record_id === rec.id);
        return {
          id: rec.id, number: rec.installment_number || 1, total: rec.total_installments || 1,
          value: rec.installment_value || 0, status: rec.status || "pendente",
          due_date: rec.due_date, paid_at: rec.paid_at, currency,
          description: rec.description || "", transaction_id: matchingTx?.id,
          payment_url: matchingTx?.payment_url, payment_method: matchingTx?.payment_method,
          metadata: matchingTx?.metadata || {},
        };
      });
      paidValue = installments.filter(i => i.status === "paga").reduce((s, i) => s + i.value, 0);
    } else if (dealTransactions.length > 0) {
      totalValue = dealTransactions.reduce((s: number, tx: any) => s + (tx.amount || 0), 0);
      currency = dealTransactions[0].currency || dealCurrency;

      const companyIds = [...new Set(dealTransactions.filter((tx: any) => tx.company_id).map((tx: any) => tx.company_id))];
      let companyMap: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
        if (companies) { for (const c of companies) companyMap[c.id] = c.name; }
      }

      installments = dealTransactions.map((tx: any, idx: number) => {
        let status = "pendente";
        if (tx.status === "paid" || tx.status === "confirmed" || tx.status === "succeeded") status = "paga";
        else if (tx.status === "overdue" || tx.status === "failed") status = "atrasada";
        const meta = tx.metadata || {};
        const instNum = meta.installment_number != null ? meta.installment_number : (idx + 1);
        const instTotal = meta.total_installments || dealTransactions.length;
        const isDown = meta.is_down_payment === true;
        const dueDate = meta.due_date || tx.created_at;
        return {
          id: tx.id, number: isDown ? 0 : instNum, total: instTotal,
          value: tx.amount || 0, status, due_date: dueDate,
          paid_at: status === "paga" ? tx.updated_at : null,
          currency: tx.currency || currency, description: "",
          transaction_id: tx.id, payment_url: tx.payment_url,
          is_down_payment: isDown,
          invoice_id: meta.bitrix_old_invoice_id || meta.bitrix_invoice_id || null,
          is_direct: tx.gateway === "direto" || tx.payment_method === "parcelado_direto",
          company_name: tx.company_id ? (companyMap[tx.company_id] || meta.company_name || "") : (meta.company_name || ""),
          payment_method: tx.payment_method,
          metadata: meta,
        };
      });
      paidValue = installments.filter(i => i.status === "paga").reduce((s, i) => s + i.value, 0);
    } else {
      if (dealAmount > 0) {
        totalValue = dealAmount;
        installments = [{
          id: `deal-${entityId}`, number: 1, total: 1, value: dealAmount,
          status: "pendente", due_date: null, paid_at: null, currency: dealCurrency,
          description: dealTitle,
        }];
      }
    }

    const openValue = totalValue - paidValue;

    const { data: activeFlows } = await supabase
      .from("flows").select("id, name").eq("is_active", true).order("name");
    const flows = (activeFlows || []).map((f: any) => ({ id: f.id, name: f.name }));

    // Compute next due date from pending installments
    const pendingInstallments = installments.filter(i => i.status !== "paga" && i.due_date);
    const nextDueDate = pendingInstallments.length > 0
      ? pendingInstallments.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0].due_date
      : null;

    // Determine gateway/method from transactions or deal fields
    const displayGateway = dealGateway || (dealTransactions.length > 0 ? dealTransactions[0].gateway : "") || "";
    const displayMethod = dealPaymentMethod || (dealTransactions.length > 0 ? dealTransactions[0].payment_method : "") || "";
    const displayCreatedAt = dealCreatedAt || (dealTransactions.length > 0 ? dealTransactions[0].created_at : "") || "";

    // Gateway display name map
    const gwNames: Record<string, string> = { stripe_pt: "Stripe PT", stripe_br: "Stripe BR", asaas: "Asaas", direto: "Direto", stripe: "Stripe" };
    const methodNames: Record<string, string> = { card: "Cartão", pix: "PIX", boleto: "Boleto", multibanco: "Multibanco", mb_way: "MB Way", direto: "Direto", parcelado_direto: "Direto", sepa_debit: "SEPA" };

    return new Response(renderPaymentTab({
      entityId, dealTitle, totalValue, paidValue, openValue, currency,
      installments, supabaseUrl, memberId, flows, contactPhone,
      noData: installments.length === 0,
      gateway: gwNames[displayGateway] || displayGateway,
      paymentMethod: methodNames[displayMethod] || displayMethod,
      nextDueDate,
      createdAt: displayCreatedAt,
    }), { headers: htmlHeaders });

  } catch (err) {
    console.error("[PAYMENT-TAB] Fatal error:", err);
    return new Response(`<html><body><p style="color:red;padding:20px">Erro: ${String(err)}</p></body></html>`, {
      headers: htmlHeaders,
    });
  }
});
