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
  try { return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }); }
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

const METHOD_LABELS: Record<PayMethod, string> = {
  multibanco: "Multibanco",
  mb_way: "MB Way",
  card: "Cartão",
  sepa_debit: "Débito SEPA",
  pix: "Pix",
  boleto: "Boleto",
};

function methodsForCurrency(c: string): PayMethod[] {
  const cur = (c || "EUR").toUpperCase();
  if (cur === "BRL") return ["pix", "card", "boleto"];
  return ["multibanco", "mb_way", "card", "sepa_debit"];
}

// Minimal, monochrome SVG icons (Stripe-like)
const Icon = {
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  ),
  lock: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  arrow: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  ),
  alert: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  ),
};

export default function PagamentoPublico() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const autoPayRecordId = searchParams.get("pay");
  const autoPayMethod = searchParams.get("method") as PayMethod | null;
  const [autoTriggered, setAutoTriggered] = useState(false);

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState<{ title: string; message: string; missing?: string[]; details?: string; recordId?: string } | null>(null);
  const [methodChooser, setMethodChooser] = useState<{ recordId: string } | null>(null);

  // Force light theme — Stripe aesthetic is light-first
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  async function load() {
    const normalizedToken = token?.trim();
    setLoading(true);
    setError(null);
    setData(null);

    if (!normalizedToken) {
      setError("Token inválido ou ausente.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-receipt?token=${encodeURIComponent(normalizedToken)}&format=json`, {
        headers: { Accept: "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(res.status === 404 ? "Token não encontrado. Verifique o link recebido." : json.error || "Não foi possível carregar o relatório.");
        return;
      }
      if (!json || !Array.isArray(json.installments)) {
        setError("Relatório inválido ou indisponível.");
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

  // Auto-regenerar checkout Stripe quando o utilizador chega via link estável ?pay=<recordId>
  useEffect(() => {
    if (!autoPayRecordId || autoTriggered || !data || paymentStatus) return;
    const rec = data.installments.find((r) => r.id === autoPayRecordId);
    if (!rec || rec.status === "paga") return;
    setAutoTriggered(true);
    pay(autoPayRecordId, autoPayMethod || undefined);
  }, [autoPayRecordId, autoTriggered, data, paymentStatus, autoPayMethod]);


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
      return { rec, value, isPaid, isOverdue: !!isOverdue, lateFee };
    });
    const paidTotal = data.installments.filter(r => r.status === "paga").reduce((s, r) => s + (r.installment_value || 0), 0);
    const openBase = data.installments.filter(r => r.status !== "paga").reduce((s, r) => s + (r.installment_value || 0), 0);
    return {
      rows, totalCharges, paidTotal, openTotal: openBase + totalCharges,
      paidCount: data.installments.filter(r => r.status === "paga").length,
      nextOpen: rows.find(r => !r.isPaid),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="payment-receipt grid place-items-center">
        <div className="text-sm">A carregar…</div>
      </div>
    );
  }

  if (error || !data || !computed) {
    return (
      <div className="payment-receipt grid place-items-center p-6">
        <div className="border border-slate-200 p-8 rounded-xl max-w-[440px] text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-rose-50 text-rose-600 grid place-items-center mb-3">{Icon.alert}</div>
          <h1 className="text-base text-slate-900 mb-1 font-semibold">Relatório indisponível</h1>
          <p className="text-slate-500 text-sm">{error || "Não foi possível encontrar este relatório."}</p>
        </div>
      </div>
    );
  }

  const today = fmtDate(new Date().toISOString());
  const currency = data.currency || "EUR";
  const hasOpen = data.installments.some(r => r.status !== "paga");
  const productName = data.deal_title || "Serviço Jurídico";
  const progressPct = data.total_value > 0 ? Math.round((computed.paidTotal / data.total_value) * 100) : 0;

  return (
    <div className="payment-receipt">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: #fff !important; } .payment-page { display: block; max-width: 760px; padding: 24px; } .payment-summary-panel { margin-bottom: 24px; } }
      `}</style>

      <div className="payment-page">
        <aside className="payment-summary-panel">
          <div className="payment-merchant">
            <div className="payment-logo">E</div>
            <div>
              <div className="payment-merchant-name">Emmely Fernandes</div>
              <div className="payment-merchant-subtitle">Advocacia Internacional</div>
            </div>
          </div>

          <p className="payment-kicker">Pagar à Emmely Fernandes</p>
          <h1 className="payment-title">{productName}</h1>
          {data.client_name && <p className="payment-kicker mt-2">Para {data.client_name}</p>}
          <div className="payment-amount">{fmtCurrency(data.total_value, currency)}</div>

          <div className="payment-summary-list">
            <div className="payment-summary-row">
              <span className="payment-summary-label">Total</span>
              <span className="payment-summary-value">{fmtCurrency(data.total_value, currency)}</span>
            </div>
            <div className="payment-summary-row">
              <span className="payment-summary-label">Pago</span>
              <span className="payment-summary-value is-success">{fmtCurrency(computed.paidTotal, currency)}</span>
            </div>
            <div className="payment-summary-row">
              <span className="payment-summary-label">Em aberto{computed.totalCharges > 0 ? "*" : ""}</span>
              <span className="payment-summary-value">{fmtCurrency(computed.openTotal, currency)}</span>
            </div>
            <div className="payment-summary-row">
              <span className="payment-summary-label">Parcelas pagas</span>
              <span className="payment-summary-value">{computed.paidCount} de {data.installments.length}</span>
            </div>
          </div>

          <button onClick={() => window.print()} className="payment-print-button no-print">
            Descarregar PDF
          </button>
        </aside>

        <main>
          <div className="payment-detail-panel">
            <div className="payment-section">
              <div className="payment-kicker">Fatura de serviços</div>
              <div className="payment-title">{data.client_name || productName}</div>

              {paymentStatus === "success" && (
                <div className="payment-alert is-success"><span className="font-medium">Pagamento recebido.</span> A confirmação pode levar alguns segundos.</div>
              )}
              {paymentStatus === "cancelled" && (
                <div className="payment-alert is-warning"><span className="font-medium">Pagamento cancelado.</span> Pode tentar novamente abaixo.</div>
              )}
            </div>

            {hasOpen && computed.nextOpen && (
              <div className="payment-section no-print">
                <div className="payment-next-card">
                  <div className="payment-next-label">Próximo pagamento</div>
                  <div className="payment-next-amount">
                    {fmtCurrency(computed.nextOpen.lateFee.total, currency)}
                  </div>
                  <div className="payment-next-meta">
                    Vence {fmtDate(computed.nextOpen.rec.due_date)} · Parcela {computed.nextOpen.rec.installment_number || 1} de {computed.nextOpen.rec.total_installments || 1}
                  </div>
                  {computed.nextOpen.lateFee.charges > 0 && (
                    <div className="payment-installment-sub text-rose-600">
                      Inclui {fmtCurrency(computed.nextOpen.lateFee.charges, currency)} de juros e multa
                    </div>
                  )}
                  <button
                    disabled={paying === computed.nextOpen.rec.id}
                    onClick={() => setMethodChooser({ recordId: computed.nextOpen!.rec.id })}
                    className="payment-primary-button"
                  >
                    {paying === computed.nextOpen.rec.id ? "A processar…" : "Pagar agora"}
                  </button>
                  <div className="payment-method-note">Pagamento seguro · Multibanco · MB Way · Pix · Cartão</div>
                </div>
              </div>
            )}

            <div className="payment-section">
              <div className="payment-metrics">
                <div>
                  <div className="payment-metric-label">Total</div>
                  <div className="payment-metric-value">{fmtCurrency(data.total_value, currency)}</div>
                </div>
                <div>
                  <div className="payment-metric-label">Pago</div>
                  <div className="payment-metric-value is-success">{fmtCurrency(computed.paidTotal, currency)}</div>
                </div>
                <div>
                  <div className="payment-metric-label">Em aberto{computed.totalCharges > 0 ? "*" : ""}</div>
                  <div className="payment-metric-value">{fmtCurrency(computed.openTotal, currency)}</div>
                </div>
              </div>
              <div className="payment-progress-copy">
                <span>{computed.paidCount} de {data.installments.length} parcelas pagas</span>
                <span>{progressPct}%</span>
              </div>
              <div className="payment-progress">
                <div className="payment-progress-bar" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            <div>
              <div className="payment-installments-head payment-table-head">
                <div>Parcela</div>
                <div className="text-right">Vencimento</div>
                <div className="text-right">Valor</div>
                <div className="text-right">Status</div>
              </div>
              {computed.rows.map(({ rec, value, isPaid, isOverdue, lateFee }) => {
                const statusLabel = isPaid ? "Pago" : isOverdue ? "Atrasado" : "Pendente";
                const statusClass = isPaid ? "is-paid" : isOverdue ? "is-overdue" : "is-pending";
                return (
                  <div key={rec.id} className="payment-installment-row">
                    <div>
                      <div className="payment-installment-title">
                        Parcela {rec.installment_number || 1} <span className="payment-installment-muted">de {rec.total_installments || 1}</span>
                      </div>
                      {lateFee.charges > 0 && !isPaid && (
                        <div className="payment-installment-sub">+ {fmtCurrency(lateFee.charges, currency)} juros/multa</div>
                      )}
                      {isPaid && rec.paid_at && (
                        <div className="payment-installment-sub">Pago em {fmtDate(rec.paid_at)}</div>
                      )}
                    </div>
                    <div className="payment-installment-date">{fmtDate(rec.due_date)}</div>
                    <div className="payment-installment-value">{fmtCurrency(isPaid || !isOverdue ? value : lateFee.total, currency)}</div>
                    <div className="text-right">
                      <span className={`payment-status ${statusClass}`}>{statusLabel}</span>
                      {!isPaid && (
                        <button
                          disabled={paying === rec.id}
                          onClick={() => setMethodChooser({ recordId: rec.id })}
                          className="payment-link-button no-print"
                        >
                          {paying === rec.id ? "A processar…" : "Pagar"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {computed.totalCharges > 0 && (
              <div className="payment-footnote">
                * Inclui juros e multa por atraso, calculados automaticamente.
              </div>
            )}
          </div>

          <div className="payment-footer">
            Emmely Fernandes Advocacia Internacional · Documento gerado em {today}
            <br />Atualizado em tempo real.
          </div>
        </main>
      </div>

      {/* ERROR DIALOG */}
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

      {/* METHOD CHOOSER */}
      <Dialog open={!!methodChooser} onOpenChange={(o) => !o && setMethodChooser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Método de pagamento</DialogTitle>
            <DialogDescription className="text-xs">
              Selecione como pretende pagar. Redirecionamos para o checkout seguro.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-1">
            {methodsForCurrency(currency).map((m) => (
              <button
                key={m}
                disabled={!!paying}
                onClick={() => methodChooser && pay(methodChooser.recordId, m)}
                className="payment-method-option"
              >
                <span>{METHOD_LABELS[m]}</span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMethodChooser(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
