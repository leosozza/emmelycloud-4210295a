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

// ─── Late Fee Calculation ───────────────────────────────────────────────────

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

interface LateFeeResult {
  daysLate: number;
  penalty: number;
  interest: number;
  charges: number;
  total: number;
}

function calculateLateFees(amount: number, daysLate: number, config: LateFeeConfig): LateFeeResult {
  const effectiveDays = Math.max(0, daysLate - config.grace_days);
  const cappedDays = Math.min(effectiveDays, config.max_interest_days);
  if (cappedDays <= 0) {
    return { daysLate: 0, penalty: 0, interest: 0, charges: 0, total: amount };
  }
  const penalty = Math.round(amount * (config.penalty_pct / 100) * 100) / 100;
  const interest = Math.round(amount * (config.interest_monthly_pct / 100) * (cappedDays / 30) * 100) / 100;
  const charges = penalty + interest;
  return {
    daysLate: cappedDays,
    penalty,
    interest,
    charges,
    total: Math.round((amount + charges) * 100) / 100,
  };
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
  financial_record_id?: string;
  payment_url?: string;
  is_down_payment?: boolean;
  invoice_id?: number;
  is_direct?: boolean;
  company_name?: string;
  payment_method?: string;
  metadata?: any;
  late_penalty?: number;
  late_interest?: number;
  late_days?: number;
  late_total?: number;
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
  entityTypeId?: string;
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
  contactName?: string;
  contactEmail?: string;
  contactCpfCnpj?: string;
  contactAddress?: {
    postal_code?: string;
    street?: string;
    number?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  noData: boolean;
  gateway?: string;
  rawGateway?: string;
  rawMethod?: string;
  paymentMethod?: string;
  nextDueDate?: string | null;
  createdAt?: string | null;
  gatewayOptions?: { id: string; label: string }[];
  methodOptions?: { id: string; label: string }[];
}): string {
  const { dealTitle, totalValue, paidValue, openValue, currency, installments, supabaseUrl, memberId, flows, contactPhone, contactName, contactEmail, contactCpfCnpj, contactAddress, noData } = opts;
  const addr = contactAddress || {};
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
    const carriedInfo = meta.carried_amount > 0 ? `<span style="color:#e6a817;font-size:11px">+${formatCurrency(meta.carried_amount, inst.currency)} juros acumulados da parcela anterior</span>` : "";

    // Late fee breakdown for overdue installments
    const lateFeeHtml = (inst.status === "atrasada" && inst.late_days && inst.late_days > 0)
      ? `<div class="b24-item-meta" style="background:rgba(239,68,68,0.06);border-radius:6px;padding:6px 10px;margin:4px 0">
           <span style="color:var(--accent-overdue)">⚠️ Multa: ${formatCurrency(inst.late_penalty || 0, inst.currency)}</span>
           <span style="color:var(--accent-overdue)">📈 Juros (${inst.late_days}d): ${formatCurrency(inst.late_interest || 0, inst.currency)}</span>
           <span style="font-weight:700;color:var(--text-primary)">💵 Total: ${formatCurrency(inst.late_total || inst.value, inst.currency)}</span>
         </div>`
      : "";

    // Serialize installment data for JS
    const instJson = JSON.stringify({
      id: inst.id,
      transaction_id: inst.transaction_id,
      financial_record_id: inst.financial_record_id || null,
      entity_id: opts.entityId,
      value: inst.value,
      due_date: inst.due_date,
      payment_method: inst.payment_method || "card",
      currency: inst.currency,
      invoice_id: inst.invoice_id,
      description: inst.description,
      notes: meta.notes || "",
      number: inst.number,
      total: inst.total,
      late_penalty: inst.late_penalty || 0,
      late_interest: inst.late_interest || 0,
      late_days: inst.late_days || 0,
      late_total: inst.late_total || inst.value,
      payment_url: inst.payment_url || null,
    }).replace(/"/g, "&quot;");

    // Dual currency display
    const valueBRL = inst.currency === "EUR" ? inst.value * EUR_TO_BRL : inst.value;
    const valueEUR = inst.currency === "BRL" ? inst.value / EUR_TO_BRL : inst.value;
    const dualDisplay = inst.currency === "EUR"
      ? `<span class="b24-dual-currency">≈ ${formatCurrency(valueBRL, "BRL")}</span>`
      : `<span class="b24-dual-currency">≈ ${formatCurrency(valueEUR, "EUR")}</span>`;

    // "Not generated yet" — no real transaction created in Stripe/gateway.
    // Synthetic rows have either no transaction_id or one that starts with "deal-".
    const notGenerated = (!inst.transaction_id || String(inst.transaction_id).startsWith("deal-")) && inst.status !== "paga";
    const notGeneratedBadge = notGenerated ? `<span class="b24-not-generated" title="Esta cobrança ainda não foi gerada no gateway. Clique em Gerar cobrança.">${icon("file-plus", 12)} Não gerada</span>` : "";
    const canGenerate = notGenerated && !hasMissing;
    const generateBtn = notGenerated
      ? `<button onclick='${canGenerate ? `openEditModal(${instJson})` : "void(0)"}' class="b24-btn-generate${canGenerate ? "" : " b24-btn-disabled"}" ${canGenerate ? "" : "disabled"} title="${canGenerate ? "Gerar cobrança agora" : "Preencha Vencimento e Método primeiro"}">${icon("file-plus", 13)} Gerar cobrança</button>`
      : "";

    return `
      <div class="b24-item ${statusClass}${missingClass}${notGenerated ? " not-generated" : ""}">
        <div class="b24-item-row">
          <div class="b24-item-left">
            <span class="b24-item-title">${label}</span>
            <span class="b24-item-value">${formatCurrency(inst.value, inst.currency)}</span>
            ${dualDisplay}
            ${notGeneratedBadge}
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
        ${lateFeeHtml}
        ${carriedInfo ? `<div class="b24-item-meta">${carriedInfo}</div>` : ""}
        ${discountInfo || paidAmountInfo || proofInfo ? `<div class="b24-item-meta">${paidAmountInfo} ${discountInfo} ${proofInfo}</div>` : ""}
        ${inst.description ? `<div class="b24-item-desc">${inst.description}</div>` : ""}
        ${inst.payment_url && inst.status !== "paga" ? `<div class="b24-link-row"><a href="${inst.payment_url}" target="_blank" class="b24-link">Link de pagamento</a><button class="b24-btn-copy" onclick="copyLink(this,'${inst.payment_url.replace(/'/g, "\\'")}')" title="Copiar link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>` : ""}
        ${inst.invoice_id ? `<div class="b24-link-row"><a href="javascript:void(0)" onclick="openInvoice(${inst.invoice_id})" class="b24-link">${icon("file-text", 13)} Ver Fatura #${inst.invoice_id}</a></div>` : ""}
        ${inst.status !== "paga" ? `
          <div class="b24-item-actions">
            ${generateBtn}
            <button onclick='openEditModal(${instJson})' class="b24-btn-action" title="Editar Parcela">${icon("pencil", 13)} Editar</button>
            ${notGenerated || ["direto","parcelado_direto","transferencia","n"].includes(String(inst.payment_method || "").toLowerCase()) ? "" : `<button onclick='generatePaymentLink(${instJson})' class="b24-btn-action" title="Gerar Link de Pagamento">${icon("link", 13)} Link</button>`}
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
        ` : `
          <div class="b24-item-actions">
            <button onclick='generateReceipt()' class="b24-btn-action" style="border-color:var(--link-color);color:var(--link-color)" title="Gerar Comprovante">${icon("file-text", 13)} Comprovante</button>
            <button onclick='copyReceiptLink()' class="b24-btn-action" style="border-color:var(--accent-paid);color:var(--accent-paid)" title="Copiar Link do Comprovante">${icon("link", 13)} Link</button>
          </div>
        `}
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
  <meta name="color-scheme" content="light dark">
  <title>Emmely Pay</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    :root {
      color-scheme: light dark;
      --bg-page: #f7f8fa;
      --bg-card: #ffffff;
      --text-primary: #0f172a;
      --text-secondary: #4b5563;
      --text-tertiary: #6b7280;
      --border-color: #e5e7eb;
      --border-light: #eef0f3;
      --progress-bg: #eef0f3;
      --progress-fill: #1b6ef3;
      --progress-fill-flat: #1b6ef3;
      --link-color: #1b6ef3;
      --primary: #1b6ef3;
      --primary-hover: #155fd7;
      --value-paid: #16a34a;
      --value-open: #dc2626;
      --accent-paid: #10b981;
      --accent-pending: #f59e0b;
      --accent-overdue: #ef4444;
      --accent-default: #cbd5e1;
      --shadow-xs: 0 1px 2px rgba(15,23,42,0.04);
      --shadow-sm: 0 1px 2px rgba(15,23,42,0.06);
      --shadow-md: 0 4px 12px rgba(15,23,42,0.08);
      --shadow-lg: 0 10px 30px rgba(15,23,42,0.10);
      --radius: 12px;
      --radius-sm: 8px;
      --stat-total-bg: #eff5ff;
      --stat-total-icon: #1b6ef3;
      --stat-paid-bg: #ecfdf5;
      --stat-paid-icon: #10b981;
      --stat-open-bg: #fef2f2;
      --stat-open-icon: #ef4444;
      --stat-total-bg-flat: #eff5ff;
      --stat-paid-bg-flat: #ecfdf5;
      --stat-open-bg-flat: #fef2f2;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg-page: #0b0f17;
        --bg-card: #111827;
        --text-primary: #f1f5f9;
        --text-secondary: #94a3b8;
        --text-tertiary: #64748b;
        --border-color: #1f2937;
        --border-light: #1a2230;
        --progress-bg: #1f2937;
        --progress-fill: #3b82f6;
        --progress-fill-flat: #3b82f6;
        --link-color: #60a5fa;
        --primary: #3b82f6;
        --primary-hover: #2563eb;
        --value-paid: #34d399;
        --value-open: #f87171;
        --accent-paid: #34d399;
        --accent-pending: #fbbf24;
        --accent-overdue: #f87171;
        --accent-default: #334155;
        --shadow-xs: 0 1px 2px rgba(0,0,0,0.25);
        --shadow-sm: 0 1px 2px rgba(0,0,0,0.35);
        --shadow-md: 0 4px 12px rgba(0,0,0,0.45);
        --shadow-lg: 0 10px 30px rgba(0,0,0,0.5);
        --stat-total-bg: rgba(59,130,246,0.10);
        --stat-paid-bg: rgba(52,211,153,0.10);
        --stat-open-bg: rgba(248,113,113,0.10);
        --stat-total-bg-flat: rgba(59,130,246,0.10);
        --stat-paid-bg-flat: rgba(52,211,153,0.10);
        --stat-open-bg-flat: rgba(248,113,113,0.10);
      }
    }
    [data-theme="dark"] {
      --bg-page: #0b0f17; --bg-card: #111827; --text-primary: #f1f5f9; --text-secondary: #94a3b8;
      --text-tertiary: #64748b; --border-color: #1f2937; --border-light: #1a2230;
      --progress-bg: #1f2937; --progress-fill: #3b82f6; --progress-fill-flat: #3b82f6;
      --link-color: #60a5fa; --primary: #3b82f6; --primary-hover: #2563eb;
      --value-paid: #34d399; --value-open: #f87171;
      --accent-paid: #34d399; --accent-pending: #fbbf24; --accent-overdue: #f87171; --accent-default: #334155;
      --shadow-xs: 0 1px 2px rgba(0,0,0,0.25); --shadow-sm: 0 1px 2px rgba(0,0,0,0.35);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.45); --shadow-lg: 0 10px 30px rgba(0,0,0,0.5);
      --stat-total-bg: rgba(59,130,246,0.10); --stat-paid-bg: rgba(52,211,153,0.10); --stat-open-bg: rgba(248,113,113,0.10);
      --stat-total-bg-flat: rgba(59,130,246,0.10); --stat-paid-bg-flat: rgba(52,211,153,0.10); --stat-open-bg-flat: rgba(248,113,113,0.10);
    }
    /* Back-compat: any leftover body.dark toggles still work */
    body.dark { color-scheme: dark; }
    body.dark, html:has(body.dark) { --bg-page: #0b0f17; --bg-card: #111827; --text-primary: #f1f5f9; --text-secondary: #94a3b8; --text-tertiary: #64748b; --border-color: #1f2937; --border-light: #1a2230; --progress-bg: #1f2937; --progress-fill: #3b82f6; --progress-fill-flat: #3b82f6; --link-color: #60a5fa; --primary: #3b82f6; --primary-hover: #2563eb; --value-paid: #34d399; --value-open: #f87171; --accent-paid: #34d399; --accent-pending: #fbbf24; --accent-overdue: #f87171; --accent-default: #334155; --shadow-xs: 0 1px 2px rgba(0,0,0,0.25); --shadow-sm: 0 1px 2px rgba(0,0,0,0.35); --shadow-md: 0 4px 12px rgba(0,0,0,0.45); --shadow-lg: 0 10px 30px rgba(0,0,0,0.5); --stat-total-bg: rgba(59,130,246,0.10); --stat-paid-bg: rgba(52,211,153,0.10); --stat-open-bg: rgba(248,113,113,0.10); --stat-total-bg-flat: rgba(59,130,246,0.10); --stat-paid-bg-flat: rgba(52,211,153,0.10); --stat-open-bg-flat: rgba(248,113,113,0.10); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 13px; background: var(--bg-page); color: var(--text-primary); line-height: 1.5;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    #app { display: flex; flex-direction: column; min-height: 100vh; }

    /* ── Summary ── */
    .b24-summary { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 20px 24px 16px; }
    .b24-summary-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; letter-spacing: -0.01em; }
    .b24-summary-title svg { opacity: 0.7; }
    .b24-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
    .b24-summary-item { background: var(--stat-total-bg); border: 1px solid var(--border-light); border-radius: var(--radius); padding: 14px 16px; transition: box-shadow 0.2s; position: relative; overflow: hidden; }
    .b24-summary-item:hover { box-shadow: var(--shadow-sm); }
    .b24-summary-item.stat-paid { background: var(--stat-paid-bg); }
    .b24-summary-item.stat-open { background: var(--stat-open-bg); }
    .b24-summary-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; background: rgba(27,110,243,0.10); color: var(--stat-total-icon); }
    .stat-paid .b24-summary-icon { background: rgba(16,185,129,0.12); color: var(--stat-paid-icon); }
    .stat-open .b24-summary-icon { background: rgba(239,68,68,0.10); color: var(--stat-open-icon); }
    .b24-summary-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-tertiary); margin-bottom: 4px; }
    .b24-summary-value { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; font-variant-numeric: tabular-nums; }
    .b24-summary-value .b24-dual-currency { margin-left: 4px; }
    .b24-progress-wrap { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
    .b24-progress { flex: 1; height: 6px; background: var(--progress-bg); border-radius: 999px; overflow: hidden; }
    .b24-progress-fill { height: 100%; background: var(--progress-fill); border-radius: 999px; transition: width 0.6s cubic-bezier(0.22,1,0.36,1); }
    .b24-progress-label { font-size: 12px; font-weight: 700; color: var(--text-primary); white-space: nowrap; min-width: 36px; text-align: right; font-variant-numeric: tabular-nums; }

    /* ── Summary info pills ── */
    .b24-summary-info { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-light); }
    .b24-summary-info span { display: inline-flex; align-items: center; gap: 5px; background: var(--bg-page); border: 1px solid var(--border-color); border-radius: 20px; padding: 5px 14px 5px 10px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; transition: all 0.15s; }
    .b24-summary-info span:hover { border-color: var(--progress-fill-flat); background: var(--stat-total-bg-flat); }
    .b24-summary-info strong { font-weight: 700; color: var(--text-primary); }
    .b24-editable-badge { cursor: pointer !important; }
    .b24-editable-badge svg:last-child { opacity: 0.3; margin-left: 2px; transition: opacity 0.15s; }
    .b24-editable-badge:hover svg:last-child { opacity: 0.8; }
    .b24-inline-editor { display: flex; align-items: center; gap: 4px; }
    .b24-inline-editor select, .b24-inline-editor input[type="date"] { font-size: 11px; padding: 4px 8px; border: 1px solid var(--progress-fill-flat); border-radius: 6px; background: var(--bg-page); color: var(--text-primary); outline: none; height: 28px; }
    .b24-inline-cancel { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 14px; padding: 2px 4px; line-height: 1; }

    /* ── List ── */
    .b24-list { padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; }
    .b24-item { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 16px 18px; border-left: 3px solid var(--accent-default); box-shadow: var(--shadow-xs); transition: box-shadow 0.2s, border-color 0.2s; }
    .b24-item:hover { box-shadow: var(--shadow-sm); }
    .b24-item.status-paga { border-left-color: var(--accent-paid); }
    .b24-item.status-atrasada { border-left-color: var(--accent-overdue); }
    .b24-item.status-vencendo { border-left-color: var(--accent-pending); }
    .b24-item.status-pendente { border-left-color: var(--accent-default); }
    .b24-item.has-missing { border-left-color: var(--accent-pending); }
    .b24-item-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .b24-item-left { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .b24-item-title { font-size: 13px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }
    .b24-item-value { font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .b24-missing-icon { color: #b45309; font-size: 11px; cursor: help; display: inline-flex; align-items: center; gap: 3px; background: rgba(245,158,11,0.10); padding: 2px 8px; border-radius: 999px; }
    .b24-not-generated { color: #b45309; font-size: 11px; display: inline-flex; align-items: center; gap: 3px; background: rgba(245,158,11,0.15); border: 1px dashed #f59e0b; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
    .b24-item.not-generated { border-left-color: #f59e0b; background: linear-gradient(to right, rgba(245,158,11,0.04), transparent 40%); }
    .b24-btn-generate { background: #2563eb; color: #fff; border: 1px solid #2563eb; border-radius: var(--radius-sm); padding: 6px 14px; font-size: 12px; font-family: inherit; cursor: pointer; transition: all 0.15s; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
    .b24-btn-generate:hover:not(.b24-btn-disabled) { background: #1d4ed8; border-color: #1d4ed8; box-shadow: 0 2px 6px rgba(37,99,235,0.3); }
    .b24-btn-disabled { opacity: 0.5; cursor: not-allowed; background: #9ca3af !important; border-color: #9ca3af !important; }
    .b24-badge { display: inline-flex; align-items: center; background: var(--badge-bg); color: var(--badge-text); border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 600; white-space: nowrap; letter-spacing: 0.2px; }
    body.dark .b24-badge { background: var(--badge-bg-dark); color: var(--badge-text-dark); }
    .b24-item-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; flex-wrap: wrap; align-items: center; }
    .b24-item-meta span { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; }
    .b24-item-meta .b24-missing { color: #b45309; font-weight: 600; }
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
    .b24-select { flex: 1; height: 36px; font-size: 13px; font-family: inherit; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0 10px; background: var(--bg-card); color: var(--text-primary); outline: none; transition: all 0.15s; }
    .b24-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(27,110,243,0.15); }
    .b24-btn-emmely { background: var(--primary); color: #fff; border: none; padding: 0 16px; height: 36px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; transition: background 0.15s; }
    .b24-btn-emmely:hover { background: var(--primary-hover); }
    .b24-btn-primary { background: var(--primary); color: #fff; border: none; padding: 0 18px; height: 38px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; transition: background 0.15s; display: inline-flex; align-items: center; gap: 6px; }
    .b24-btn-primary:hover { background: var(--primary-hover); }
    .b24-btn-primary:active { transform: translateY(1px); }
    .b24-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .b24-btn-outline { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0 16px; height: 38px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer; transition: all 0.15s; }
    .b24-btn-outline:hover { background: var(--bg-page); border-color: var(--text-secondary); }

    .b24-create-bar { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 12px 24px; display: flex; justify-content: flex-end; }
    .b24-form-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; justify-content: center; align-items: center; backdrop-filter: blur(4px); }
    .b24-form-overlay.active { display: flex; }
    .b24-form-overlay { padding: 16px; box-sizing: border-box; }
    .b24-form-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 22px 26px; width: 720px; max-width: 96vw; max-height: 94vh; overflow-y: auto; box-shadow: var(--shadow-lg); }
    .b24-form-title { font-size: 17px; font-weight: 800; margin-bottom: 18px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; letter-spacing: -0.02em; }
    .b24-form-group { margin-bottom: 12px; }
    .b24-form-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-tertiary); margin-bottom: 5px; }
    .b24-input { width: 100%; height: 38px; font-size: 13px; font-family: inherit; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0 12px; background: var(--bg-card); color: var(--text-primary); outline: none; box-sizing: border-box; transition: border-color 0.15s, box-shadow 0.15s; }
    .b24-input:focus { border-color: var(--progress-fill-flat); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
    .b24-input.b24-invalid { border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.15); }
    .b24-form-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .b24-form-row > * { flex: 1; min-width: 140px; }
    .b24-form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; position: sticky; bottom: -22px; background: var(--bg-card); padding-top: 12px; }
    .b24-form-hint { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; }
    .b24-form-section { border:1px solid var(--border-color);border-radius:8px;padding:12px 14px;margin-bottom:12px;background:var(--bg-page); }
    .b24-form-section-title { font-weight: 700; font-size: 12px; color: var(--text-primary); margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
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
        <div class="b24-summary-icon">${icon("bank", 16)}</div>
        <div class="b24-summary-label">Total</div>
        <div class="b24-summary-value">${formatCurrency(totalValue, currency)}</div>
        <div class="b24-dual-currency" style="margin-top:2px">≈ ${formatCurrency(totalValue * EUR_TO_BRL, "BRL")}</div>
      </div>
      <div class="b24-summary-item stat-paid">
        <div class="b24-summary-icon">${icon("check-circle", 16)}</div>
        <div class="b24-summary-label">Pago</div>
        <div class="b24-summary-value" style="color:var(--value-paid)">${formatCurrency(paidValue, currency)}</div>
        <div class="b24-dual-currency" style="margin-top:2px">≈ ${formatCurrency(paidValue * EUR_TO_BRL, "BRL")}</div>
      </div>
      <div class="b24-summary-item stat-open">
        <div class="b24-summary-icon">${icon("clock", 16)}</div>
        <div class="b24-summary-label">Em Aberto</div>
        <div class="b24-summary-value" style="color:${openValue > 0 ? 'var(--value-open)' : 'var(--value-paid)'}">${formatCurrency(openValue, currency)}</div>
        <div class="b24-dual-currency" style="margin-top:2px">≈ ${formatCurrency(openValue * EUR_TO_BRL, "BRL")}</div>
      </div>
    </div>
    <div class="b24-progress-wrap">
      <div class="b24-progress">
        <div class="b24-progress-fill" style="width:${paidPct}%"></div>
      </div>
      <div class="b24-progress-label">${paidPct}%</div>
    </div>
    <div class="b24-summary-info">
      <span class="b24-editable-badge" onclick="openInlineEditor('gateway', this)" title="Clique para editar">
        ${icon("bank", 13)} Gateway: <strong id="badge-gateway">${opts.gateway || "—"}</strong> ${icon("pencil", 10)}
      </span>
      <div class="b24-inline-editor" id="editor-gateway" style="display:none">
        <select id="select-gateway" onchange="saveBadgeField('gateway')">
          <option value="">— Seleccionar —</option>
          ${(opts.gatewayOptions || []).map(o => `<option value="${o.id}" ${String(o.id) === String(opts.rawGateway || "") ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
        <button class="b24-inline-cancel" onclick="closeInlineEditor('gateway')">✕</button>
      </div>

      <span class="b24-editable-badge" onclick="openInlineEditor('method', this)" title="Clique para editar">
        ${icon("credit-card", 13)} Método: <strong id="badge-method">${opts.paymentMethod || "—"}</strong> ${icon("pencil", 10)}
      </span>
      <div class="b24-inline-editor" id="editor-method" style="display:none">
        <select id="select-method" onchange="saveBadgeField('method')">
          <option value="">— Seleccionar —</option>
          ${(opts.methodOptions || []).map(o => `<option value="${o.id}" ${String(o.id) === String(opts.rawMethod || "") ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
        <button class="b24-inline-cancel" onclick="closeInlineEditor('method')">✕</button>
      </div>

      <span class="b24-editable-badge" onclick="openInlineEditor('duedate', this)" title="Clique para editar">
        ${icon("calendar", 13)} Próx. vencimento: <strong id="badge-duedate">${opts.nextDueDate ? formatDate(opts.nextDueDate) : "—"}</strong> ${icon("pencil", 10)}
      </span>
      <div class="b24-inline-editor" id="editor-duedate" style="display:none">
        <input type="date" id="input-duedate" value="${opts.nextDueDate || ""}" onchange="saveBadgeField('duedate')">
        <button class="b24-inline-cancel" onclick="closeInlineEditor('duedate')">✕</button>
      </div>

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
    <div class="b24-form-row">
      <div class="b24-form-group">
        <label class="b24-form-label">Valor Total</label>
        <input type="number" id="pay-amount" class="b24-input" step="0.01" min="0.01" placeholder="0.00" oninput="calcInstallments()">
      </div>
      <div class="b24-form-group">
        <label class="b24-form-label">Moeda</label>
        <select id="pay-currency" class="b24-input" style="height:32px">
          <option value="EUR" ${currency === "EUR" ? "selected" : ""}>EUR</option>
          <option value="BRL" ${currency === "BRL" ? "selected" : ""}>BRL</option>
        </select>
      </div>
    </div>

    <!-- Bloco Entrada -->
    <div id="block-entrada" style="border:1px solid var(--border-color);border-radius:6px;padding:10px 12px;margin-bottom:12px;background:var(--bg-page)">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:8px">Entrada</div>
      <div class="b24-form-row">
        <div class="b24-form-group">
          <label class="b24-form-label">Valor da Entrada</label>
          <input type="number" id="pay-down" class="b24-input" step="0.01" min="0" value="0" placeholder="0.00" oninput="calcInstallments()">
        </div>
        <div class="b24-form-group">
          <label class="b24-form-label">Nº Parcelas da Entrada</label>
          <select id="pay-down-installments" class="b24-input" style="height:32px" onchange="calcInstallments()">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n => `<option value="${n}">${n}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="b24-form-row" id="pay-down-extra" style="display:none">
        <div class="b24-form-group">
          <label class="b24-form-label">Método da Entrada</label>
          <select id="pay-down-method" class="b24-input" style="height:32px" onchange="toggleMethodFields()">
            <option value="card">Cartão</option>
            <option value="customer_choice">Cliente escolhe (Stripe)</option>
            <option value="pix">PIX</option>
            <option value="boleto">Boleto</option>
            <option value="multibanco">Multibanco</option>
            <option value="mb_way">MB Way</option>
            <option value="direto">Recebimento Direto</option>
          </select>
        </div>
        <div class="b24-form-group">
          <label class="b24-form-label">1º Vencimento Entrada</label>
          <input type="date" id="pay-down-first-due" class="b24-input" onchange="calcInstallments()">
        </div>
        <div class="b24-form-group">
          <label class="b24-form-label">Intervalo Entrada</label>
          <select id="pay-down-interval" class="b24-input" style="height:32px" onchange="calcInstallments()">
            <option value="15">15 dias</option>
            <option value="30" selected>30 dias</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Bloco Parcelas (Saldo) -->
    <div style="border:1px solid var(--border-color);border-radius:6px;padding:10px 12px;margin-bottom:12px;background:var(--bg-page)">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:8px">Parcelas (Saldo)</div>
      <div class="b24-form-row">
        <div class="b24-form-group" id="group-num-installments">
          <label class="b24-form-label">Nº Parcelas</label>
          <select id="pay-installments" class="b24-input" style="height:32px" onchange="calcInstallments()">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n => `<option value="${n}"${n===1?' selected':''}>${n}</option>`).join("")}
          </select>
        </div>
        <div class="b24-form-group" id="group-interval">
          <label class="b24-form-label">Intervalo (dias)</label>
          <select id="pay-interval" class="b24-input" style="height:32px" onchange="calcInstallments()">
            <option value="30">30 dias</option>
            <option value="60">60 dias</option>
            <option value="90">90 dias</option>
          </select>
        </div>
        <div class="b24-form-group" id="group-first-due">
          <label class="b24-form-label" id="label-first-due">1º Vencimento</label>
          <input type="date" id="pay-first-due" class="b24-input" onchange="calcInstallments()">
        </div>
      </div>
      <div class="b24-form-row" id="row-installment-displays">
        <div class="b24-form-group">
          <label class="b24-form-label">Saldo a Parcelar</label>
          <div class="b24-readonly" id="pay-remaining-display">—</div>
        </div>
        <div class="b24-form-group">
          <label class="b24-form-label">Valor de cada Parcela</label>
          <div class="b24-readonly" id="pay-installment-value-display">—</div>
        </div>
      </div>
      <div class="b24-form-group">
        <label class="b24-form-label">Método do Saldo</label>
        <select id="pay-method" class="b24-input" style="height:32px" onchange="toggleMethodFields()">
          <option value="card">Cartão</option>
          <option value="customer_choice">Cliente escolhe (Stripe)</option>
          <option value="pix">PIX</option>
          <option value="boleto">Boleto</option>
          <option value="multibanco">Multibanco</option>
          <option value="mb_way">MB Way</option>
          <option value="direto">Recebimento Direto</option>
        </select>
      </div>
    </div>

    <div id="installment-preview" style="background:var(--bg-page);border:1px solid var(--border-color);border-radius:4px;padding:10px 12px;margin-bottom:12px;font-size:12px;display:none">
    </div>
    <div class="b24-form-group">
      <label class="b24-form-label">Descrição</label>
      <input type="text" id="pay-desc" class="b24-input" placeholder="${(dealTitle || "Negócio").replace(/"/g, "&quot;")}" value="${(dealTitle || "").replace(/"/g, "&quot;")}">
    </div>

    <!-- Bloco Dados do Cliente -->
    <div class="b24-form-section" id="customer-section">
      <div class="b24-form-section-title">
        <span>Dados do Cliente</span>
        <button type="button" onclick="toggleCustomerSection()" style="background:none;border:0;color:var(--link-color);font-size:11px;cursor:pointer;font-weight:600" id="customer-toggle-btn">Recolher</button>
      </div>
      <div id="customer-body">
        <div class="b24-form-row">
          <div class="b24-form-group">
            <label class="b24-form-label">Nome *</label>
            <input type="text" id="pay-name" class="b24-input" placeholder="Nome completo" value="${(contactName || "").replace(/"/g, "&quot;")}">
          </div>
          <div class="b24-form-group">
            <label class="b24-form-label">Email *</label>
            <input type="email" id="pay-email" class="b24-input" placeholder="email@exemplo.com" value="${(contactEmail || "").replace(/"/g, "&quot;")}">
          </div>
        </div>
        <div class="b24-form-row">
          <div class="b24-form-group">
            <label class="b24-form-label">Telefone</label>
            <input type="text" id="pay-phone" class="b24-input" placeholder="+351 900 000 000" value="${(contactPhone || "").replace(/"/g, "&quot;")}">
          </div>
          <div class="b24-form-group" id="cpf-group">
            <label class="b24-form-label">CPF / CNPJ / NIF</label>
            <input type="text" id="pay-cpf" class="b24-input" placeholder="000.000.000-00" value="${(contactCpfCnpj || "").replace(/"/g, "&quot;")}">
            <div class="b24-form-hint" id="cpf-hint">Obrigatório para BRL, Pix e Boleto</div>
          </div>
        </div>
        <div id="address-block">
          <div class="b24-form-row">
            <div class="b24-form-group" style="flex:0 0 140px">
              <label class="b24-form-label">CEP / Cód. Postal</label>
              <input type="text" id="pay-postal" class="b24-input" placeholder="00000-000" value="${(addr.postal_code || "").replace(/"/g, "&quot;")}">
            </div>
            <div class="b24-form-group" style="flex:2">
              <label class="b24-form-label">Endereço</label>
              <input type="text" id="pay-street" class="b24-input" placeholder="Rua / Avenida" value="${(addr.street || "").replace(/"/g, "&quot;")}">
            </div>
            <div class="b24-form-group" style="flex:0 0 90px">
              <label class="b24-form-label">Número</label>
              <input type="text" id="pay-number" class="b24-input" placeholder="123" value="${(addr.number || "").replace(/"/g, "&quot;")}">
            </div>
          </div>
          <div class="b24-form-row">
            <div class="b24-form-group">
              <label class="b24-form-label">Bairro</label>
              <input type="text" id="pay-district" class="b24-input" placeholder="Bairro" value="${(addr.district || "").replace(/"/g, "&quot;")}">
            </div>
            <div class="b24-form-group">
              <label class="b24-form-label">Cidade</label>
              <input type="text" id="pay-city" class="b24-input" placeholder="Cidade" value="${(addr.city || "").replace(/"/g, "&quot;")}">
            </div>
            <div class="b24-form-group" style="flex:0 0 90px">
              <label class="b24-form-label">UF</label>
              <input type="text" id="pay-state" class="b24-input" placeholder="SP" maxlength="4" value="${(addr.state || "").replace(/"/g, "&quot;")}">
            </div>
            <div class="b24-form-group" style="flex:0 0 90px">
              <label class="b24-form-label">País</label>
              <input type="text" id="pay-country" class="b24-input" placeholder="BR" maxlength="2" value="${(addr.country || (currency === "BRL" ? "BR" : "PT")).replace(/"/g, "&quot;")}">
            </div>
          </div>
          <div class="b24-form-hint" id="address-hint" style="display:none">Endereço completo é obrigatório para Boleto.</div>
        </div>
      </div>
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
        <option value="customer_choice">Cliente escolhe (Stripe)</option>
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
    <input type="hidden" id="baixa-fr-id">
    <input type="hidden" id="baixa-invoice-id">
    <input type="hidden" id="baixa-currency">
    <div class="b24-form-group">
      <label class="b24-form-label">Valor da Parcela</label>
      <div class="b24-readonly" id="baixa-total-display">—</div>
    </div>
    <div id="baixa-late-breakdown" style="display:none;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:12px">
      <div style="font-weight:700;margin-bottom:6px;color:var(--text-primary)">⚠️ Encargos por atraso</div>
      <div id="baixa-late-details"></div>
      <div style="margin-top:6px;font-weight:700;font-size:14px;color:var(--text-primary)" id="baixa-late-total-line"></div>
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
  var FRONTEND_BASE = "${(Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev").replace(/\/+$/, "")}";
  var MEMBER_ID = "${memberId}";
  var ENTITY_ID = "${opts.entityId}";
  var ENTITY_TYPE_ID = "${opts.entityTypeId || "2"}";
  var DEAL_RAW_GATEWAY = "${opts.rawGateway || ""}";
  var DEAL_RAW_METHOD = "${opts.rawMethod || ""}";
  var GATEWAY_OPTIONS = ${JSON.stringify(opts.gatewayOptions || [])};
  var METHOD_OPTIONS = ${JSON.stringify(opts.methodOptions || [])};
  var EUR_TO_BRL = 6.10;
  var _baixaOriginalAmount = 0;

  // ─── Editable Badges ─────────────────────────────────────────────
  var FIELD_MAP = {
    gateway: { field: 'UF_CRM_EMMELY_GATEWAY', varName: 'DEAL_RAW_GATEWAY' },
    method:  { field: 'UF_CRM_EMMELY_PAYMENT_METHOD', varName: 'DEAL_RAW_METHOD' },
    duedate: { field: 'UF_CRM_EMMELY_NEXT_DUE_DATE', varName: null }
  };

  function openInlineEditor(type, badgeEl) {
    var editor = document.getElementById('editor-' + type);
    if (!editor) return;
    // Hide badge, show editor
    if (badgeEl) badgeEl.style.display = 'none';
    editor.style.display = 'flex';
    editor.dataset.badgeEl = badgeEl ? 'badge-' + type : '';
  }

  function closeInlineEditor(type) {
    var editor = document.getElementById('editor-' + type);
    if (editor) editor.style.display = 'none';
    // Show badge again
    var badges = document.querySelectorAll('.b24-editable-badge');
    badges.forEach(function(b) { b.style.display = ''; });
  }

  async function saveBadgeField(type) {
    var config = FIELD_MAP[type];
    if (!config) return;
    var value = '';
    var displayLabel = '';
    if (type === 'duedate') {
      value = document.getElementById('input-duedate').value || '';
      displayLabel = value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    } else {
      var sel = document.getElementById('select-' + type);
      value = sel.value;
      displayLabel = sel.options[sel.selectedIndex].text || value;
    }
    if (!value) { closeInlineEditor(type); return; }
    // Visual feedback
    var badge = document.getElementById('badge-' + type);
    if (badge) badge.innerHTML = '⏳ Salvando...';
    closeInlineEditor(type);

    try {
      var fields = {};
      fields[config.field] = value;
      BX24.callMethod('crm.deal.update', { id: ENTITY_ID, fields: fields }, function(result) {
        if (result.error()) {
          if (badge) badge.textContent = '❌ Erro';
          setStatus('Erro ao atualizar: ' + result.error().ex.error_description, 'var(--accent-overdue)');
        } else {
          if (badge) badge.textContent = displayLabel;
          if (config.varName) window[config.varName] = value;
          setStatus('✅ ' + type + ' atualizado!', 'var(--value-paid)');
        }
      });
    } catch (e) {
      if (badge) badge.textContent = '❌ Erro';
      setStatus('Erro ao atualizar: ' + e.message, 'var(--accent-overdue)');
    }
  }

  // Ensure a real transaction exists — creates one if txId is synthetic (e.g. "deal-123")
  async function ensureTxExists(txId, overlayEl, amount, currency, description, financialRecordId, installmentNumber, totalInstallments) {
    // If we have a real transaction_id that is NOT the same as the financial_record_id, return it
    // (legacy records may pass financial_record_id as txId by mistake)
    if (txId && !txId.startsWith('deal-') && txId !== financialRecordId) return txId;
    // Create real transaction via payment-create POST, linking to financial_record if available
    console.log('[ensureTxExists] Creating synthetic tx. txId=' + txId + ' frId=' + financialRecordId);
    var entityId = (overlayEl && overlayEl.dataset && overlayEl.dataset.entityId) || ENTITY_ID;
    var meta = { bitrix_deal_id: entityId, source: 'bitrix24_payment_tab_synthetic' };
    if (installmentNumber) meta.installment_number = parseInt(installmentNumber) || installmentNumber;
    if (totalInstallments) meta.total_installments = parseInt(totalInstallments) || totalInstallments;
    // Include invoice_id in metadata if available
    var invoiceVal = document.getElementById('baixa-invoice-id');
    if (invoiceVal && invoiceVal.value) meta.bitrix_invoice_id = invoiceVal.value;
    var bodyPayload = {
      amount: amount || 0,
      currency: currency || 'EUR',
      payment_method: 'direto',
      force_gateway: 'direto',
      description: description || 'Parcela',
      metadata: meta
    };
    if (financialRecordId) bodyPayload.financial_record_id = financialRecordId;
    var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify(bodyPayload)
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
  function openCreateForm() {
    document.getElementById('create-overlay').classList.add('active');
    try { if (typeof BX24 !== 'undefined') { BX24.resizeWindow && BX24.resizeWindow(1200, 900); BX24.fitWindow && BX24.fitWindow(); } } catch(e){}
    toggleMethodFields();
    autoCollapseCustomerIfComplete();
    autoFillTotalFromProducts();
  }

  function autoFillTotalFromProducts() {
    var amountEl = document.getElementById('pay-amount');
    if (!amountEl) return;
    var current = parseFloat(amountEl.value) || 0;
    if (current > 0) { calcInstallments(); return; }
    var fallback = ${JSON.stringify(totalValue || 0)};
    function applyTotal(v) {
      if (v > 0) { amountEl.value = v.toFixed(2); }
      else if (fallback > 0) { amountEl.value = Number(fallback).toFixed(2); }
      calcInstallments();
    }
    if (typeof BX24 === 'undefined') { applyTotal(0); return; }
    try {
      if (ENTITY_TYPE_ID === '2') {
        BX24.callMethod('crm.deal.productrows.get', { id: ENTITY_ID }, function(res) {
          if (res.error()) { applyTotal(0); return; }
          var rows = res.data() || [];
          var sum = 0;
          for (var i=0;i<rows.length;i++) {
            var p = parseFloat(rows[i].PRICE) || 0;
            var q = parseFloat(rows[i].QUANTITY) || 0;
            sum += p * q;
          }
          applyTotal(sum);
        });
      } else {
        BX24.callMethod('crm.item.productrow.list', { filter: { '=ownerType': ENTITY_TYPE_ID === '1' ? 'L' : 'T' + ENTITY_TYPE_ID, '=ownerId': parseInt(ENTITY_ID) } }, function(res) {
          if (res.error()) { applyTotal(0); return; }
          var rows = (res.data() && res.data().productRows) || [];
          var sum = 0;
          for (var i=0;i<rows.length;i++) {
            var p = parseFloat(rows[i].price) || 0;
            var q = parseFloat(rows[i].quantity) || 0;
            sum += p * q;
          }
          applyTotal(sum);
        });
      }
    } catch(e) { applyTotal(0); }
  }
  function closeCreateForm() {
    document.getElementById('create-overlay').classList.remove('active');
    document.getElementById('pay-result').style.display = 'none';
  }
  function toggleCustomerSection() {
    var body = document.getElementById('customer-body');
    var btn = document.getElementById('customer-toggle-btn');
    if (body.style.display === 'none') { body.style.display = ''; btn.textContent = 'Recolher'; }
    else { body.style.display = 'none'; btn.textContent = 'Expandir'; }
  }
  function customerIsComplete() {
    var required = ['pay-name','pay-email'];
    for (var i=0;i<required.length;i++) { var v=(document.getElementById(required[i])||{}).value; if (!v || !String(v).trim()) return false; }
    return true;
  }
  function autoCollapseCustomerIfComplete() {
    if (customerIsComplete()) { var body=document.getElementById('customer-body'); var btn=document.getElementById('customer-toggle-btn'); if (body) body.style.display='none'; if (btn) btn.textContent='Expandir'; }
  }

  document.getElementById('pay-currency').addEventListener('change', function() {
    toggleMethodFields();
    calcInstallments();
  });

  function toggleMethodFields() {
    var method = (document.getElementById('pay-method')||{}).value || 'card';
    var downMethod = (document.getElementById('pay-down-method')||{}).value || method;
    var currency = (document.getElementById('pay-currency')||{}).value || 'EUR';
    var isDireto = method === 'direto';
    var emailEl = document.getElementById('pay-email');
    if (emailEl) emailEl.closest('.b24-form-group').style.opacity = isDireto ? '0.5' : '1';

    var needsCpf = currency === 'BRL' || method === 'boleto' || method === 'pix' || downMethod === 'boleto' || downMethod === 'pix';
    var cpfGroup = document.getElementById('cpf-group');
    if (cpfGroup) cpfGroup.style.opacity = needsCpf ? '1' : '0.85';

    var needsAddress = method === 'boleto' || downMethod === 'boleto';
    var addressBlock = document.getElementById('address-block');
    var addressHint = document.getElementById('address-hint');
    if (addressBlock) addressBlock.style.display = needsAddress ? 'block' : (currency === 'BRL' ? 'block' : 'none');
    if (addressHint) addressHint.style.display = needsAddress ? 'block' : 'none';
  }

  function initForm() {
    var interval = parseInt(document.getElementById('pay-interval').value) || 30;
    var d = new Date();
    d.setDate(d.getDate() + interval);
    document.getElementById('pay-first-due').value = d.toISOString().split('T')[0];
    var dEntry = new Date();
    document.getElementById('pay-down-first-due').value = dEntry.toISOString().split('T')[0];
    calcInstallments();
  }
  initForm();

  function calcInstallments() {
    var total = parseFloat(document.getElementById('pay-amount').value) || 0;
    var down = parseFloat(document.getElementById('pay-down').value) || 0;
    var downN = parseInt(document.getElementById('pay-down-installments').value) || 1;
    var downInterval = parseInt(document.getElementById('pay-down-interval').value) || 30;
    var downFirstDue = document.getElementById('pay-down-first-due').value;
    var numInst = parseInt(document.getElementById('pay-installments').value) || 1;
    var interval = parseInt(document.getElementById('pay-interval').value) || 30;
    var firstDue = document.getElementById('pay-first-due').value;
    var preview = document.getElementById('installment-preview');
    var extra = document.getElementById('pay-down-extra');
    if (extra) extra.style.display = down > 0 ? '' : 'none';
    var curCode = (document.getElementById('pay-currency')||{}).value || 'EUR';
    var curSym = curCode === 'BRL' ? 'R$ ' : (curCode === 'EUR' ? '€ ' : '');
    var remainEl = document.getElementById('pay-remaining-display');
    var instValEl = document.getElementById('pay-installment-value-display');
    if (total <= 0) {
      preview.style.display = 'none';
      if (remainEl) remainEl.textContent = '—';
      if (instValEl) instValEl.textContent = '—';
      return;
    }
    if (down > total) down = total;
    var remaining = total - down;
    var instValue = numInst > 0 ? Math.floor(remaining * 100 / numInst) / 100 : 0;
    var lastInst = remaining - (instValue * (numInst - 1));
    var downInstValue = downN > 0 ? Math.floor(down * 100 / downN) / 100 : 0;
    var lastDown = down - (downInstValue * (downN - 1));
    if (remainEl) remainEl.textContent = curSym + remaining.toFixed(2);
    if (instValEl) instValEl.textContent = numInst > 0 && remaining > 0
      ? (numInst + 'x de ' + curSym + instValue.toFixed(2))
      : '—';
    var lines = [];
    lines.push('<div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">Resumo do parcelamento</div>');
    lines.push('<div>Total: <strong>' + total.toFixed(2) + '</strong></div>');
    if (down > 0) {
      if (downN > 1) {
        lines.push('<div>Entrada: <strong>' + downN + 'x de ' + downInstValue.toFixed(2) + '</strong> (total ' + down.toFixed(2) + ')</div>');
        if (Math.abs(lastDown - downInstValue) > 0.001) lines.push('<div style="font-size:11px;color:var(--text-secondary)">Última parcela da entrada: ' + lastDown.toFixed(2) + '</div>');
      } else {
        lines.push('<div>Entrada: <strong>' + down.toFixed(2) + '</strong></div>');
      }
      if (downFirstDue) {
        var ed = [];
        for (var ei = 0; ei < downN && ei < 6; ei++) {
          var de = new Date(downFirstDue); de.setDate(de.getDate() + (downInterval * ei));
          ed.push(de.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }));
        }
        if (downN > 6) ed.push('...');
        lines.push('<div style="font-size:11px;color:var(--text-secondary)">Vencimentos entrada: ' + ed.join(', ') + '</div>');
      }
    }
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
        lines.push('<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">Vencimentos parcelas: ' + dates.join(', ') + '</div>');
      }
    }
    var totalParcelas = (down > 0 ? downN : 0) + (remaining > 0 ? numInst : 0);
    lines.push('<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">Total de faturas: ' + totalParcelas + '</div>');
    preview.innerHTML = lines.join('');
    preview.style.display = 'block';
    scheduleBitrixSync({
      total: total,
      down: down,
      remaining: remaining,
      numInst: numInst,
      instValue: instValue,
      firstDue: firstDue,
      method: (document.getElementById('pay-method')||{}).value || null,
      currency: curCode
    });
  }

  var _bxSyncTimer = null;
  var _bxSyncLast = '';
  function scheduleBitrixSync(payload) {
    if (typeof BX24 === 'undefined' || !ENTITY_ID) return;
    if (_bxSyncTimer) clearTimeout(_bxSyncTimer);
    _bxSyncTimer = setTimeout(function() {
      var sig = JSON.stringify(payload);
      if (sig === _bxSyncLast) return;
      _bxSyncLast = sig;
      var fields = {
        OPPORTUNITY: payload.total,
        CURRENCY_ID: payload.currency,
        UF_CRM_EMMELY_TOTAL_INSTALLMENTS: payload.numInst,
        UF_CRM_EMMELY_INSTALLMENT_VALUE: payload.instValue
      };
      if (payload.firstDue) fields.UF_CRM_EMMELY_NEXT_DUE_DATE = payload.firstDue;
      if (payload.method) fields.UF_CRM_EMMELY_PAYMENT_METHOD = payload.method;
      try {
        if (ENTITY_TYPE_ID === '1') {
          BX24.callMethod('crm.lead.update', { id: parseInt(ENTITY_ID), fields: fields }, function(){});
        } else if (ENTITY_TYPE_ID === '2') {
          BX24.callMethod('crm.deal.update', { id: parseInt(ENTITY_ID), fields: fields }, function(){});
        } else {
          // SPA: camelCase field names
          var spaFields = {};
          for (var k in fields) {
            var camel = k.toLowerCase().replace(/_([a-z])/g, function(_, c){ return c.toUpperCase(); });
            spaFields[camel] = fields[k];
          }
          BX24.callMethod('crm.item.update', { entityTypeId: parseInt(ENTITY_TYPE_ID), id: parseInt(ENTITY_ID), fields: spaFields }, function(){});
        }
      } catch(e) { console.warn('[EmmelyPay] sync bitrix falhou', e); }
    }, 800);
  }


  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  var submitInFlight = false;
  async function submitInstallments() {
    if (submitInFlight) { console.log('[pay] submit already in flight, ignoring'); return; }
    var totalAmount = parseFloat(document.getElementById('pay-amount').value);
    if (!totalAmount || totalAmount <= 0) { showPayResult('Informe um valor válido.', true); return; }
    var downPayment = parseFloat(document.getElementById('pay-down').value) || 0;
    var downN = parseInt(document.getElementById('pay-down-installments').value) || 1;
    var downInterval = parseInt(document.getElementById('pay-down-interval').value) || 30;
    var downFirstDue = document.getElementById('pay-down-first-due').value || new Date().toISOString().split('T')[0];
    var downMethod = (document.getElementById('pay-down-method') || {}).value || 'pix';
    var numInstallments = parseInt(document.getElementById('pay-installments').value) || 1;
    var interval = parseInt(document.getElementById('pay-interval').value) || 30;
    var firstDue = document.getElementById('pay-first-due').value;
    var currency = document.getElementById('pay-currency').value;
    var method = document.getElementById('pay-method').value;
    var desc = document.getElementById('pay-desc').value || 'Pagamento';
    function val(id){ var el=document.getElementById(id); return el ? String(el.value||'').trim() : ''; }
    function mark(id, bad){ var el=document.getElementById(id); if(!el) return; if(bad) el.classList.add('b24-invalid'); else el.classList.remove('b24-invalid'); }
    ['pay-name','pay-email','pay-cpf','pay-postal','pay-street','pay-number','pay-city','pay-state'].forEach(function(k){ mark(k,false); });

    var name = val('pay-name');
    var email = val('pay-email');
    var cpf = val('pay-cpf');
    var phone = val('pay-phone');
    var postal = val('pay-postal');
    var street = val('pay-street');
    var number = val('pay-number');
    var district = val('pay-district');
    var city = val('pay-city');
    var state = val('pay-state');
    var country = val('pay-country') || (currency === 'BRL' ? 'BR' : 'PT');

    var missing = [];
    if (!name) { missing.push('Nome'); mark('pay-name', true); }
    if (!email || !/.+@.+\..+/.test(email)) { missing.push('Email válido'); mark('pay-email', true); }
    var needsCpf = currency === 'BRL' || method === 'boleto' || method === 'pix' || downMethod === 'boleto' || downMethod === 'pix';
    if (needsCpf && !cpf) { missing.push('CPF/CNPJ'); mark('pay-cpf', true); }
    var needsAddr = method === 'boleto' || downMethod === 'boleto';
    if (needsAddr) {
      if (!postal) { missing.push('CEP'); mark('pay-postal', true); }
      if (!street) { missing.push('Endereço'); mark('pay-street', true); }
      if (!number) { missing.push('Número'); mark('pay-number', true); }
      if (!city)   { missing.push('Cidade'); mark('pay-city', true); }
      if (!state)  { missing.push('UF'); mark('pay-state', true); }
    }
    if (downPayment > totalAmount) { showPayResult('Entrada não pode ser maior que o total.', true); return; }
    if (missing.length) {
      var body=document.getElementById('customer-body'); var btnT=document.getElementById('customer-toggle-btn');
      if (body) body.style.display=''; if (btnT) btnT.textContent='Recolher';
      showPayResult('Preencha os campos obrigatórios: ' + missing.join(', ') + '.', true);
      return;
    }
    var customerData = {
      name: name, email: email, cpf_cnpj: cpf || undefined, phone: phone || undefined,
      address: {
        postal_code: postal || undefined, street: street || undefined, number: number || undefined,
        district: district || undefined, city: city || undefined, state: state || undefined, country: country || undefined
      }
    };
    var remaining = totalAmount - downPayment;
    var instValue = numInstallments > 0 ? Math.floor(remaining * 100 / numInstallments) / 100 : 0;
    var lastInstValue = remaining - (instValue * (numInstallments - 1));
    var downInstValue = downN > 0 ? Math.floor(downPayment * 100 / downN) / 100 : 0;
    var lastDownValue = downPayment - (downInstValue * (downN - 1));
    var groupId = generateUUID();
    var submitKey = ENTITY_ID + ':' + Date.now() + ':' + Math.random().toString(36).slice(2);
    var hasDown = downPayment > 0;
    var totalCount = (hasDown ? downN : 0) + (remaining > 0 ? numInstallments : 0);
    var parcels = [];
    if (hasDown) {
      for (var di = 0; di < downN; di++) {
        var dDue = new Date(downFirstDue); dDue.setDate(dDue.getDate() + (downInterval * di));
        var dVal = (di === downN - 1) ? lastDownValue : downInstValue;
        parcels.push({
          amount: dVal, due_date: dDue.toISOString().split('T')[0],
          installment_number: di + 1, total_in_group: downN,
          is_down_payment: true, method: downMethod
        });
      }
    }
    if (remaining > 0) {
      for (var i = 0; i < numInstallments; i++) {
        var dueDate = new Date(firstDue); dueDate.setDate(dueDate.getDate() + (interval * i));
        var val = (i === numInstallments - 1) ? lastInstValue : instValue;
        parcels.push({
          amount: val, due_date: dueDate.toISOString().split('T')[0],
          installment_number: i + 1, total_in_group: numInstallments,
          is_down_payment: false, method: method
        });
      }
    }
    if (currency === 'BRL') {
      for (var p = 0; p < parcels.length; p++) {
        if (parcels[p].amount < 5) { showPayResult('Cada parcela deve ter no mínimo R$ 5,00. Parcela ' + (p+1) + ' tem R$ ' + parcels[p].amount.toFixed(2), true); return; }
      }
    }
    submitInFlight = true;
    var btn = document.getElementById('pay-submit');
    btn.disabled = true;
    var errors = [];
    var createdTxIds = [];
    var createdResults = []; // { parcel, payment_url, tx_id, method }
    var dealFieldsExtra = {
      UF_CRM_EMMELY_TOTAL_AMOUNT: totalAmount,
      UF_CRM_EMMELY_DOWN_PAYMENT: downPayment,
      UF_CRM_EMMELY_DOWN_INSTALLMENTS: hasDown ? downN : 0,
      UF_CRM_EMMELY_DOWN_METHOD: hasDown ? downMethod : '',
      UF_CRM_EMMELY_DOWN_FIRST_DUE: hasDown ? downFirstDue : '',
      UF_CRM_EMMELY_DOWN_INTERVAL: hasDown ? downInterval : 0,
      UF_CRM_EMMELY_REMAINING_BALANCE: remaining,
      UF_CRM_EMMELY_FIRST_DUE_DATE: (remaining > 0) ? firstDue : '',
      UF_CRM_EMMELY_INSTALLMENT_INTERVAL: (remaining > 0) ? interval : 0
    };
    for (var j = 0; j < parcels.length; j++) {
      var parcel = parcels[j];
      btn.textContent = 'A criar ' + (j+1) + '/' + parcels.length + '...';
      showPayResult('A criar fatura ' + (j+1) + ' de ' + parcels.length + '...', false);
      var parcelLabel = parcel.is_down_payment
        ? (parcel.total_in_group > 1 ? ' (Entrada ' + parcel.installment_number + '/' + parcel.total_in_group + ')' : ' (Entrada)')
        : ' (Parcela ' + parcel.installment_number + '/' + parcel.total_in_group + ')';
      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({
            amount: parcel.amount, currency: currency, payment_method: parcel.method,
            force_gateway: DEAL_RAW_GATEWAY || undefined,
            description: desc + parcelLabel,
            customer_data: customerData,
            due_date: parcel.due_date,
            installment_number: parcel.is_down_payment ? 0 : parcel.installment_number,
            total_installments: totalCount, installment_group_id: groupId, is_down_payment: parcel.is_down_payment,
            deal_fields_extra: dealFieldsExtra,
            metadata: {
              bitrix_deal_id: ENTITY_ID, source: 'bitrix24_payment_tab',
              client_submit_key: submitKey + ':' + j,
              down_payment_index: parcel.is_down_payment ? parcel.installment_number : undefined,
              down_payment_total: parcel.is_down_payment ? parcel.total_in_group : undefined
            }
          })
        });
        var data = await res.json();
        if (data.error) { errors.push('Fatura ' + (j+1) + ': ' + data.error); }
        else if (data.transaction) {
          createdTxIds.push({ txId: data.transaction.id, parcel: parcel, index: j });
          createdResults.push({
            parcel: parcel,
            tx_id: data.transaction.id,
            payment_url: data.payment_url || data.transaction.payment_url || null,
            method: parcel.method
          });
        }
      } catch (e) { errors.push('Fatura ' + (j+1) + ': ' + e.message); }
    }
    if (createdTxIds.length > 0 && typeof BX24 !== 'undefined') {
      btn.textContent = 'A criar faturas no CRM...';
      showPayResult('A criar Smart Invoices no Bitrix24...', false);
      try {
        for (var k = 0; k < createdTxIds.length; k++) {
          var item = createdTxIds[k];
          var invoiceLabel = item.parcel.is_down_payment ? ('Entrada ' + item.parcel.installment_number + '/' + item.parcel.total_in_group) : ('Parcela ' + item.parcel.installment_number + '/' + item.parcel.total_in_group);
          var invoiceTitle = invoiceLabel + ' - ' + (desc || 'Negócio');
          await new Promise(function(resolve) {
            BX24.callMethod('crm.item.add', {
               entityTypeId: 31,
               fields: { title: invoiceTitle, opportunity: item.parcel.amount, currencyId: currency, isManualOpportunity: 'Y', parentId2: parseInt(ENTITY_ID), begindate: new Date().toISOString().split('T')[0], closedate: item.parcel.due_date, comments: 'Fatura gerada automaticamente pelo Emmely Pay. ' + invoiceLabel + '. Grupo: ' + groupId, UF_CRM_69B83DDB1F59D: 9391, UF_CRM_69B83DDB2661E: groupId, UF_CRM_69B83DDB2B85D: DEAL_RAW_GATEWAY || 'stripe', UF_CRM_69B83DDB3EAFC: String(numInstallments), UF_CRM_69B83DDB4C552: item.parcel.amount, UF_CRM_69B83DDB525C9: item.parcel.due_date }
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
    if (errors.length > 0) {
      btn.disabled = false;
      btn.textContent = 'Criar Cobrança';
      submitInFlight = false;
      showPayResult('Erros: ' + errors.join('; '), true);
    } else {
      btn.textContent = createdResults.length + ' fatura(s) criada(s)';
      renderPaymentLinks(createdResults, numInstallments);
    }
  }

  function renderPaymentLinks(results, numInstallments) {
    var el = document.getElementById('pay-result');
    var isDirect = function(m) { return m === 'direto' || m === 'parcelado_direto'; };
    var rows = results.map(function(r, idx) {
      var label = r.parcel.is_down_payment ? ('Entrada ' + r.parcel.installment_number + '/' + r.parcel.total_in_group) : ('Parcela ' + r.parcel.installment_number + '/' + r.parcel.total_in_group);
      var amountStr = r.parcel.amount.toFixed(2);
      if (isDirect(r.method) || !r.payment_url) {
        return '<div style="margin:8px 0;padding:8px;border:1px solid var(--border-color);border-radius:4px"><div style="font-weight:600;font-size:12px">' + label + ' — ' + amountStr + '</div><div style="font-size:11px;color:var(--text-secondary);margin-top:4px">' + (isDirect(r.method) ? 'Recebimento direto — sem link de pagamento.' : 'Sem link disponível.') + '</div></div>';
      }
      var inputId = 'pay-link-' + idx;
      return '<div style="margin:8px 0;padding:8px;border:1px solid var(--border-color);border-radius:4px">' +
        '<div style="font-weight:600;font-size:12px;margin-bottom:6px">' + label + ' — ' + amountStr + '</div>' +
        '<div style="display:flex;gap:4px;align-items:center">' +
          '<input id="' + inputId + '" type="text" readonly value="' + r.payment_url.replace(/"/g,'&quot;') + '" style="flex:1;min-width:0;padding:4px 6px;border:1px solid var(--border-color);border-radius:3px;font-size:11px;background:var(--bg-page)" onclick="this.select()">' +
          '<button class="b24-btn-outline" style="padding:4px 8px;font-size:11px" onclick="copyPayLink(\\'' + inputId + '\\', this)">Copiar</button>' +
          '<button class="b24-btn-outline" style="padding:4px 8px;font-size:11px" onclick="window.open(\\'' + r.payment_url.replace(/'/g, "\\\\'") + '\\', \\'_blank\\')">Abrir</button>' +
        '</div>' +
      '</div>';
    }).join('');
    el.innerHTML = '<div style="color:var(--value-paid);font-weight:600;margin-bottom:4px">Cobrança criada com sucesso</div>' + rows +
      '<div style="margin-top:10px;display:flex;justify-content:flex-end">' +
      '<button class="b24-btn-primary" onclick="location.reload()">Fechar e atualizar</button>' +
      '</div>';
    el.style.display = 'block';
    el.style.color = '';
  }

  function copyPayLink(inputId, btn) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    inp.select();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inp.value);
      } else {
        document.execCommand('copy');
      }
      var orig = btn.textContent;
      btn.textContent = 'Copiado!';
      setTimeout(function() { btn.textContent = orig; }, 1500);
    } catch (e) { console.error('copy failed', e); }
  }


  function showPayResult(msg, isError) {
    var el = document.getElementById('pay-result');
    el.innerHTML = msg; el.style.display = 'block';
    el.style.color = isError ? 'var(--value-open)' : 'var(--value-paid)';
  }

  // === Resolve Deal payment status enum ID ===
  var _dealStatusCache = null;
  function resolveDealPaymentStatusId(label, callback) {
    if (_dealStatusCache) {
      var match = _dealStatusCache.find(function(i) { return i.VALUE === label; });
      callback(match ? match.ID : label);
      return;
    }
    if (typeof BX24 === 'undefined') { callback(label); return; }
    BX24.callMethod('crm.deal.fields', {}, function(result) {
      if (result.error()) { callback(label); return; }
      var fields = result.data();
      var items = (fields && fields.UF_CRM_EMMELY_PAYMENT_STATUS && fields.UF_CRM_EMMELY_PAYMENT_STATUS.items) || [];
      _dealStatusCache = items;
      var match = items.find(function(i) { return i.VALUE === label; });
      callback(match ? match.ID : label);
    });
  }

  // === Toggle Flow Row ===
  function toggleFlowRow(instId) {
    var row = document.getElementById('flow-row-' + instId);
    if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  }

  function updatePaymentReportFields(token) {
    if (!token || typeof BX24 === 'undefined') return;
    var receiptUrl = SUPABASE_URL + '/functions/v1/payment-receipt?token=' + token;
    var reportUrl = FRONTEND_BASE + '/pagamento/' + token;
    try {
      BX24.callMethod('crm.deal.userfield.add', {
        fields: {
          FIELD_NAME: 'UF_CRM_EMMELY_TOKEN_PAY',
          USER_TYPE_ID: 'string',
          SORT: 0,
          EDIT_FORM_LABEL: { br: 'TOKEN_PAY', en: 'TOKEN_PAY', pt: 'TOKEN_PAY' },
          LIST_COLUMN_LABEL: { br: 'TOKEN_PAY', en: 'TOKEN_PAY', pt: 'TOKEN_PAY' },
          LIST_FILTER_LABEL: { br: 'TOKEN_PAY', en: 'TOKEN_PAY', pt: 'TOKEN_PAY' }
        }
      }, function() {
        BX24.callMethod('crm.deal.update', {
          id: parseInt(ENTITY_ID),
          fields: {
            UF_CRM_EMMELY_RECEIPT_URL: receiptUrl,
            UF_CRM_EMMELY_RELATORIO_PAY: reportUrl,
            UF_CRM_EMMELY_TOKEN_PAY: token
          }
        }, function(r) { if (r.error()) console.error('Payment report fields update error:', r.error()); });
      });
    } catch(e) { console.error('Payment report fields update error:', e); }
  }

  async function generatePaymentLink(inst) {
    // --- Dedup: if link already exists, just copy it ---
    if (inst.payment_url) {
      navigator.clipboard.writeText(inst.payment_url).catch(function(){});
      setStatus('✅ Link já existente copiado! ' + inst.payment_url, 'var(--value-paid)');
      // Also write back to Bitrix field
      try { resolveDealPaymentStatusId('Pendente', function(statusId) { BX24.callMethod('crm.deal.update', { id: ENTITY_ID, fields: { UF_CRM_EMMELY_PAYMENT_URL: inst.payment_url, UF_CRM_EMMELY_PAYMENT_STATUS: statusId } }); }); } catch(e){}
      return;
    }

    // --- Disable button to prevent double-clicks ---
    var btns = document.querySelectorAll('.b24-btn-action');
    btns.forEach(function(b) { b.disabled = true; });

    setStatus('A gerar link de pagamento...', 'var(--text-secondary)');
    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({
          amount: inst.value || 0,
          currency: inst.currency || 'EUR',
          payment_method: inst.payment_method || 'card',
          force_gateway: DEAL_RAW_GATEWAY || undefined,
          description: inst.description || 'Pagamento',
          financial_record_id: inst.financial_record_id || undefined,
          transaction_id: inst.transaction_id || undefined,
          metadata: { bitrix_deal_id: ENTITY_ID, source: 'bitrix24_payment_tab_link' }
        })
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.transaction && data.transaction.payment_url) {
        navigator.clipboard.writeText(data.transaction.payment_url).catch(function(){});
        setStatus('✅ Link gerado e copiado! ' + data.transaction.payment_url, 'var(--value-paid)');
        // Write payment URL back to Bitrix24 deal field
        try { resolveDealPaymentStatusId('Pendente', function(statusId) { BX24.callMethod('crm.deal.update', { id: ENTITY_ID, fields: { UF_CRM_EMMELY_PAYMENT_URL: data.transaction.payment_url, UF_CRM_EMMELY_PAYMENT_STATUS: statusId } }); }); } catch(e){}
        // Create Smart Invoice in Bitrix24 linked to this Deal
        if (typeof BX24 !== 'undefined' && data.transaction.id) {
          try {
            var invoiceTitle = (inst.description || 'Pagamento') + ' - Negócio ' + ENTITY_ID;
            await new Promise(function(resolve) {
              BX24.callMethod('crm.item.add', {
                entityTypeId: 31,
                fields: {
                  title: invoiceTitle,
                  opportunity: inst.value || 0,
                  currencyId: inst.currency || 'EUR',
                  isManualOpportunity: 'Y',
                  parentId2: parseInt(ENTITY_ID),
                  begindate: new Date().toISOString().split('T')[0],
                  closedate: inst.due_date || new Date().toISOString().split('T')[0],
                  comments: 'Fatura gerada automaticamente pelo Emmely Pay via link de pagamento.',
                  UF_CRM_69B83DDB1F59D: 9391,
                  UF_CRM_69B83DDB2B85D: DEAL_RAW_GATEWAY || 'stripe',
                  UF_CRM_69B83DDB38FF9: data.transaction.payment_url,
                  UF_CRM_69B83DDB3EAFC: '1',
                  UF_CRM_69B83DDB4C552: inst.value || 0,
                  UF_CRM_69B83DDB525C9: inst.due_date || new Date().toISOString().split('T')[0]
                }
              }, function(result) {
                if (result.error()) { console.error('Smart Invoice error:', result.error()); resolve(null); }
                else {
                  var invoiceId = result.data() && result.data().item ? result.data().item.id : null;
                  if (invoiceId) {
                    // Patch transaction metadata with bitrix_invoice_id
                    fetch(SUPABASE_URL + '/functions/v1/payment-create', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
                      body: JSON.stringify({ transaction_id: data.transaction.id, metadata_update: { bitrix_invoice_id: invoiceId } })
                    }).then(function() { resolve(invoiceId); }).catch(function() { resolve(invoiceId); });
                  } else { resolve(null); }
                }
              });
            });
          } catch (e) { console.error('Smart Invoice creation error:', e); }
        }
        setTimeout(function() { location.reload(); }, 3000);
      } else {
        setStatus('⚠ Cobrança criada mas sem link (método direto?)', 'var(--text-secondary)');
        setTimeout(function() { location.reload(); }, 2000);
      }
    } catch(e) {
      setStatus('Erro: ' + e.message, 'var(--value-open)');
    } finally {
      btns.forEach(function(b) { b.disabled = false; });
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
      txId = await ensureTxExists(txId, editOverlay, parseFloat(editOverlay.dataset.amount) || 0, editOverlay.dataset.currency || 'EUR', editOverlay.dataset.description || '', null, null, null);

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

      // Sync back to parent entity (Deal/Lead/SPA) UF fields so Emmely Pay stays consistent
      // with what's in Bitrix24 next time it opens.
      try {
        var entityKind = ENTITY_TYPE_ID === '1' ? 'lead' : (ENTITY_TYPE_ID === '2' ? 'deal' : 'spa');
        var syncBody = {
          member_id: MEMBER_ID,
          deal_id: ENTITY_ID,
          entity_type: entityKind,
          payment_data: {
            next_due_date: payload.due_date_update,
            payment_method: payload.payment_method_update,
            installment_value: payload.amount_update,
          }
        };
        if (entityKind === 'spa') syncBody.spa_entity_type_id = ENTITY_TYPE_ID;
        await fetch(SUPABASE_URL + '/functions/v1/bitrix24-update-deal-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
          body: JSON.stringify(syncBody)
        });
      } catch(syncErr) { console.warn('[submitEdit] Bitrix sync failed:', syncErr); }

      el.innerHTML = 'Parcela atualizada com sucesso!'; el.style.color = 'var(--value-paid)'; el.style.display = 'block';
      setTimeout(function() { location.reload(); }, 1500);
    } catch(e) {
      el.innerHTML = 'Erro: ' + e.message; el.style.color = 'var(--value-open)'; el.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Guardar';
  }

  // === Baixa Modal ===
  var _baixaLateFees = { penalty: 0, interest: 0, charges: 0, days: 0, total: 0 };

  function openBaixaModal(inst) {
    _baixaOriginalAmount = inst.value || 0;
    var cur = inst.currency || 'EUR';
    var fmt = function(v) { return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur }).format(v); };

    // Calculate late fee data from inst
    var latePenalty = inst.late_penalty || 0;
    var lateInterest = inst.late_interest || 0;
    var lateDays = inst.late_days || 0;
    var lateCharges = latePenalty + lateInterest;
    var lateTotal = inst.late_total || _baixaOriginalAmount;
    _baixaLateFees = { penalty: latePenalty, interest: lateInterest, charges: lateCharges, days: lateDays, total: lateTotal };

    document.getElementById('baixa-tx-id').value = inst.transaction_id || '';
    document.getElementById('baixa-fr-id').value = inst.financial_record_id || (inst.transaction_id ? '' : inst.id);
    document.getElementById('baixa-invoice-id').value = inst.invoice_id || '';
    document.getElementById('baixa-currency').value = cur;
    document.getElementById('baixa-total-display').textContent = fmt(_baixaOriginalAmount);

    // Show late fee breakdown if applicable
    var breakdownEl = document.getElementById('baixa-late-breakdown');
    if (lateCharges > 0) {
      breakdownEl.style.display = 'block';
      document.getElementById('baixa-late-details').innerHTML =
        'Multa: <strong>' + fmt(latePenalty) + '</strong><br>' +
        'Juros (' + lateDays + ' dias): <strong>' + fmt(lateInterest) + '</strong>';
      document.getElementById('baixa-late-total-line').textContent = '💵 Total com encargos: ' + fmt(lateTotal);
      // Pre-fill with late total
      document.getElementById('baixa-paid').value = lateTotal;
    } else {
      breakdownEl.style.display = 'none';
      document.getElementById('baixa-paid').value = _baixaOriginalAmount;
    }

    document.getElementById('baixa-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('baixa-discount-row').style.display = 'none';
    document.getElementById('baixa-reason-group').style.display = 'none';
    document.getElementById('baixa-reason-other-group').style.display = 'none';
    document.getElementById('baixa-proof').value = '';
    document.getElementById('baixa-result').style.display = 'none';
    // Store entity info for synthetic creation
    var overlay = document.getElementById('baixa-overlay');
    overlay.dataset.entityId = inst.entity_id || ENTITY_ID;
    overlay.dataset.currency = cur;
    overlay.dataset.description = inst.description || '';
    overlay.dataset.installmentNumber = inst.number || '';
    overlay.dataset.totalInstallments = inst.total || '';
    overlay.classList.add('active');
    calcDiscount();
  }
  function closeBaixaModal() { document.getElementById('baixa-overlay').classList.remove('active'); }

  function calcDiscount() {
    var paid = parseFloat(document.getElementById('baixa-paid').value) || 0;
    // The expected full amount is late_total (includes late fees) if there are charges
    var expectedAmount = _baixaLateFees.charges > 0 ? _baixaLateFees.total : _baixaOriginalAmount;
    var discount = expectedAmount - paid;
    var cur = document.getElementById('baixa-currency').value || 'EUR';
    var fmt = function(v) { return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur }).format(v); };
    if (discount > 0.001) {
      document.getElementById('baixa-discount-row').style.display = 'block';
      var label = _baixaLateFees.charges > 0 ? 'Total c/ encargos' : 'Parcela';
      document.getElementById('baixa-discount-display').innerHTML = '💰 <strong>Diferença: ' + fmt(discount) + '</strong><br><span style="font-size:11px">' + label + ': ' + fmt(expectedAmount) + ' → Pago: ' + fmt(paid) + '</span><br><span style="font-size:11px;color:var(--accent-overdue)">⚠️ A diferença será somada à próxima parcela pendente</span>';
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
    var frId = document.getElementById('baixa-fr-id').value;
    var invoiceId = document.getElementById('baixa-invoice-id').value;
    var paidAmount = parseFloat(document.getElementById('baixa-paid').value) || 0;
    var paidDate = document.getElementById('baixa-date').value || new Date().toISOString().split('T')[0];
    // Expected amount is late_total if there are late fees, otherwise original amount
    var expectedAmount = _baixaLateFees.charges > 0 ? _baixaLateFees.total : _baixaOriginalAmount;
    var discount = expectedAmount - paidAmount;
    var reason = '';
    if (discount > 0.001) {
      reason = document.getElementById('baixa-reason').value;
      if (reason === 'Outro') reason = document.getElementById('baixa-reason-other').value || 'Outro';
    }
    var btn = document.getElementById('baixa-submit');
    btn.disabled = true; btn.textContent = 'A processar...';
    var el = document.getElementById('baixa-result');

    try {
      // Ensure transaction exists (create if synthetic or missing)
      var overlay = document.getElementById('baixa-overlay');
      txId = await ensureTxExists(txId, overlay, _baixaOriginalAmount, overlay.dataset.currency || 'EUR', overlay.dataset.description || '', frId, overlay.dataset.installmentNumber, overlay.dataset.totalInstallments);

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
        financial_record_id: frId || undefined,
        status_update: 'confirmed',
        paid_amount: paidAmount,
        metadata_update: {
          manual_paid: true,
          paid_at: paidDate + 'T00:00:00Z',
          late_fee: _baixaLateFees.charges > 0 ? {
            penalty: _baixaLateFees.penalty,
            interest: _baixaLateFees.interest,
            charges: _baixaLateFees.charges,
            days_late: _baixaLateFees.days,
            base_amount: _baixaOriginalAmount
          } : undefined,
          expected_amount: _baixaLateFees.charges > 0 ? _baixaLateFees.total : _baixaOriginalAmount
        },
      };
      if (discount > 0.001 && reason) {
        payload.discount_amount = discount;
        payload.discount_reason = reason;
      } else if (discount > 0.001 && !reason) {
        // No reason = carry over to next installment
        payload.carry_over_amount = discount;
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
          var closeDateStr = new Date().toISOString().split('T')[0] + 'T00:00:00+00:00';
          BX24.callMethod('crm.item.update', {
            entityTypeId: 31, id: parseInt(invoiceId),
            fields: { stageId: 'DT31_3:P', moved: 'Y', closedate: closeDateStr }
          }, function(r) {
            if (r.error()) {
              console.error('Invoice close error:', r.error());
              BX24.callMethod('crm.invoice.update', { ID: parseInt(invoiceId), fields: { STATUS_ID: 'P' } }, function() { resolve(null); });
            } else { resolve(null); }
          });
        });
      }

      // Auto-create receipt_link and update Bitrix24 UF fields
      try {
        var rlRes = await fetch(SUPABASE_URL + '/rest/v1/receipt_links?bitrix24_deal_id=eq.' + encodeURIComponent(document.getElementById('baixa-overlay').dataset.dealId || '${opts.entityId}') + '&limit=1', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        var rlData = await rlRes.json();
        var receiptToken = null;
        if (!rlData || rlData.length === 0) {
          var createRlRes = await fetch(SUPABASE_URL + '/rest/v1/receipt_links', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify({ bitrix24_deal_id: '${opts.entityId}', client_name: null, deal_title: '${(opts.dealTitle || "").replace(/'/g, "\\'")}' })
          });
          var created = await createRlRes.json();
          receiptToken = (created && created[0]) ? created[0].token : null;
        } else {
          receiptToken = rlData[0].token;
        }
        // Update Bitrix24 deal with receipt/report URLs and TOKEN_PAY
        if (receiptToken) {
          updatePaymentReportFields(receiptToken);
        }
      } catch(rlErr) { console.error('Receipt link error:', rlErr); }

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

   async function copyReceiptLink() {
    setStatus('A obter link do comprovante...', 'var(--text-secondary)');
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/receipt_links?bitrix24_deal_id=eq.${opts.entityId}&limit=1', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      var data = await res.json();
      var token;
      if (data && data.length > 0) {
        token = data[0].token;
      } else {
        // Create one
        var createRes = await fetch(SUPABASE_URL + '/rest/v1/receipt_links', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify({ bitrix24_deal_id: '${opts.entityId}', deal_title: '${(opts.dealTitle || "").replace(/'/g, "\\'")}' })
        });
        var created = await createRes.json();
        token = created[0]?.token || created.token;
      }
      if (token) {
        var link = FRONTEND_BASE + '/pagamento/' + token;
        updatePaymentReportFields(token);
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(link);
          setStatus('Link copiado! ' + link, 'var(--value-paid)');
        } else {
          prompt('Copie o link:', link);
        }
      } else {
        setStatus('Erro ao gerar link', 'var(--value-open)');
      }
    } catch(e) { setStatus('Erro: ' + e.message, 'var(--value-open)'); }
  }

  function generateReceipt() {
    var dealName = '${(opts.dealTitle || "Negócio").replace(/'/g, "\\'")}';
    var currency = '${currency}';
    var allInst = ${JSON.stringify(installments.map(i => ({
      n: i.number, t: i.total, v: i.value, s: i.status, due: i.due_date, paid: i.paid_at, cur: i.currency,
      meta: i.metadata || {}
    })))};

    var rows = allInst.map(function(inst) {
      var fmtVal = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: inst.cur || 'EUR' }).format(inst.v);
      var paidAmt = inst.meta.paid_amount != null ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: inst.cur || 'EUR' }).format(inst.meta.paid_amount) : (inst.s === 'paga' ? fmtVal : '—');
      var lf = inst.meta.late_fee || {};
      var juros = lf.charges > 0 ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: inst.cur || 'EUR' }).format(lf.charges) : '—';
      var statusLabel = inst.s === 'paga' ? 'PAGO' : inst.s === 'atrasada' ? 'ATRASADO' : 'PENDENTE';
      var statusColor = inst.s === 'paga' ? '#10b981' : inst.s === 'atrasada' ? '#ef4444' : '#f59e0b';
      var dueFmt = inst.due ? new Date(inst.due).toLocaleDateString('pt-PT') : '—';
      var paidFmt = inst.paid ? new Date(inst.paid).toLocaleDateString('pt-PT') : '—';
      return '<tr>' +
        '<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:600">' + inst.n + '/' + inst.t + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:center">' + dueFmt + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right">' + fmtVal + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right">' + juros + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;font-weight:600">' + paidAmt + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:center">' + paidFmt + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:center"><span style="color:' + statusColor + ';font-weight:700;font-size:11px">' + statusLabel + '</span></td>' +
        '</tr>';
    }).join('');

    var today = new Date().toLocaleDateString('pt-PT');
    var html = '<!DOCTYPE html><html><head><title>Comprovante - ' + dealName + '</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:40px;color:#333;max-width:800px;margin:0 auto}' +
      'h1{font-size:18px;margin:0;color:#1a1a2e}h2{font-size:14px;margin:0;color:#64748b;font-weight:400}' +
      '.header{border-bottom:3px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px}' +
      '.info{margin-bottom:20px;font-size:13px;color:#475569;line-height:1.8}' +
      'table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12px}' +
      'th{background:#f1f5f9;padding:10px;border:1px solid #e5e7eb;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#475569}' +
      '.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:10px;color:#94a3b8;text-align:center;line-height:1.8}' +
      '@media print{body{padding:20px}}</style></head><body>' +
      '<div class="header"><h1>EMMELY FERNANDES ADVOCACIA</h1><h2>Controle de Parcelas</h2></div>' +
      '<div class="info"><strong>Negócio:</strong> ' + dealName + '<br><strong>Data:</strong> ' + today + '</div>' +
      '<table><thead><tr>' +
      '<th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Juros/Multa</th><th>Pago</th><th>Data Pgto</th><th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="footer">Emmely Fernandes Advocacia<br>Documento gerado em ' + today + '</div>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); setTimeout(function() { w.print(); }, 500); }
  }

  try { BX24.init(function() { BX24.fitWindow(); }); } catch(e) {}
</script>
</body>
</html>`;
}

function renderContactPaymentTab(opts: {
  contactName: string;
  contactId: string;
  deals: Array<{
    id: string; title: string; amount: number; currency: string;
    responsible: string; gateway: string; paymentMethod: string;
    totalValue: number; paidValue: number; openValue: number; overdueValue: number;
    installments: InstallmentData[];
    paidCount: number; pendingCount: number; overdueCount: number;
  }>;
  supabaseUrl: string;
  memberId: string;
  totalValue: number;
  paidValue: number;
  openValue: number;
  currency: string;
}): string {
  const { contactName, deals, totalValue, paidValue, openValue, currency } = opts;
  const EUR_TO_BRL = 6.10;
  const paidPct = totalValue > 0 ? Math.round((paidValue / totalValue) * 100) : 0;

  const dealCards = deals.map((deal) => {
    const dealPaidPct = deal.totalValue > 0 ? Math.round((deal.paidValue / deal.totalValue) * 100) : 0;
    const allPaid = deal.installments.length > 0 && deal.installments.every(i => i.status === "paga");
    const hasOverdue = deal.installments.some(i => i.status === "atrasada");
    const statusIcon = allPaid ? "✅" : hasOverdue ? "🔴" : "⏳";
    const statusLabel = allPaid ? "Quitado" : hasOverdue ? "Em Atraso" : "Pendente";
    const statusColor = allPaid ? "var(--accent-paid)" : hasOverdue ? "var(--accent-overdue)" : "var(--accent-pending)";

    const installmentPills = deal.installments.map((inst) => {
      const s = getStatusColor(inst.status);
      const label = inst.is_down_payment ? "Entrada" : `${inst.number}/${inst.total}`;
      return `<span class="b24-contact-pill" style="--pill-bg:${s.bg};--pill-text:${s.text}" title="${s.label} — ${formatCurrency(inst.value, inst.currency)}${inst.due_date ? ' — Vence: ' + formatDate(inst.due_date) : ''}">${label} ${formatCurrency(inst.value, inst.currency)} ${inst.status === "paga" ? "✅" : inst.status === "atrasada" ? "🔴" : "⏳"}</span>`;
    }).join("");

    return `
      <div class="b24-deal-card" style="--deal-border:${statusColor}">
        <div class="b24-deal-header" onclick="this.parentElement.classList.toggle('expanded')">
          <div class="b24-deal-title-row">
            <span class="b24-deal-arrow">▶</span>
            <span class="b24-deal-title">Deal #${deal.id}: ${(deal.title || "").replace(/</g, "&lt;")}</span>
            <span class="b24-deal-amount">${formatCurrency(deal.totalValue, deal.currency)}</span>
            <span class="b24-deal-status" style="color:${statusColor}">${statusIcon} ${statusLabel}</span>
          </div>
          <div class="b24-deal-summary-row">
            <span>Pago: <strong style="color:var(--value-paid)">${formatCurrency(deal.paidValue, deal.currency)}</strong></span>
            <span>Aberto: <strong style="color:${deal.openValue > 0 ? 'var(--value-open)' : 'var(--value-paid)'}">${formatCurrency(deal.openValue, deal.currency)}</strong></span>
            <span>${deal.paidCount} quitadas · ${deal.pendingCount} pendentes${deal.overdueCount > 0 ? ` · ${deal.overdueCount} atrasadas` : ""}</span>
            ${deal.responsible ? `<span>${icon("building", 12)} ${deal.responsible}</span>` : ""}
          </div>
          <div class="b24-deal-progress">
            <div class="b24-deal-progress-fill" style="width:${dealPaidPct}%"></div>
          </div>
        </div>
        <div class="b24-deal-body">
          <div class="b24-deal-pills">${installmentPills}</div>
          ${deal.gateway ? `<div class="b24-deal-meta"><span>${icon("bank", 12)} ${deal.gateway}</span></div>` : ""}
          ${deal.paymentMethod ? `<div class="b24-deal-meta"><span>${icon("credit-card", 12)} ${deal.paymentMethod}</span></div>` : ""}
        </div>
      </div>`;
  }).join("");

  const noDealsHtml = `
    <div class="b24-empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      <div class="b24-empty-title">Nenhum negócio encontrado</div>
      <div class="b24-empty-desc">Este contacto ainda não possui negócios com registos financeiros.</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Emmely Pay — Contacto</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    :root {
      color-scheme: light dark;
      --bg-page: #f7f8fa; --bg-card: #ffffff; --text-primary: #0f172a; --text-secondary: #4b5563;
      --text-tertiary: #6b7280; --border-color: #e5e7eb; --border-light: #eef0f3;
      --progress-bg: #eef0f3; --progress-fill: #1b6ef3;
      --progress-fill-flat: #1b6ef3; --link-color: #1b6ef3; --primary: #1b6ef3; --primary-hover: #155fd7;
      --value-paid: #16a34a; --value-open: #dc2626;
      --accent-paid: #10b981; --accent-pending: #f59e0b; --accent-overdue: #ef4444; --accent-default: #cbd5e1;
      --shadow-xs: 0 1px 2px rgba(15,23,42,0.04);
      --shadow-sm: 0 1px 2px rgba(15,23,42,0.06);
      --shadow-md: 0 4px 12px rgba(15,23,42,0.08);
      --radius: 12px; --radius-sm: 8px;
      --stat-total-bg: #eff5ff; --stat-total-icon: #1b6ef3;
      --stat-paid-bg: #ecfdf5; --stat-paid-icon: #10b981;
      --stat-open-bg: #fef2f2; --stat-open-icon: #ef4444;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg-page: #0b0f17; --bg-card: #111827; --text-primary: #f1f5f9; --text-secondary: #94a3b8;
        --text-tertiary: #64748b; --border-color: #1f2937; --border-light: #1a2230;
        --progress-bg: #1f2937; --progress-fill: #3b82f6; --progress-fill-flat: #3b82f6;
        --link-color: #60a5fa; --primary: #3b82f6; --primary-hover: #2563eb;
        --value-paid: #34d399; --value-open: #f87171;
        --accent-paid: #34d399; --accent-pending: #fbbf24; --accent-overdue: #f87171; --accent-default: #334155;
        --shadow-xs: 0 1px 2px rgba(0,0,0,0.25); --shadow-sm: 0 1px 2px rgba(0,0,0,0.35); --shadow-md: 0 4px 12px rgba(0,0,0,0.45);
        --stat-total-bg: rgba(59,130,246,0.10); --stat-paid-bg: rgba(52,211,153,0.10); --stat-open-bg: rgba(248,113,113,0.10);
      }
    }
    [data-theme="dark"] {
      --bg-page: #0b0f17; --bg-card: #111827; --text-primary: #f1f5f9; --text-secondary: #94a3b8;
      --text-tertiary: #64748b; --border-color: #1f2937; --border-light: #1a2230;
      --progress-bg: #1f2937; --progress-fill: #3b82f6; --progress-fill-flat: #3b82f6;
      --link-color: #60a5fa; --primary: #3b82f6; --primary-hover: #2563eb;
      --value-paid: #34d399; --value-open: #f87171;
      --accent-paid: #34d399; --accent-pending: #fbbf24; --accent-overdue: #f87171; --accent-default: #334155;
      --shadow-xs: 0 1px 2px rgba(0,0,0,0.25); --shadow-sm: 0 1px 2px rgba(0,0,0,0.35); --shadow-md: 0 4px 12px rgba(0,0,0,0.45);
      --stat-total-bg: rgba(59,130,246,0.10); --stat-paid-bg: rgba(52,211,153,0.10); --stat-open-bg: rgba(248,113,113,0.10);
    }
    body.dark { color-scheme: dark; --bg-page: #0b0f17; --bg-card: #111827; --text-primary: #f1f5f9; --text-secondary: #94a3b8; --text-tertiary: #64748b; --border-color: #1f2937; --border-light: #1a2230; --progress-bg: #1f2937; --progress-fill: #3b82f6; --progress-fill-flat: #3b82f6; --link-color: #60a5fa; --primary: #3b82f6; --primary-hover: #2563eb; --value-paid: #34d399; --value-open: #f87171; --accent-paid: #34d399; --accent-pending: #fbbf24; --accent-overdue: #f87171; --accent-default: #334155; --stat-total-bg: rgba(59,130,246,0.10); --stat-paid-bg: rgba(52,211,153,0.10); --stat-open-bg: rgba(248,113,113,0.10); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 13px; background: var(--bg-page); color: var(--text-primary); line-height: 1.5; -webkit-font-smoothing: antialiased; }

    .b24-contact-summary { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 20px 24px 16px; }
    .b24-contact-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; letter-spacing: -0.01em; }
    .b24-contact-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
    .b24-contact-stat { border-radius: var(--radius); padding: 14px 16px; border: 1px solid var(--border-light); }
    .b24-contact-stat.stat-total { background: var(--stat-total-bg); }
    .b24-contact-stat.stat-paid { background: var(--stat-paid-bg); }
    .b24-contact-stat.stat-open { background: var(--stat-open-bg); }
    .b24-contact-stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-tertiary); margin-bottom: 4px; }
    .b24-contact-stat-value { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .b24-contact-stat .b24-dual-currency { font-size: 10px; color: var(--text-tertiary); font-weight: 400; margin-top: 2px; display: block; }

    .b24-contact-progress { display: flex; align-items: center; gap: 10px; }
    .b24-contact-progress-bar { flex: 1; height: 6px; background: var(--progress-bg); border-radius: 999px; overflow: hidden; }
    .b24-contact-progress-fill { height: 100%; background: var(--progress-fill); border-radius: 999px; transition: width 0.6s cubic-bezier(0.22,1,0.36,1); }
    .b24-contact-progress-label { font-size: 12px; font-weight: 700; min-width: 36px; text-align: right; font-variant-numeric: tabular-nums; }
    .b24-contact-meta { font-size: 12px; color: var(--text-secondary); margin-top: 10px; display: flex; gap: 16px; }

    .b24-deals-list { padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; }
    .b24-deal-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); border-left: 3px solid var(--deal-border, var(--accent-default)); box-shadow: var(--shadow-xs); overflow: hidden; transition: box-shadow 0.2s; }
    .b24-deal-card:hover { box-shadow: var(--shadow-sm); }
    .b24-deal-header { padding: 14px 18px; cursor: pointer; user-select: none; }
    .b24-deal-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
    .b24-deal-arrow { font-size: 10px; color: var(--text-tertiary); transition: transform 0.2s; }
    .b24-deal-card.expanded .b24-deal-arrow { transform: rotate(90deg); }
    .b24-deal-title { font-size: 13px; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .b24-deal-amount { font-size: 14px; font-weight: 800; letter-spacing: -0.02em; }
    .b24-deal-status { font-size: 11px; font-weight: 700; white-space: nowrap; }
    .b24-deal-summary-row { display: flex; gap: 14px; font-size: 11px; color: var(--text-secondary); flex-wrap: wrap; align-items: center; margin-bottom: 6px; }
    .b24-deal-summary-row strong { color: inherit; }
    .b24-deal-progress { height: 4px; background: var(--progress-bg); border-radius: 2px; overflow: hidden; }
    .b24-deal-progress-fill { height: 100%; background: var(--progress-fill); border-radius: 2px; }
    .b24-deal-body { display: none; padding: 0 18px 14px; border-top: 1px solid var(--border-light); }
    .b24-deal-card.expanded .b24-deal-body { display: block; padding-top: 12px; }
    .b24-deal-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .b24-contact-pill { display: inline-flex; align-items: center; gap: 4px; background: var(--pill-bg); color: var(--pill-text); border-radius: 16px; padding: 4px 12px; font-size: 11px; font-weight: 600; white-space: nowrap; cursor: default; }
    body.dark .b24-contact-pill { opacity: 0.9; }
    .b24-deal-meta { font-size: 11px; color: var(--text-secondary); margin-top: 8px; display: flex; gap: 12px; align-items: center; }
    .b24-dual-currency { font-size: 10px; color: var(--text-tertiary); font-weight: 400; white-space: nowrap; }

    .b24-empty { text-align: center; padding: 72px 24px; color: var(--text-secondary); }
    .b24-empty svg { margin: 0 auto 20px; display: block; opacity: 0.2; }
    .b24-empty-title { font-size: 16px; font-weight: 800; margin-bottom: 8px; color: var(--text-primary); }
    .b24-empty-desc { font-size: 13px; max-width: 300px; margin: 0 auto; line-height: 1.6; }
  </style>
</head>
<body>
<div id="app">
  ${deals.length === 0 ? noDealsHtml : `
  <div class="b24-contact-summary">
    <div class="b24-contact-title">${icon("bank", 16)} Emmely Pay — ${contactName.replace(/</g, "&lt;")}</div>
    <div class="b24-contact-stats">
      <div class="b24-contact-stat stat-total">
        <div class="b24-contact-stat-label">Total</div>
        <div class="b24-contact-stat-value">${formatCurrency(totalValue, currency)}</div>
        <span class="b24-dual-currency">≈ ${formatCurrency(totalValue * EUR_TO_BRL, "BRL")}</span>
      </div>
      <div class="b24-contact-stat stat-paid">
        <div class="b24-contact-stat-label">Pago</div>
        <div class="b24-contact-stat-value" style="color:var(--value-paid)">${formatCurrency(paidValue, currency)}</div>
        <span class="b24-dual-currency">≈ ${formatCurrency(paidValue * EUR_TO_BRL, "BRL")}</span>
      </div>
      <div class="b24-contact-stat stat-open">
        <div class="b24-contact-stat-label">Em Aberto</div>
        <div class="b24-contact-stat-value" style="color:${openValue > 0 ? 'var(--value-open)' : 'var(--value-paid)'}">${formatCurrency(openValue, currency)}</div>
        <span class="b24-dual-currency">≈ ${formatCurrency(openValue * EUR_TO_BRL, "BRL")}</span>
      </div>
    </div>
    <div class="b24-contact-progress">
      <div class="b24-contact-progress-bar">
        <div class="b24-contact-progress-fill" style="width:${paidPct}%"></div>
      </div>
      <div class="b24-contact-progress-label">${paidPct}%</div>
    </div>
    <div class="b24-contact-meta">
      <span>${deals.length} negócio${deals.length !== 1 ? "s" : ""}</span>
      <span>${deals.reduce((s, d) => s + d.installments.length, 0)} parcelas</span>
    </div>
  </div>
  <div class="b24-deals-list">
    ${dealCards}
  </div>
  `}
</div>
<script>
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
        entityId, entityTypeId, dealTitle: "Negócio", totalValue: 0, paidValue: 0, openValue: 0,
        currency: "EUR", installments: [], supabaseUrl, memberId,
        flows: [], contactPhone: "", noData: true,
      }), { headers: htmlHeaders });
    }

    const bodyAuthToken = body.AUTH_ID || body.auth_id || "";
    let accessToken = bodyAuthToken;
    if (!accessToken) {
      try { accessToken = await ensureValidToken(supabase, integration); }
      catch (tokErr) {
        console.error("[PAYMENT-TAB] Token refresh failed:", tokErr);
        return new Response(renderPaymentTab({
          entityId, entityTypeId, dealTitle: "Negócio", totalValue: 0, paidValue: 0, openValue: 0,
          currency: "EUR", installments: [], supabaseUrl, memberId,
          flows: [], contactPhone: "", noData: true,
        } as any), { headers: htmlHeaders });
      }
    }
    const endpoint = integration.client_endpoint;

    // Permission check removed — CRM placements are accessible to all users

    // Gateway / method display name maps
    const gwNames: Record<string, string> = { stripe_pt: "Stripe PT", stripe_br: "Stripe BR", asaas: "Asaas", direto: "Direto", stripe: "Stripe" };
    const methodNames: Record<string, string> = { card: "Cartão", pix: "PIX", boleto: "Boleto", multibanco: "Multibanco", mb_way: "MB Way", direto: "Direto", parcelado_direto: "Direto", sepa_debit: "SEPA" };

    // ==========================================
    // CONTACT VIEW — entityTypeId === "3"
    // ==========================================
    if (entityTypeId === "3") {
      console.log("[PAYMENT-TAB] Contact mode — fetching deals for contact:", entityId);

      let contactName = "Contacto";
      try {
        const contactResult = await callBitrix(endpoint, accessToken, "crm.contact.get", { ID: entityId });
        const contact = contactResult.result || {};
        contactName = [contact.NAME, contact.SECOND_NAME, contact.LAST_NAME].filter(Boolean).join(" ") || "Contacto";
      } catch (e) {
        console.error("[PAYMENT-TAB] Error fetching contact:", e);
      }

      // Fetch all deals linked to this contact
      let deals: any[] = [];
      try {
        const dealListResult = await callBitrix(endpoint, accessToken, "crm.deal.list", {
          filter: { CONTACT_ID: entityId },
          select: ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "STAGE_ID", "DATE_CREATE", "ASSIGNED_BY_ID",
                   "UF_CRM_EMMELY_GATEWAY", "UF_CRM_EMMELY_PAYMENT_METHOD", "UF_CRM_EMMELY_PAYMENT_STATUS"],
          order: { DATE_CREATE: "DESC" },
        });
        deals = dealListResult.result || [];
      } catch (e) {
        console.error("[PAYMENT-TAB] Error fetching deals for contact:", e);
      }

      if (deals.length === 0) {
        return new Response(renderContactPaymentTab({
          contactName, contactId: entityId, deals: [], supabaseUrl, memberId,
          totalValue: 0, paidValue: 0, openValue: 0, currency: "EUR",
        }), { headers: htmlHeaders });
      }

      // Fetch all transactions
      const { data: allTransactions } = await supabase
        .from("payment_transactions")
        .select("*")
        .order("created_at", { ascending: true });

      // Fetch responsible users
      const assignedIds = [...new Set(deals.map((d: any) => d.ASSIGNED_BY_ID).filter(Boolean))];
      const userMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        try {
          const usersResult = await callBitrix(endpoint, accessToken, "user.get", { ID: assignedIds });
          for (const u of (usersResult.result || [])) {
            userMap[String(u.ID)] = [u.NAME, u.LAST_NAME].filter(Boolean).join(" ");
          }
        } catch (e) { console.error("[PAYMENT-TAB] Error fetching users:", e); }
      }

      // Build deal summaries
      interface DealSummary {
        id: string; title: string; amount: number; currency: string; stageId: string;
        createdAt: string; responsible: string; gateway: string; paymentMethod: string;
        totalValue: number; paidValue: number; openValue: number; overdueValue: number;
        installments: InstallmentData[]; paidCount: number; pendingCount: number; overdueCount: number;
      }

      let grandTotal = 0, grandPaid = 0, grandOpen = 0;
      const dealSummaries: DealSummary[] = [];

      for (const deal of deals) {
        const dealId = String(deal.ID);
        const dealCurrency = deal.CURRENCY_ID || "EUR";
        const dealAmount = parseFloat(deal.OPPORTUNITY || "0");

        // Find transactions for this deal
        const dealTxs = (allTransactions || []).filter((tx: any) => {
          const meta = tx.metadata || {};
          return meta.bitrix_deal_id === dealId || meta.bitrix_deal_id === String(dealId) ||
                 meta.bitrix_entity_id === dealId || meta.bitrix_entity_id === String(dealId);
        });

        // Fallback: Access-imported clients have financial_records with bitrix24_deal_id directly
        let directFinRecords: any[] = [];
        if (dealTxs.length === 0) {
          const { data: directRecs } = await supabase
            .from("financial_records")
            .select("*")
            .eq("bitrix24_deal_id", dealId)
            .order("installment_number", { ascending: true });
          directFinRecords = directRecs || [];
        }

        // Build installments from transactions, direct records, or synthetic
        let installments: InstallmentData[] = [];
        let totalValue = 0, paidValue = 0;

        if (directFinRecords.length > 0) {
          const firstRec = directFinRecords[0];
          totalValue = firstRec.total_value || 0;
          installments = directFinRecords.map((rec: any) => ({
            id: rec.id, number: rec.installment_number || 1, total: rec.total_installments || 1,
            value: rec.installment_value || 0, status: rec.status || "pendente",
            due_date: rec.due_date, paid_at: rec.paid_at, currency: rec.currency || dealCurrency,
            description: rec.description || "",
            financial_record_id: rec.id,
            invoice_id: rec.bitrix24_invoice_id || null,
            metadata: {},
          }));
          paidValue = installments.filter(i => i.status === "paga").reduce((s, i) => s + i.value, 0);
        } else if (dealTxs.length > 0) {
          totalValue = dealTxs.reduce((s: number, tx: any) => s + (tx.amount || 0), 0);
          installments = dealTxs.map((tx: any, idx: number) => {
            let status = "pendente";
            if (tx.status === "paid" || tx.status === "confirmed" || tx.status === "succeeded") status = "paga";
            else if (tx.status === "overdue" || tx.status === "failed") status = "atrasada";
            else if (tx.metadata?.due_date && new Date(tx.metadata.due_date) < new Date()) status = "atrasada";
            const meta = tx.metadata || {};
            return {
              id: tx.id, number: meta.installment_number ?? (idx + 1),
              total: meta.total_installments || dealTxs.length,
              value: tx.amount || 0, status,
              due_date: meta.due_date || tx.created_at,
              paid_at: status === "paga" ? tx.updated_at : null,
              currency: tx.currency || dealCurrency, description: "",
              transaction_id: tx.id, payment_url: tx.payment_url,
              is_down_payment: meta.is_down_payment === true,
              invoice_id: meta.bitrix_invoice_id || null,
              payment_method: tx.payment_method,
              metadata: meta,
            };
          });
          paidValue = installments.filter(i => i.status === "paga").reduce((s, i) => s + i.value, 0);
        } else if (dealAmount > 0) {
          totalValue = dealAmount;
          installments = [{
            id: `deal-${dealId}`, number: 1, total: 1, value: dealAmount,
            status: "pendente", due_date: null, paid_at: null, currency: dealCurrency,
            description: deal.TITLE || "",
          }];
        }

        const openValue = totalValue - paidValue;
        const overdueValue = installments.filter(i => i.status === "atrasada").reduce((s, i) => s + i.value, 0);

        grandTotal += totalValue;
        grandPaid += paidValue;
        grandOpen += openValue;

        dealSummaries.push({
          id: dealId, title: deal.TITLE || `Deal #${dealId}`,
          amount: dealAmount, currency: dealCurrency, stageId: deal.STAGE_ID || "",
          createdAt: deal.DATE_CREATE || "", responsible: userMap[String(deal.ASSIGNED_BY_ID)] || "",
          gateway: gwNames[deal.UF_CRM_EMMELY_GATEWAY || ""] || "",
          paymentMethod: methodNames[deal.UF_CRM_EMMELY_PAYMENT_METHOD || ""] || "",
          totalValue, paidValue, openValue, overdueValue, installments,
          paidCount: installments.filter(i => i.status === "paga").length,
          pendingCount: installments.filter(i => i.status === "pendente").length,
          overdueCount: installments.filter(i => i.status === "atrasada").length,
        });
      }

      return new Response(renderContactPaymentTab({
        contactName, contactId: entityId, deals: dealSummaries,
        supabaseUrl, memberId,
        totalValue: grandTotal, paidValue: grandPaid, openValue: grandOpen,
        currency: "EUR",
      }), { headers: htmlHeaders });
    }

    // ==========================================
    // DEAL VIEW (existing logic) — entityTypeId !== "3"
    // ==========================================
    let dealTitle = "Negócio";
    let dealAmount = 0;
    let dealCurrency = "EUR";
    let contactPhone = "";
    let contactName = "";
    let contactEmail = "";
    let contactCpfCnpj = "";
    let contactAddress: { postal_code?: string; street?: string; number?: string; district?: string; city?: string; state?: string; country?: string } = {};
    let contactId = "";
    let dealGateway = "";
    let dealPaymentMethod = "";
    let dealCreatedAt = "";
    let rawGatewayValue = "";
    let rawMethodValue = "";
    let gatewayEnumOptions: { id: string; label: string }[] = [];
    let methodEnumOptions: { id: string; label: string }[] = [];

    try {
      const dealResult = await callBitrix(endpoint, accessToken, "crm.deal.get", { ID: entityId });
      const deal = dealResult.result || {};
      dealTitle = deal.TITLE || "Negócio";
      dealAmount = parseFloat(deal.OPPORTUNITY || "0");
      dealCurrency = deal.CURRENCY_ID || "EUR";
      contactId = deal.CONTACT_ID || "";
      dealCreatedAt = deal.DATE_CREATE || deal.CREATED_DATE || "";
      const rawGateway = deal.UF_CRM_EMMELY_GATEWAY || "";
      const rawMethod = deal.UF_CRM_EMMELY_PAYMENT_METHOD || "";

      rawGatewayValue = rawGateway;
      rawMethodValue = rawMethod;

      // Always fetch fields to get enum options for editable badges
      try {
        const fieldsResult = await callBitrix(endpoint, accessToken, "crm.deal.fields", {});
        const fields = fieldsResult.result || {};
        const extractItems = (fieldDef: any): { id: string; label: string }[] => {
          if (!fieldDef) return [];
          const items = fieldDef.items || fieldDef.ITEMS || [];
          if (!Array.isArray(items)) return [];
          return items.map((item: any) => ({ id: String(item.ID), label: item.VALUE || item.value || String(item.ID) }));
        };
        gatewayEnumOptions = extractItems(fields.UF_CRM_EMMELY_GATEWAY);
        methodEnumOptions = extractItems(fields.UF_CRM_EMMELY_PAYMENT_METHOD);

        const resolveListValue = (fieldDef: any, rawVal: string): string => {
          if (!fieldDef || !rawVal) return "";
          const items = fieldDef.items || fieldDef.ITEMS || [];
          if (Array.isArray(items)) {
            const match = items.find((item: any) => String(item.ID) === String(rawVal) || String(item.VALUE) === String(rawVal));
            if (match) return match.VALUE || match.value || rawVal;
          }
          if (/^\d+$/.test(rawVal)) return "";
          return rawVal;
        };
        dealGateway = resolveListValue(fields.UF_CRM_EMMELY_GATEWAY, rawGateway);
        dealPaymentMethod = resolveListValue(fields.UF_CRM_EMMELY_PAYMENT_METHOD, rawMethod);
      } catch (e) {
        console.error("[PAYMENT-TAB] Error resolving list fields:", e);
        dealGateway = /^\d+$/.test(rawGateway) ? "" : rawGateway;
        dealPaymentMethod = /^\d+$/.test(rawMethod) ? "" : rawMethod;
      }
      if (contactId) {
        const contactResult = await callBitrix(endpoint, accessToken, "crm.contact.get", { ID: contactId });
        const contact = contactResult.result || {};
        const phones = contact.PHONE || [];
        if (Array.isArray(phones) && phones.length > 0) {
          contactPhone = (phones[0].VALUE || "").replace(/\D/g, "");
        }
        contactName = [contact.NAME, contact.SECOND_NAME, contact.LAST_NAME].filter(Boolean).join(" ").trim();
        const emails = contact.EMAIL || [];
        if (Array.isArray(emails) && emails.length > 0) {
          contactEmail = String(emails[0].VALUE || "").trim();
        }
        // CPF/CNPJ commonly stored in UF_CRM_CPF or UF_CRM_CNPJ or NIF
        contactCpfCnpj =
          String(contact.UF_CRM_CPF || contact.UF_CRM_CNPJ || contact.UF_CRM_CPF_CNPJ || contact.UF_CRM_NIF || "").trim();
        contactAddress = {
          postal_code: String(contact.ADDRESS_POSTAL_CODE || "").trim(),
          street: String(contact.ADDRESS || "").trim(),
          number: String(contact.ADDRESS_2 || "").trim(),
          district: "",
          city: String(contact.ADDRESS_CITY || "").trim(),
          state: String(contact.ADDRESS_PROVINCE || "").trim(),
          country: String(contact.ADDRESS_COUNTRY_CODE || contact.ADDRESS_COUNTRY || "").trim().slice(0, 2).toUpperCase(),
        };
        // Fallback to Company NIF/CNPJ if contact has none and deal has a company
        if (!contactCpfCnpj && deal && deal.COMPANY_ID) {
          try {
            const companyRes = await callBitrix(endpoint, accessToken, "crm.company.get", { ID: deal.COMPANY_ID });
            const comp = companyRes.result || {};
            contactCpfCnpj = String(comp.UF_CRM_CNPJ || comp.UF_CRM_NIF || comp.UF_CRM_CPF_CNPJ || "").trim();
            if (!contactName) contactName = comp.TITLE || "";
          } catch (e) { console.error("[PAYMENT-TAB] company.get error:", e); }
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

    // ALWAYS check for Access-imported records with bitrix24_deal_id
    const { data: directRecords } = await supabase
      .from("financial_records")
      .select("*")
      .eq("bitrix24_deal_id", String(entityId))
      .order("installment_number", { ascending: true });
    if (directRecords && directRecords.length > 0) {
      financialRecords = directRecords;
      console.log("[payment-tab] Using direct financial_records by deal_id:", directRecords.length, "records");
    }

    // Fetch late fee configuration
    let lateFeeConfig: LateFeeConfig = DEFAULT_LATE_FEE_CONFIG;
    try {
      const { data: lfConfig } = await supabase
        .from("payment_gateway_config")
        .select("config")
        .eq("gateway", "late_fees")
        .eq("is_active", true)
        .maybeSingle();
      if (lfConfig?.config) {
        const c = lfConfig.config as any;
        lateFeeConfig = {
          penalty_pct: c.penalty_pct ?? DEFAULT_LATE_FEE_CONFIG.penalty_pct,
          interest_monthly_pct: c.interest_monthly_pct ?? DEFAULT_LATE_FEE_CONFIG.interest_monthly_pct,
          max_interest_days: c.max_interest_days ?? DEFAULT_LATE_FEE_CONFIG.max_interest_days,
          grace_days: c.grace_days ?? DEFAULT_LATE_FEE_CONFIG.grace_days,
        };
      }
    } catch (e) {
      console.error("[payment-tab] Failed to load late fee config:", e);
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
          financial_record_id: rec.id,
          payment_url: matchingTx?.payment_url, payment_method: matchingTx?.payment_method,
          metadata: matchingTx?.metadata || {},
          invoice_id: rec.bitrix24_invoice_id || null,
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

    // Compute late fees for overdue installments (detect by due_date, not just status)
    const now = new Date();
    for (const inst of installments) {
      if (inst.status !== "paga" && inst.due_date) {
        const dueDate = new Date(inst.due_date + "T00:00:00Z");
        const diffMs = now.getTime() - dueDate.getTime();
        const daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (daysLate > 0) {
          inst.status = "atrasada"; // Auto-correct visual status
          const fees = calculateLateFees(inst.value, daysLate, lateFeeConfig);
          inst.late_penalty = fees.penalty;
          inst.late_interest = fees.interest;
          inst.late_days = fees.daysLate;
          inst.late_total = fees.total;
        }
      }
      // Check for carried amount in metadata
      if (inst.metadata?.carried_amount > 0) {
        inst.metadata = inst.metadata || {};
      }
    }

    const openValue = totalValue - paidValue;

    const { data: activeFlows } = await supabase
      .from("flows").select("id, name").eq("is_active", true).order("name");
    const flows = (activeFlows || []).map((f: any) => ({ id: f.id, name: f.name }));

    const pendingInstallments = installments.filter(i => i.status !== "paga" && i.due_date);
    const nextDueDate = pendingInstallments.length > 0
      ? pendingInstallments.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0].due_date
      : null;

    const displayGateway = dealGateway || (dealTransactions.length > 0 ? dealTransactions[0].gateway : "") || "";
    const displayMethod = dealPaymentMethod || (dealTransactions.length > 0 ? dealTransactions[0].payment_method : "") || "";
    const displayCreatedAt = dealCreatedAt || (dealTransactions.length > 0 ? dealTransactions[0].created_at : "") || "";

    return new Response(renderPaymentTab({
      entityId, entityTypeId, dealTitle, totalValue, paidValue, openValue, currency,
      installments, supabaseUrl, memberId, flows, contactPhone,
      contactName, contactEmail, contactCpfCnpj, contactAddress,
      noData: installments.length === 0,
      gateway: gwNames[displayGateway] || displayGateway,
      rawGateway: rawGatewayValue || displayGateway,
      rawMethod: rawMethodValue || displayMethod,
      paymentMethod: methodNames[displayMethod] || displayMethod,
      nextDueDate,
      createdAt: displayCreatedAt,
      gatewayOptions: gatewayEnumOptions,
      methodOptions: methodEnumOptions,
    }), { headers: htmlHeaders });

  } catch (err) {
    console.error("[PAYMENT-TAB] Fatal error:", err);
    const safeMsg = String((err as any)?.message || err).replace(/[<>&]/g, "");
    const fallback = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emmely Pay</title><script src="https://api.bitrix24.com/api/v1/"></script><style>body{margin:0;font-family:'Open Sans',system-ui,sans-serif;background:#f4f6f8;color:#374151;padding:32px}.card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:24px;max-width:560px;margin:40px auto;text-align:center}h1{font-size:18px;color:#111827;margin:0 0 8px}p{font-size:13px;color:#6b7280;margin:6px 0}code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:11px}button{margin-top:14px;background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer}</style></head><body><div class="card"><h1>Não foi possível carregar o Emmely Pay</h1><p>Ocorreu um erro temporário ao preparar este separador.</p><p><code>${safeMsg}</code></p><button onclick="location.reload()">Tentar de novo</button></div><script>try{BX24&&BX24.init(function(){BX24.fitWindow&&BX24.fitWindow();});}catch(e){}</script></body></html>`;
    return new Response(fallback, { status: 200, headers: htmlHeaders });
  }
});
