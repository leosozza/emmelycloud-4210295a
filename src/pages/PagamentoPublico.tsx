import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Installment {
  id: string;
  installment_number: number | null;
  total_installments: number | null;
  installment_value: number;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  currency: string | null;
  is_synthetic?: boolean;
}

interface ReportData {
  client_name: string | null;
  deal_title: string | null;
  currency: string;
  total_value: number;
  installments: Installment[];
  late_fee_config: {
    penalty_pct: number;
    interest_monthly_pct: number;
    max_interest_days: number;
    grace_days: number;
  };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function fmtCurrency(v: number, c: string) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: c || "EUR" }).format(v || 0);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return d; }
}

function calcLateFee(value: number, daysLate: number, cfg: ReportData["late_fee_config"]) {
  const eff = Math.max(0, daysLate - cfg.grace_days);
  const cap = Math.min(eff, cfg.max_interest_days);
  if (cap <= 0) return { charges: 0, total: value };
  const penalty = Math.round(value * (cfg.penalty_pct / 100) * 100) / 100;
  const interest = Math.round(value * (cfg.interest_monthly_pct / 100) * (cap / 30) * 100) / 100;
  const charges = penalty + interest;
  return { charges, total: Math.round((value + charges) * 100) / 100 };
}

type PayMethod = "multibanco" | "mb_way" | "card" | "sepa_debit" | "pix" | "boleto";

const METHOD_LABELS: Record<PayMethod, { label: string; emoji: string }> = {
  multibanco: { label: "Multibanco", emoji: "🏧" },
  mb_way: { label: "MB Way", emoji: "📱" },
  card: { label: "Cartão", emoji: "💳" },
  sepa_debit: { label: "SEPA", emoji: "🏦" },
  pix: { label: "Pix", emoji: "⚡" },
  boleto: { label: "Boleto", emoji: "🧾" },
};

function methodsForCurrency(c: string): PayMethod[] {
  const cur = (c || "EUR").toUpperCase();
  if (cur === "BRL") return ["pix", "card", "boleto"];
  return ["multibanco", "mb_way", "card", "sepa_debit"];
}

