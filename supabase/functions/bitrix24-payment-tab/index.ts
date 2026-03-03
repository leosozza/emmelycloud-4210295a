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
}): string {
  const { dealTitle, totalValue, paidValue, openValue, currency, installments, supabaseUrl, memberId, flows, contactPhone, noData } = opts;

  const paidPct = totalValue > 0 ? Math.round((paidValue / totalValue) * 100) : 0;

  const installmentRows = installments.map((inst) => {
    const s = getStatusColor(inst.status);
    const flowOptions = flows.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
    const label = inst.is_down_payment ? "Entrada" : `Parcela ${inst.number}/${inst.total}`;
    const totalLabel = inst.total > 1 ? `<span class="b24-item-total">Total: ${formatCurrency(inst.value * inst.total, inst.currency)}</span>` : "";

    return `
      <div class="b24-item">
        <div class="b24-item-row">
          <div class="b24-item-left">
            <span class="b24-item-title">${label}</span>
            <span class="b24-item-value">${formatCurrency(inst.value, inst.currency)}</span>
          </div>
          <span class="b24-badge" style="--badge-bg:${s.bg};--badge-bg-dark:${s.bgDark};--badge-text:${s.text};--badge-text-dark:${s.textDark}">${s.label}</span>
        </div>
        ${inst.company_name ? `<div class="b24-item-meta"><span style="font-weight:600">🏢 ${inst.company_name}</span></div>` : ""}
        <div class="b24-item-meta">
          <span>Vence: ${formatDate(inst.due_date)}</span>
          ${inst.paid_at ? `<span>Pago: ${formatDate(inst.paid_at)}</span>` : ""}
          ${totalLabel}
        </div>
        ${inst.description ? `<div class="b24-item-desc">${inst.description}</div>` : ""}
        ${inst.payment_url && inst.status !== "paga" ? `<div class="b24-link-row"><a href="${inst.payment_url}" target="_blank" class="b24-link">Link de pagamento</a><button class="b24-btn-copy" onclick="copyLink(this,'${inst.payment_url.replace(/'/g, "\\'")}')" title="Copiar link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>` : ""}
        ${inst.invoice_id ? `<div class="b24-link-row"><a href="javascript:void(0)" onclick="openInvoice(${inst.invoice_id})" class="b24-link">📄 Ver Fatura #${inst.invoice_id}</a></div>` : ""}
        ${inst.status !== "paga" && inst.transaction_id ? `
          <div class="b24-item-actions">
            <button onclick="markAsPaid('${inst.transaction_id}', ${inst.invoice_id || 'null'})" class="b24-btn-primary" style="background:#589731">✓ Dar Baixa</button>
          </div>
        ` : ""}
        ${inst.status !== "paga" && contactPhone && flows.length > 0 ? `
          <div class="b24-item-actions">
            <select id="flow-${inst.id}" class="b24-select">
              <option value="">Selecionar fluxo...</option>
              ${flowOptions}
            </select>
            <button onclick="triggerFlow('${inst.id}','${contactPhone}',${inst.number})" class="b24-btn-emmely">Disparar</button>
          </div>
        ` : ""}
      </div>`;
  }).join("");

  const noDataHtml = `
    <div class="b24-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
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
      --bg-page: #eef2f4;
      --bg-card: #ffffff;
      --text-primary: #333333;
      --text-secondary: #959ca4;
      --border-color: #e0e5e8;
      --progress-bg: #dfe4e8;
      --progress-fill: #2fc6f6;
      --link-color: #2067b0;
      --value-paid: #589731;
      --value-open: #df532d;
    }
    body.dark {
      --bg-page: #1e2b36;
      --bg-card: #2a3942;
      --text-primary: #e4e9eb;
      --text-secondary: #7b8b97;
      --border-color: #3d4f5c;
      --progress-bg: #3d4f5c;
      --progress-fill: #2fc6f6;
      --link-color: #5db8e5;
      --value-paid: #8bc34a;
      --value-open: #ef5350;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Open Sans", Helvetica, Arial, sans-serif; font-size: 13px; background: var(--bg-page); color: var(--text-primary); line-height: 1.5; }
    #app { display: flex; flex-direction: column; min-height: 100vh; }

    /* Summary header */
    .b24-summary { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 16px 20px; }
    .b24-summary-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 14px; }
    .b24-summary-grid { display: flex; gap: 24px; margin-bottom: 12px; }
    .b24-summary-item { flex: 1; }
    .b24-summary-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-secondary); margin-bottom: 2px; }
    .b24-summary-value { font-size: 16px; font-weight: 700; }
    .b24-progress { height: 4px; background: var(--progress-bg); border-radius: 2px; overflow: hidden; margin-top: 2px; }
    .b24-progress-fill { height: 100%; background: var(--progress-fill); border-radius: 2px; transition: width 0.4s ease; }
    .b24-progress-label { font-size: 11px; color: var(--text-secondary); margin-top: 4px; text-align: right; }

    /* Installment items */
    .b24-list { padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; }
    .b24-item { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px; padding: 12px 14px; }
    .b24-item-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .b24-item-left { display: flex; align-items: baseline; gap: 10px; }
    .b24-item-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .b24-item-value { font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .b24-badge {
      display: inline-block;
      background: var(--badge-bg);
      color: var(--badge-text);
      border-radius: 10px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    body.dark .b24-badge {
      background: var(--badge-bg-dark);
      color: var(--badge-text-dark);
    }
    .b24-item-meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; flex-wrap: wrap; }
    .b24-item-total { font-weight: 600; color: var(--text-primary); font-size: 11px; }
    .b24-link-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .b24-link { font-size: 12px; color: var(--link-color); text-decoration: none; font-weight: 600; }
    .b24-link:hover { text-decoration: underline; }
    .b24-btn-copy { background: transparent; border: 1px solid var(--border-color); border-radius: 3px; padding: 3px 5px; cursor: pointer; color: var(--text-secondary); display: inline-flex; align-items: center; transition: all 0.15s; }
    .b24-btn-copy:hover { background: var(--bg-page); color: var(--text-primary); }
    .b24-btn-copy.copied { border-color: #589731; color: #589731; }
    body.dark .b24-btn-copy.copied { border-color: #8bc34a; color: #8bc34a; }

    /* Actions */
    .b24-item-actions { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
    .b24-select { flex: 1; height: 32px; font-size: 13px; font-family: inherit; border: 1px solid var(--border-color); border-radius: 3px; padding: 0 8px; background: var(--bg-card); color: var(--text-primary); outline: none; }
    .b24-select:focus { border-color: var(--progress-fill); }
    .b24-btn-emmely { background: #722F37; color: #fff; border: none; padding: 0 14px; height: 32px; border-radius: 4px; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; transition: opacity 0.15s; }
    .b24-btn-emmely:hover { opacity: 0.85; }
    .b24-btn-primary { background: var(--progress-fill); color: #fff; border: none; padding: 0 16px; height: 32px; border-radius: 4px; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; transition: opacity 0.15s; }
    .b24-btn-primary:hover { opacity: 0.85; }
    .b24-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .b24-btn-outline { background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); padding: 0 14px; height: 32px; border-radius: 4px; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background 0.15s; }
    .b24-btn-outline:hover { background: var(--bg-page); }

    /* Create form */
    .b24-create-bar { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 10px 20px; display: flex; justify-content: flex-end; }
    .b24-form-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 100; justify-content: center; align-items: center; }
    .b24-form-overlay.active { display: flex; }
    .b24-form-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px; padding: 20px; width: 400px; max-width: 90vw; max-height: 85vh; overflow-y: auto; }
    .b24-form-title { font-size: 14px; font-weight: 700; margin-bottom: 16px; color: var(--text-primary); }
    .b24-form-group { margin-bottom: 12px; }
    .b24-form-label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-secondary); margin-bottom: 4px; }
    .b24-input { width: 100%; height: 32px; font-size: 13px; font-family: inherit; border: 1px solid var(--border-color); border-radius: 3px; padding: 0 8px; background: var(--bg-card); color: var(--text-primary); outline: none; box-sizing: border-box; }
    .b24-input:focus { border-color: var(--progress-fill); }
    .b24-form-row { display: flex; gap: 10px; }
    .b24-form-row > * { flex: 1; }
    .b24-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .b24-form-hint { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }

    /* Empty state */
    .b24-empty { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
    .b24-empty svg { margin-bottom: 12px; opacity: 0.4; }
    .b24-empty-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .b24-empty-desc { font-size: 12px; }

    #status-msg { font-size: 12px; color: var(--text-secondary); text-align: center; padding: 8px 20px; min-height: 20px; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
  </style>
</head>
<body>
<div id="app">
  <div class="b24-create-bar">
    <button class="b24-btn-primary" onclick="openCreateForm()">+ Criar Cobrança</button>
  </div>
  ${noData ? noDataHtml : `
  <div class="b24-summary">
    <div class="b24-summary-title">Emmely Pay — ${(dealTitle || "Negócio").replace(/</g, "&lt;")}</div>
    <div class="b24-summary-grid">
      <div class="b24-summary-item">
        <div class="b24-summary-label">Total</div>
        <div class="b24-summary-value">${formatCurrency(totalValue, currency)}</div>
      </div>
      <div class="b24-summary-item">
        <div class="b24-summary-label">Pago</div>
        <div class="b24-summary-value" style="color:var(--value-paid)">${formatCurrency(paidValue, currency)}</div>
      </div>
      <div class="b24-summary-item">
        <div class="b24-summary-label">Em Aberto</div>
        <div class="b24-summary-value" style="color:${openValue > 0 ? 'var(--value-open)' : 'var(--value-paid)'}">${formatCurrency(openValue, currency)}</div>
      </div>
    </div>
    <div class="b24-progress">
      <div class="b24-progress-fill" style="width:${paidPct}%"></div>
    </div>
    <div class="b24-progress-label">${paidPct}% pago</div>
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
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
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

<script>
  var SUPABASE_URL = "${supabaseUrl}";
  var SUPABASE_KEY = "${Deno.env.get("SUPABASE_ANON_KEY") || ""}";
  var MEMBER_ID = "${memberId}";
  var ENTITY_ID = "${opts.entityId}";

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

  // Create form
  function openCreateForm() { document.getElementById('create-overlay').classList.add('active'); }
  function closeCreateForm() {
    document.getElementById('create-overlay').classList.remove('active');
    document.getElementById('pay-result').style.display = 'none';
  }

  // Toggle CPF field based on currency and method fields
  document.getElementById('pay-currency').addEventListener('change', function() {
    document.getElementById('cpf-group').style.display = this.value === 'BRL' ? 'block' : 'none';
    toggleMethodFields();
  });

  function toggleMethodFields() {
    var method = document.getElementById('pay-method').value;
    var isDireto = method === 'direto';
    // Hide email/cpf fields for direct payment since no gateway is used
    var emailEl = document.getElementById('pay-email');
    if (emailEl) emailEl.closest('.b24-form-group').style.opacity = isDireto ? '0.5' : '1';
  }

  // Set default first due date to today + interval
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
      if (Math.abs(lastInst - instValue) > 0.001) {
        lines.push('<div style="font-size:11px;color:var(--text-secondary)">Última parcela: ' + lastInst.toFixed(2) + ' (ajuste)</div>');
      }
      // Show due dates
      if (firstDue) {
        var dates = [];
        for (var i = 0; i < numInst && i < 6; i++) {
          var d = new Date(firstDue);
          d.setDate(d.getDate() + (interval * i));
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

    // Build list of parcels
    var parcels = [];
    if (hasDown) {
      parcels.push({
        amount: downPayment,
        due_date: new Date().toISOString().split('T')[0],
        installment_number: 0,
        is_down_payment: true
      });
    }
    for (var i = 0; i < numInstallments; i++) {
      var dueDate = new Date(firstDue);
      dueDate.setDate(dueDate.getDate() + (interval * i));
      var val = (i === numInstallments - 1) ? lastInstValue : instValue;
      parcels.push({
        amount: val,
        due_date: dueDate.toISOString().split('T')[0],
        installment_number: i + 1,
        is_down_payment: false
      });
    }

    // Validate BRL minimum
    if (currency === 'BRL') {
      for (var p = 0; p < parcels.length; p++) {
        if (parcels[p].amount < 5) { showPayResult('Cada parcela deve ter no mínimo R$ 5,00. Parcela ' + (p+1) + ' tem R$ ' + parcels[p].amount.toFixed(2), true); return; }
      }
    }

    var btn = document.getElementById('pay-submit');
    btn.disabled = true;

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
            amount: parcel.amount,
            currency: currency,
            payment_method: method,
            description: desc + (parcels.length > 1 ? (parcel.is_down_payment ? ' (Entrada)' : ' (Parcela ' + parcel.installment_number + '/' + numInstallments + ')') : ''),
            customer_data: { name: name, email: email, cpf_cnpj: cpf || undefined },
            due_date: parcel.due_date,
            installment_number: parcel.installment_number,
            total_installments: totalCount,
            installment_group_id: groupId,
            is_down_payment: parcel.is_down_payment,
            metadata: { bitrix_deal_id: ENTITY_ID, source: 'bitrix24_payment_tab' }
          })
        });
        var data = await res.json();
        if (data.error) {
          errors.push('Fatura ' + (j+1) + ': ' + data.error);
        } else if (data.transaction) {
          createdTxIds.push({ txId: data.transaction.id, parcel: parcel, index: j });
        }
      } catch (e) {
        errors.push('Fatura ' + (j+1) + ': ' + e.message);
      }
    }

    // Create Smart Invoices in Bitrix24 for each created transaction
    if (createdTxIds.length > 0 && typeof BX24 !== 'undefined') {
      btn.textContent = 'A criar faturas no CRM...';
      showPayResult('A criar Smart Invoices no Bitrix24...', false);

      // Get deal info for invoice linking
      try {
        for (var k = 0; k < createdTxIds.length; k++) {
          var item = createdTxIds[k];
          var invoiceLabel = item.parcel.is_down_payment ? 'Entrada' : ('Parcela ' + item.parcel.installment_number + '/' + numInstallments);
          var invoiceTitle = invoiceLabel + ' - ' + (desc || 'Negócio');

          await new Promise(function(resolve) {
            BX24.callMethod('crm.item.add', {
              entityTypeId: 31,
              fields: {
                title: invoiceTitle,
                opportunity: item.parcel.amount,
                currencyId: currency,
                isManualOpportunity: 'Y',
                parentId2: parseInt(ENTITY_ID),
                begindate: new Date().toISOString().split('T')[0],
                closedate: item.parcel.due_date,
                comments: 'Fatura gerada automaticamente pelo Emmely Pay. ' + invoiceLabel + '. Grupo: ' + groupId
              }
            }, function(result) {
              if (result.error()) {
                console.error('Smart Invoice error:', result.error());
                resolve(null);
              } else {
                var invoiceId = result.data() && result.data().item ? result.data().item.id : null;
                if (invoiceId) {
                  // Update transaction metadata with invoice ID
                  fetch(SUPABASE_URL + '/functions/v1/payment-create', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
                    body: JSON.stringify({ transaction_id: item.txId, metadata_update: { bitrix_invoice_id: invoiceId } })
                  }).then(function() { resolve(invoiceId); }).catch(function() { resolve(invoiceId); });
                } else {
                  resolve(null);
                }
              }
            });
          });
        }
      } catch (e) {
        console.error('Smart Invoice creation error:', e);
      }
    }

    btn.disabled = false;
    btn.textContent = 'Criar Cobrança';

    if (errors.length > 0) {
      showPayResult('Erros: ' + errors.join('; '), true);
    } else {
      showPayResult(parcels.length + ' fatura(s) criada(s) com sucesso!', false);
      setTimeout(function() { location.reload(); }, 2000);
    }
  }

  function showPayResult(msg, isError) {
    var el = document.getElementById('pay-result');
    el.innerHTML = msg;
    el.style.display = 'block';
    el.style.color = isError ? 'var(--value-open)' : 'var(--value-paid)';
  }

  async function markAsPaid(txId, invoiceId) {
    if (!confirm('Confirmar baixa manual deste pagamento?')) return;
    setStatus('A dar baixa...', 'var(--text-secondary)');
    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/payment-create', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ transaction_id: txId, metadata_update: { manual_paid: true, paid_at: new Date().toISOString() }, status_update: 'confirmed' })
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);

      // Close Invoice (old API) via crm.invoice.update if bitrix_old_invoice_id exists
      if (invoiceId && typeof BX24 !== 'undefined') {
        setStatus('A concluir fatura no Bitrix24...', 'var(--text-secondary)');
        await new Promise(function(resolve) {
          BX24.callMethod('crm.invoice.update', {
            ID: invoiceId,
            fields: { STATUS_ID: 'P' }
          }, function(result) {
            if (result.error()) {
              console.error('Invoice old close error:', result.error());
              // Fallback: try Smart Invoice (entityTypeId 31)
              BX24.callMethod('crm.item.update', {
                entityTypeId: 31,
                id: invoiceId,
                fields: { stageId: 'DT31_6:P', moved: 'Y' }
              }, function(r2) {
                if (r2.error()) console.error('Smart Invoice fallback error:', r2.error());
                resolve(null);
              });
            } else {
              resolve(null);
            }
          });
        });
      }

      setStatus('Baixa registada com sucesso!', 'var(--value-paid)');
      setTimeout(function() { location.reload(); }, 1500);
    } catch(e) {
      setStatus('Erro: ' + e.message, 'var(--value-open)');
    }
  }

  function triggerFlow(installmentId, phone, installmentNum) {
    var sel = document.getElementById('flow-' + installmentId);
    if (!sel || !sel.value) { setStatus('Selecione um fluxo primeiro.', 'var(--value-open)'); return; }
    var flowId = sel.value;
    setStatus('A disparar fluxo...', 'var(--text-secondary)');

    fetch(SUPABASE_URL + '/functions/v1/flow-engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({
        phone: phone,
        message: 'Lembrete parcela ' + installmentNum,
        flow_id: flowId,
        source: 'bitrix24_payment_tab'
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) throw new Error(d.error);
      setStatus('Fluxo disparado com sucesso para ' + phone, 'var(--value-paid)');
    })
    .catch(function(e) { setStatus('Erro: ' + e.message, 'var(--value-open)'); });
  }

  // Theme detection
  function applyTheme(isDark) {
    document.body.classList.toggle('dark', isDark);
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme(true);
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) { applyTheme(e.matches); });
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    var d = e.data;
    if (d.action === 'ChangeColorScheme' || d.action === 'themeChange') {
      var s = d.scheme || d.colorScheme || d.theme;
      if (s) applyTheme(s === 'dark');
    } else if (d.type === 'B24Frame:theme' && d.payload && d.payload.type) {
      applyTheme(d.payload.type === 'dark');
    } else if (d.colorScheme) {
      applyTheme(d.colorScheme === 'dark');
    } else if (d.theme === 'dark' || d.theme === 'light') {
      applyTheme(d.theme === 'dark');
    }
  });

  // Open Invoice — try old API path first, then Smart Invoice
  function openInvoice(invoiceId) {
    try {
      BX24.openPath('/crm/invoice/show/' + invoiceId + '/');
    } catch(e) {
      try { BX24.openPath('/crm/type/31/details/' + invoiceId + '/'); } catch(e2) {}
      setStatus('Fatura #' + invoiceId, 'var(--link-color)');
    }
  }

  try {
    BX24.init(function() { BX24.fitWindow(); });
  } catch(e) {}
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

    // Parse PLACEMENT_OPTIONS
    let placementOptions: Record<string, any> = {};
    if (body.PLACEMENT_OPTIONS) {
      try {
        placementOptions = typeof body.PLACEMENT_OPTIONS === "string"
          ? JSON.parse(body.PLACEMENT_OPTIONS)
          : body.PLACEMENT_OPTIONS;
      } catch { placementOptions = {}; }
    }

    const entityId = placementOptions.ID || placementOptions.ENTITY_ID || body.ENTITY_ID || "";
    const entityTypeId = placementOptions.ENTITY_TYPE_ID || body.ENTITY_TYPE_ID || "2"; // 2 = Deal

    console.log("[PAYMENT-TAB] entityId:", entityId, "entityTypeId:", entityTypeId);

    // Find integration
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

    // Get access token
    const bodyAuthToken = body.AUTH_ID || body.auth_id || "";
    let accessToken = bodyAuthToken || await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint;

    // Fetch deal data from Bitrix24
    let dealTitle = "Negócio";
    let dealAmount = 0;
    let dealCurrency = "EUR";
    let contactPhone = "";
    let contactId = "";

    try {
      const dealResult = await callBitrix(endpoint, accessToken, "crm.deal.get", { ID: entityId });
      const deal = dealResult.result || {};
      dealTitle = deal.TITLE || "Negócio";
      dealAmount = parseFloat(deal.OPPORTUNITY || "0");
      dealCurrency = deal.CURRENCY_ID || "EUR";
      contactId = deal.CONTACT_ID || "";

      // Get contact phone
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

    // Search for payment transactions linked to this deal
    // Strategy: search by metadata.bitrix_deal_id OR by matching amount
    const { data: transactions } = await supabase
      .from("payment_transactions")
      .select("*")
      .order("created_at", { ascending: true });

    // Filter transactions that match this deal
    const dealTransactions = (transactions || []).filter((tx: any) => {
      const meta = tx.metadata || {};
      // Match by bitrix_deal_id in metadata
      if (meta.bitrix_deal_id === entityId || meta.bitrix_deal_id === String(entityId)) return true;
      // Match by bitrix_entity_id
      if (meta.bitrix_entity_id === entityId || meta.bitrix_entity_id === String(entityId)) return true;
      return false;
    });

    // Also search financial_records linked to contracts from this deal
    // For now, use transactions found + financial_records if any contract is linked
    const contractIds = dealTransactions
      .filter((tx: any) => tx.contract_id)
      .map((tx: any) => tx.contract_id);

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

    // Build installment data
    let installments: InstallmentData[] = [];
    let totalValue = 0;
    let paidValue = 0;
    let currency = dealCurrency;

    if (financialRecords.length > 0) {
      // Use financial_records as source of truth
      const firstRecord = financialRecords[0];
      totalValue = firstRecord.total_value || 0;
      currency = "EUR"; // financial_records don't have currency, use deal currency

      installments = financialRecords.map((rec: any) => {
        const matchingTx = dealTransactions.find((tx: any) => tx.financial_record_id === rec.id);
        return {
          id: rec.id,
          number: rec.installment_number || 1,
          total: rec.total_installments || 1,
          value: rec.installment_value || 0,
          status: rec.status || "pendente",
          due_date: rec.due_date,
          paid_at: rec.paid_at,
          currency,
          description: rec.description || "",
          transaction_id: matchingTx?.id,
          payment_url: matchingTx?.payment_url,
        };
      });

      paidValue = installments.filter(i => i.status === "paga").reduce((s, i) => s + i.value, 0);
    } else if (dealTransactions.length > 0) {
      // Use transactions directly as installments
      totalValue = dealTransactions.reduce((s: number, tx: any) => s + (tx.amount || 0), 0);
      currency = dealTransactions[0].currency || dealCurrency;

      // Fetch company names for transactions with company_id
      const companyIds = [...new Set(dealTransactions.filter((tx: any) => tx.company_id).map((tx: any) => tx.company_id))];
      let companyMap: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
        if (companies) {
          for (const c of companies) companyMap[c.id] = c.name;
        }
      }

      installments = dealTransactions.map((tx: any, idx: number) => {
        let status = "pendente";
        if (tx.status === "paid" || tx.status === "confirmed" || tx.status === "succeeded") status = "paga";
        else if (tx.status === "overdue" || tx.status === "failed") status = "atrasada";

        const meta = tx.metadata || {};
        const instNum = meta.installment_number != null ? meta.installment_number : (idx + 1);
        const instTotal = meta.total_installments || dealTransactions.length;
        const isDown = meta.is_down_payment === true;

        // Use due_date from metadata if available, fallback to created_at
        const dueDate = meta.due_date || tx.created_at;

        return {
          id: tx.id,
          number: isDown ? 0 : instNum,
          total: instTotal,
          value: tx.amount || 0,
          status,
          due_date: dueDate,
          paid_at: status === "paga" ? tx.updated_at : null,
          currency: tx.currency || currency,
          description: "",
          transaction_id: tx.id,
          payment_url: tx.payment_url,
          is_down_payment: isDown,
          invoice_id: meta.bitrix_old_invoice_id || meta.bitrix_invoice_id || null,
          is_direct: tx.gateway === "direto" || tx.payment_method === "parcelado_direto",
          company_name: tx.company_id ? (companyMap[tx.company_id] || meta.company_name || "") : (meta.company_name || ""),
        };
      });

      paidValue = installments.filter(i => i.status === "paga").reduce((s, i) => s + i.value, 0);
    } else {
      // No payment data — use deal amount as single "pending" installment if deal has amount
      if (dealAmount > 0) {
        totalValue = dealAmount;
        installments = [{
          id: `deal-${entityId}`,
          number: 1,
          total: 1,
          value: dealAmount,
          status: "pendente",
          due_date: null,
          paid_at: null,
          currency: dealCurrency,
          description: dealTitle,
        }];
      }
    }

    const openValue = totalValue - paidValue;

    // Fetch active flows for the trigger dropdown
    const { data: activeFlows } = await supabase
      .from("flows")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    const flows = (activeFlows || []).map((f: any) => ({ id: f.id, name: f.name }));

    return new Response(renderPaymentTab({
      entityId,
      dealTitle,
      totalValue,
      paidValue,
      openValue,
      currency,
      installments,
      supabaseUrl,
      memberId,
      flows,
      contactPhone,
      noData: installments.length === 0,
    }), { headers: htmlHeaders });

  } catch (err) {
    console.error("[PAYMENT-TAB] Fatal error:", err);
    return new Response(`<html><body><p style="color:red;padding:20px">Erro: ${String(err)}</p></body></html>`, {
      headers: htmlHeaders,
    });
  }
});
