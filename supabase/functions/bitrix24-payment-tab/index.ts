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
  status: string; // pendente, paga, atrasada, vencendo
  due_date: string | null;
  paid_at: string | null;
  currency: string;
  description: string;
  transaction_id?: string;
  payment_url?: string;
}

function getStatusColor(status: string): { bg: string; border: string; text: string; icon: string; label: string } {
  switch (status) {
    case "paga":
      return { bg: "#dcfce7", border: "#22c55e", text: "#166534", icon: "✅", label: "Pago" };
    case "atrasada":
      return { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", icon: "⚠️", label: "Em Atraso" };
    case "vencendo":
      return { bg: "#fefce8", border: "#eab308", text: "#854d0e", icon: "⏰", label: "Vencendo" };
    default:
      return { bg: "#f3f4f6", border: "#d1d5db", text: "#374151", icon: "⏳", label: "Pendente" };
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

  const installmentCards = installments.map((inst) => {
    const s = getStatusColor(inst.status);
    const flowOptions = flows.map(f => `<option value="${f.id}">${f.name}</option>`).join("");

    return `
      <div class="installment-card" style="background:${s.bg};border:1.5px solid ${s.border};border-radius:12px;padding:14px 16px;position:relative;transition:box-shadow 0.2s" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <span style="font-size:11px;font-weight:700;color:${s.text};text-transform:uppercase;letter-spacing:0.5px">${s.icon} Parcela ${inst.number}/${inst.total}</span>
            <div style="font-size:18px;font-weight:800;color:${s.text};margin-top:4px">${formatCurrency(inst.value, inst.currency)}</div>
          </div>
          <span style="display:inline-block;background:${s.border};color:#fff;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">${s.label}</span>
        </div>
        <div style="display:flex;gap:16px;font-size:11px;color:${s.text};opacity:0.85;margin-bottom:6px">
          <span>📅 Vence: ${formatDate(inst.due_date)}</span>
          ${inst.paid_at ? `<span>💰 Pago: ${formatDate(inst.paid_at)}</span>` : ""}
        </div>
        ${inst.description ? `<div style="font-size:11px;color:${s.text};opacity:0.7;margin-bottom:8px">${inst.description}</div>` : ""}
        ${inst.payment_url && inst.status !== "paga" ? `<a href="${inst.payment_url}" target="_blank" style="display:inline-block;background:${s.border};color:#fff;text-decoration:none;padding:6px 14px;border-radius:6px;font-size:11px;font-weight:600;margin-right:6px">🔗 Link de Pagamento</a>` : ""}
        ${inst.status !== "paga" && contactPhone && flows.length > 0 ? `
          <div style="display:flex;gap:6px;align-items:center;margin-top:8px">
            <select id="flow-${inst.id}" style="flex:1;height:28px;font-size:11px;border:1px solid ${s.border};border-radius:6px;padding:0 6px;background:#fff;color:${s.text}">
              <option value="">Selecionar fluxo...</option>
              ${flowOptions}
            </select>
            <button onclick="triggerFlow('${inst.id}','${contactPhone}',${inst.number})" style="background:#722F37;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
              🚀 Disparar
            </button>
          </div>
        ` : ""}
      </div>`;
  }).join("");

  const noDataHtml = `
    <div style="text-align:center;padding:48px 16px">
      <div style="font-size:48px;margin-bottom:12px">💳</div>
      <h3 style="color:#555;margin:0 0 8px;font-size:15px">Nenhum pagamento registado</h3>
      <p style="color:#999;font-size:12px;margin:0">Este negócio ainda não possui registos financeiros associados.</p>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Emmely Pay</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; color: #222; }
    #app { display: flex; flex-direction: column; min-height: 100vh; }
    .summary-bar { background: #fff; border-bottom: 1px solid #e8e8e8; padding: 16px; }
    .summary-title { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
    .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; text-align: center; }
    .summary-card .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px; }
    .summary-card .value { font-size: 17px; font-weight: 800; }
    .progress-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
    .progress-label { font-size: 10px; color: #6b7280; margin-top: 4px; text-align: right; }
    .installments-grid { padding: 16px; display: grid; gap: 12px; grid-template-columns: 1fr; }
    @media (min-width: 600px) { .installments-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 900px) { .installments-grid { grid-template-columns: repeat(3, 1fr); } }
    #status-msg { font-size: 12px; color: #888; text-align: center; padding: 8px 16px; min-height: 20px; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
  </style>
</head>
<body>
<div id="app">
  ${noData ? noDataHtml : `
  <div class="summary-bar">
    <div class="summary-title">💳 ${(dealTitle || "Negócio").replace(/</g, "&lt;")}</div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total</div>
        <div class="value" style="color:#111">${formatCurrency(totalValue, currency)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Pago</div>
        <div class="value" style="color:#22c55e">${formatCurrency(paidValue, currency)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Em Aberto</div>
        <div class="value" style="color:${openValue > 0 ? '#ef4444' : '#22c55e'}">${formatCurrency(openValue, currency)}</div>
      </div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${paidPct}%;background:${paidPct >= 100 ? '#22c55e' : paidPct > 0 ? '#3b82f6' : '#d1d5db'}"></div>
    </div>
    <div class="progress-label">${paidPct}% pago</div>
  </div>

  <div class="installments-grid">
    ${installmentCards}
  </div>
  `}
  <div id="status-msg"></div>
</div>

<script>
  var SUPABASE_URL = "${supabaseUrl}";
  var SUPABASE_KEY = "${Deno.env.get("SUPABASE_ANON_KEY") || ""}";
  var MEMBER_ID = "${memberId}";

  function setStatus(msg, color) {
    var el = document.getElementById('status-msg');
    if (el) { el.textContent = msg; el.style.color = color || '#888'; }
  }

  function triggerFlow(installmentId, phone, installmentNum) {
    var sel = document.getElementById('flow-' + installmentId);
    if (!sel || !sel.value) { setStatus('Selecione um fluxo primeiro.', '#ef4444'); return; }
    var flowId = sel.value;
    setStatus('A disparar fluxo...', '#888');

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
      setStatus('✅ Fluxo disparado com sucesso para ' + phone, '#22c55e');
    })
    .catch(function(e) { setStatus('❌ Erro: ' + e.message, '#ef4444'); });
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

      installments = dealTransactions.map((tx: any, idx: number) => {
        let status = "pendente";
        if (tx.status === "paid" || tx.status === "confirmed" || tx.status === "succeeded") status = "paga";
        else if (tx.status === "overdue" || tx.status === "failed") status = "atrasada";

        return {
          id: tx.id,
          number: idx + 1,
          total: dealTransactions.length,
          value: tx.amount || 0,
          status,
          due_date: tx.created_at,
          paid_at: status === "paga" ? tx.updated_at : null,
          currency: tx.currency || currency,
          description: "",
          transaction_id: tx.id,
          payment_url: tx.payment_url,
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