export default function PagamentoPublico() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState<{ title: string; message: string; missing?: string[]; details?: string; recordId?: string } | null>(null);
  const [methodChooser, setMethodChooser] = useState<{ recordId: string } | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-receipt?token=${token}&format=json`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Não foi possível carregar o relatório.");
        return;
      }
      setData(json);
    } catch (e: any) {
      setError(e.message || "Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function pay(recordId: string, payment_method?: PayMethod) {
    if (!token) return;
    setPaying(recordId);
    setPayError(null);
    setMethodChooser(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-create-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, financial_record_id: recordId, payment_method }),
      });
      const j = await res.json();
      if (!res.ok || !j.payment_url) {
        if (Array.isArray(j.missing_fields) && j.missing_fields.length > 0) {
          setPayError({
            title: "Faltam dados no Bitrix24",
            message: "Para gerar o link de pagamento desta parcela, configure os seguintes campos no negócio do Bitrix24:",
            missing: j.missing_fields,
            details: j.deal_id ? `Negócio Bitrix24 ID: ${j.deal_id}` : undefined,
            recordId,
          });
        } else {
          setPayError({
            title: "Não foi possível gerar o pagamento",
            message: j.error || "Erro desconhecido ao contactar o gateway.",
            details: j.details,
            recordId,
          });
        }
        setPaying(null);
        return;
      }
      window.location.href = j.payment_url;
    } catch (e: any) {
      setPayError({
        title: "Erro de rede",
        message: e?.message || "Não foi possível contactar o servidor. Verifique a sua ligação.",
        recordId,
      });
      setPaying(null);
    }
  }

  function copyErrorDetails() {
    if (!payError) return;
    const text = [
      payError.title,
      payError.message,
      payError.missing?.length ? `Campos em falta:\n- ${payError.missing.join("\n- ")}` : "",
      payError.details || "",
      `Token: ${token}`,
    ].filter(Boolean).join("\n\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  const computed = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    let totalCharges = 0;
    const rows = data.installments.map(rec => {
      const value = rec.installment_value || 0;
      const isPaid = rec.status === "paga";
      const isOverdue = !isPaid && rec.due_date && new Date(rec.due_date) < now;
      let lateFee = { charges: 0, total: value };
      if (isOverdue && rec.due_date) {
        const days = Math.floor((now.getTime() - new Date(rec.due_date).getTime()) / 86400000);
        lateFee = calcLateFee(value, days, data.late_fee_config);
        totalCharges += lateFee.charges;
      }
      return { rec, value, isPaid, isOverdue, lateFee };
    });
    const paidTotal = data.installments.filter(r => r.status === "paga").reduce((s, r) => s + (r.installment_value || 0), 0);
    const openBase = data.installments.filter(r => r.status !== "paga").reduce((s, r) => s + (r.installment_value || 0), 0);
    return {
      rows, totalCharges, paidTotal, openTotal: openBase + totalCharges,
      paidCount: data.installments.filter(r => r.status === "paga").length,
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", fontFamily: "Segoe UI, Arial, sans-serif" }}>
        <div style={{ color: "#64748b" }}>A carregar relatório de pagamentos...</div>
      </div>
    );
  }

  if (error || !data || !computed) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", fontFamily: "Segoe UI, Arial, sans-serif", padding: 20 }}>
        <div style={{ background: "#fff", padding: 32, borderRadius: 12, maxWidth: 480, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h1 style={{ fontSize: 18, color: "#dc2626", marginBottom: 8 }}>Relatório indisponível</h1>
          <p style={{ color: "#64748b", fontSize: 14 }}>{error || "Não foi possível encontrar este relatório."}</p>
        </div>
      </div>
    );
  }

  const today = fmtDate(new Date().toISOString());
  const currency = data.currency || "EUR";
  const hasOpen = data.installments.some(r => r.status !== "paga");

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "Segoe UI, Arial, sans-serif", color: "#333" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", background: "#fff", minHeight: "100vh" }}>
        <div style={{ background: "linear-gradient(135deg, #1e293b, #0f172a)", color: "#fff", padding: "32px 40px" }}>
          <h1 style={{ fontSize: 20, margin: 0, letterSpacing: 2, fontWeight: 800 }}>EMMELY FERNANDES</h1>
          <p style={{ margin: "4px 0 0", fontSize: 11, letterSpacing: 4, color: "#94a3b8", textTransform: "uppercase" }}>Advocacia Internacional</p>
        </div>

        <div style={{ padding: "32px 40px" }}>
          <button onClick={() => window.print()} style={{ background: "#1e293b", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 24 }}>
            📥 Baixar / Imprimir PDF
          </button>

          {paymentStatus === "success" && (
            <div style={{ background: "linear-gradient(135deg,#dcfce7,#bbf7d0)", borderLeft: "4px solid #16a34a", color: "#14532d", padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
              <strong>✅ Pagamento recebido com sucesso!</strong> A confirmação pode levar alguns segundos para aparecer abaixo.
            </div>
          )}
          {paymentStatus === "cancelled" && (
            <div style={{ background: "linear-gradient(135deg,#fef3c7,#fde68a)", borderLeft: "4px solid #f59e0b", color: "#78350f", padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
              <strong>⚠️ Pagamento cancelado.</strong> Pode tentar novamente clicando em "Pagar" abaixo.
            </div>
          )}
          {hasOpen && (
            <div style={{ background: "linear-gradient(135deg, #ecfdf5, #d1fae5)", borderLeft: "4px solid #10b981", color: "#065f46", padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
              💳 <strong>Clique em "Pagar"</strong> em qualquer parcela em aberto para gerar o link de cobrança imediatamente (Multibanco, MB Way, Pix ou Cartão).
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24, fontSize: 13 }}>
            <div><span style={{ color: "#64748b" }}>Cliente:</span> <strong>{data.client_name || "—"}</strong></div>
            <div><span style={{ color: "#64748b" }}>Serviço:</span> <strong>{data.deal_title || "—"}</strong></div>
            <div><span style={{ color: "#64748b" }}>Data:</span> <strong>{today}</strong></div>
            <div><span style={{ color: "#64748b" }}>Parcelas:</span> <strong>{computed.paidCount}/{data.installments.length} pagas</strong></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
            <div style={{ padding: 16, borderRadius: 10, textAlign: "center", background: "#eff6ff" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtCurrency(data.total_value, currency)}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 10, textAlign: "center", background: "#ecfdf5" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>Pago</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{fmtCurrency(computed.paidTotal, currency)}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 10, textAlign: "center", background: "#fef2f2" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>
                Em Aberto{computed.totalCharges > 0 ? " (c/ juros)" : ""}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{fmtCurrency(computed.openTotal, currency)}</div>
            </div>
          </div>

          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#3b82f6,#06b6d4)", width: `${data.total_value > 0 ? Math.round((computed.paidTotal / data.total_value) * 100) : 0}%` }} />
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Parcela", "Vencimento", "Valor", "Juros/Multa", "Pago", "Data Pgto", "Status"].map(h => (
                  <th key={h} style={{ background: "#f1f5f9", padding: "10px 12px", border: "1px solid #e5e7eb", fontSize: 10, textTransform: "uppercase", color: "#475569", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.rows.map(({ rec, value, isPaid, isOverdue, lateFee }) => {
                const statusLabel = isPaid ? "PAGO" : isOverdue ? "ATRASADO" : "PENDENTE";
                const statusColor = isPaid ? "#10b981" : isOverdue ? "#ef4444" : "#f59e0b";
                const statusBg = isPaid ? "#ecfdf5" : isOverdue ? "#fef2f2" : "#fffbeb";
                return (
                  <tr key={rec.id}>
                    <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "center", fontWeight: 600 }}>{rec.installment_number || 1}/{rec.total_installments || 1}</td>
                    <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "center" }}>{fmtDate(rec.due_date)}</td>
                    <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "right" }}>{fmtCurrency(value, currency)}</td>
                    <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "right", color: lateFee.charges > 0 ? "#ef4444" : "#6b7280" }}>{lateFee.charges > 0 ? fmtCurrency(lateFee.charges, currency) : "—"}</td>
                    <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "right", fontWeight: 600, color: isPaid ? "#10b981" : "#6b7280" }}>{isPaid ? fmtCurrency(value, currency) : "—"}</td>
                    <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "center" }}>{fmtDate(rec.paid_at)}</td>
                    <td style={{ padding: "10px 12px", border: "1px solid #e5e7eb", textAlign: "center", whiteSpace: "nowrap" }}>
                      <span style={{ background: statusBg, color: statusColor, fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 12 }}>{statusLabel}</span>
                      {!isPaid && (
                        <div style={{ marginTop: 6 }}>
                          <button
                            disabled={paying === rec.id}
                            onClick={() => setMethodChooser({ recordId: rec.id })}
                            style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: paying === rec.id ? "wait" : "pointer", opacity: paying === rec.id ? 0.6 : 1 }}
                          >
                            {paying === rec.id ? "⏳ Aguarde..." : "💳 Pagar"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 10, padding: "24px 40px", borderTop: "1px solid #e5e7eb", lineHeight: 1.8 }}>
          Emmely Fernandes Advocacia Internacional<br />
          Documento gerado automaticamente em {today}<br />
          Este comprovante é atualizado em tempo real.
        </div>
      </div>

      <Dialog open={!!payError} onOpenChange={(o) => !o && setPayError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{payError?.title}</DialogTitle>
            <DialogDescription>{payError?.message}</DialogDescription>
          </DialogHeader>
          {payError?.missing && payError.missing.length > 0 && (
            <ul className="list-disc pl-5 text-sm space-y-1 bg-muted/40 p-3 rounded-md">
              {payError.missing.map((f) => (
                <li key={f} className="font-mono text-xs">{f}</li>
              ))}
            </ul>
          )}
          {payError?.details && (
            <p className="text-xs text-muted-foreground">{payError.details}</p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={copyErrorDetails}>Copiar detalhes</Button>
            <Button
              onClick={() => {
                const id = payError?.recordId;
                setPayError(null);
                if (id) pay(id);
              }}
            >
              Tentar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!methodChooser} onOpenChange={(o) => !o && setMethodChooser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolha o método de pagamento</DialogTitle>
            <DialogDescription>
              Selecione como pretende pagar esta parcela. Será redirecionado para o checkout seguro do Stripe.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {methodsForCurrency(currency).map((m) => (
              <button
                key={m}
                disabled={!!paying}
                onClick={() => methodChooser && pay(methodChooser.recordId, m)}
                className="flex flex-col items-center gap-2 p-4 border rounded-lg hover:bg-accent hover:border-primary transition disabled:opacity-50"
              >
                <span className="text-3xl">{METHOD_LABELS[m].emoji}</span>
                <span className="text-sm font-semibold">{METHOD_LABELS[m].label}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMethodChooser(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
