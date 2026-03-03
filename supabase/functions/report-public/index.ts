import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response("Missing report ID", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: snapshot, error } = await supabase
    .from("report_snapshots")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !snapshot) {
    return new Response(renderErrorPage("Relatório não encontrado"), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Check expiry
  if (new Date(snapshot.expires_at) < new Date()) {
    return new Response(renderErrorPage("Este relatório expirou"), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const reportData = snapshot.data as any;
  const filters = snapshot.filters as any;

  const html = renderReportPage(snapshot.title, reportData, filters, snapshot.created_at, snapshot.expires_at);

  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
});

function renderErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;color:#333}
.box{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08)}h1{font-size:20px;margin-bottom:8px}p{color:#666}</style>
</head><body><div class="box"><h1>⚠️ ${message}</h1><p>Verifique o link ou solicite um novo relatório.</p></div></body></html>`;
}

function fmt(v: number, currency = "EUR"): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, minimumFractionDigits: 0 }).format(v);
}

function renderReportPage(title: string, data: any, filters: any, createdAt: string, expiresAt: string): string {
  const { kpis, sellerData, transactions } = data;
  const created = new Date(createdAt).toLocaleString("pt-PT");
  const expires = new Date(expiresAt).toLocaleString("pt-PT");

  const filterDesc = [];
  if (filters.period) filterDesc.push(`Período: ${filters.period}`);
  if (filters.company && filters.company !== "all") filterDesc.push(`Empresa: ${filters.company}`);
  if (filters.gateway && filters.gateway !== "all") filterDesc.push(`Gateway: ${filters.gateway}`);
  if (filters.client && filters.client !== "all") filterDesc.push(`Cliente: ${filters.client}`);

  const sellerRows = (sellerData || []).map((s: any) => `
    <tr>
      <td>${s.name}</td>
      <td style="text-align:right">${s.count}</td>
      <td style="text-align:right">${fmt(s.total)}</td>
      <td style="text-align:right;color:#589731">${fmt(s.paid)}</td>
      <td style="text-align:right;color:#c49c00">${fmt(s.total - s.paid)}</td>
      <td style="text-align:right;font-weight:600">${s.total > 0 ? Math.round((s.paid / s.total) * 100) : 0}%</td>
    </tr>
  `).join("");

  const txRows = (transactions || []).slice(0, 200).map((t: any) => {
    const statusLabel: Record<string, string> = { confirmed: "✅ Pago", pending: "⏳ Pendente", overdue: "🔴 Atrasado" };
    const status = t.status === "confirmed" ? "confirmed" : (t.status === "pending" && t.due_date && new Date(t.due_date) < new Date() ? "overdue" : "pending");
    return `<tr>
      <td>${new Date(t.created_at).toLocaleDateString("pt-PT")}</td>
      <td>${t.client_name || "—"}</td>
      <td>${t.company_name || "—"}</td>
      <td>${t.responsible || "—"}</td>
      <td style="text-align:right;font-weight:500">${fmt(t.amount)}</td>
      <td>${t.payment_method || "—"}</td>
      <td>${t.gateway || "—"}</td>
      <td>${statusLabel[status] || t.status}</td>
      <td>${t.due_date ? new Date(t.due_date).toLocaleDateString("pt-PT") : "—"}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f8f9fa;color:#1a1a2e;padding:20px;line-height:1.5}
.container{max-width:1200px;margin:0 auto}
.header{background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:28px 32px;border-radius:12px;margin-bottom:20px}
.header h1{font-size:22px;font-weight:700}.header p{font-size:12px;opacity:.7;margin-top:4px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.filters span{background:rgba(255,255,255,.15);padding:3px 10px;border-radius:6px;font-size:11px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.kpi{background:#fff;border-radius:10px;padding:16px 18px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.kpi .label{font-size:11px;color:#888;margin-bottom:2px}.kpi .value{font-size:20px;font-weight:700}
.card{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:16px}
.card h2{font-size:14px;font-weight:600;margin-bottom:12px;color:#333}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 12px;background:#f1f3f5;font-weight:600;color:#555;border-bottom:2px solid #e9ecef}
td{padding:7px 12px;border-bottom:1px solid #f1f3f5}
tr:hover td{background:#f8f9fa}
.footer{text-align:center;padding:16px;font-size:11px;color:#999;margin-top:10px}
@media print{body{padding:0;background:#fff}.header{break-after:avoid}.card{break-inside:avoid;box-shadow:none;border:1px solid #e9ecef}}
@media(max-width:600px){.kpis{grid-template-columns:1fr 1fr}table{font-size:10px}th,td{padding:5px 6px}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 ${title}</h1>
    <p>Gerado em ${created} · Expira em ${expires}</p>
    ${filterDesc.length ? `<div class="filters">${filterDesc.map(f => `<span>${f}</span>`).join("")}</div>` : ""}
  </div>

  <div class="kpis">
    <div class="kpi"><div class="label">Total Cobrado</div><div class="value">${fmt(kpis?.totalCharged || 0)}</div></div>
    <div class="kpi"><div class="label">Total Pago</div><div class="value" style="color:#589731">${fmt(kpis?.totalPaid || 0)}</div></div>
    <div class="kpi"><div class="label">Em Aberto</div><div class="value" style="color:#c49c00">${fmt(kpis?.openAmount || 0)}</div></div>
    <div class="kpi"><div class="label">Em Atraso</div><div class="value" style="color:#df532d">${fmt(kpis?.overdueAmount || 0)}</div></div>
    <div class="kpi"><div class="label">Transações Pagas</div><div class="value">${kpis?.confirmedCount || 0}</div></div>
    <div class="kpi"><div class="label">Taxa Pagamento</div><div class="value">${kpis?.paymentRate || 0}%</div></div>
  </div>

  ${sellerData?.length ? `
  <div class="card">
    <h2>👤 Resumo por Vendedor</h2>
    <table>
      <thead><tr><th>Vendedor</th><th style="text-align:right">Nº Trans.</th><th style="text-align:right">Total</th><th style="text-align:right">Pago</th><th style="text-align:right">Em Aberto</th><th style="text-align:right">% Pago</th></tr></thead>
      <tbody>${sellerRows}</tbody>
    </table>
  </div>` : ""}

  <div class="card">
    <h2>📋 Transações Detalhadas (${transactions?.length || 0})</h2>
    <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Data</th><th>Cliente</th><th>Empresa</th><th>Responsável</th><th style="text-align:right">Valor</th><th>Método</th><th>Gateway</th><th>Status</th><th>Vencimento</th></tr></thead>
      <tbody>${txRows || '<tr><td colspan="9" style="text-align:center;padding:20px;color:#999">Sem transações</td></tr>'}</tbody>
    </table>
    </div>
  </div>

  <div class="footer">
    Relatório gerado automaticamente · Emmely Cloud
    <br><button onclick="window.print()" style="margin-top:8px;padding:8px 20px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">🖨️ Imprimir / Exportar PDF</button>
  </div>
</div>
</body>
</html>`;
}
