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

  const fontStack = 'ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-white text-slate-500" style={{ fontFamily: fontStack }}>
        <div className="text-sm">A carregar…</div>
      </div>
    );
  }

  if (error || !data || !computed) {
    return (
      <div className="min-h-screen grid place-items-center bg-white p-6" style={{ fontFamily: fontStack }}>
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
    <div className="min-h-screen bg-[#f6f9fc] text-slate-900" style={{ fontFamily: fontStack, fontFeatureSettings: '"ss01","cv11"' }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: #fff !important; } }
        .tabnum { font-variant-numeric: tabular-nums; }
      `}</style>

      <div className="max-w-[720px] mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* HEADER */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-md bg-slate-900 text-white grid place-items-center font-semibold text-[13px] tracking-tight">E</div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-slate-900">Emmely Fernandes</div>
            <div className="text-[11px] text-slate-500">Advocacia Internacional</div>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => window.print()}
              className="no-print inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 bg-white px-3 py-1.5 rounded-md transition"
            >
              {Icon.download} PDF
            </button>
          </div>
        </div>

        {/* MAIN CARD */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-15px_rgba(15,23,42,0.12)] overflow-hidden">
          {/* Summary */}
          <div className="px-6 md:px-8 pt-8 pb-6">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 mb-2">Fatura de serviços</div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-[20px] md:text-[22px] font-semibold text-slate-900 leading-tight">{productName}</h1>
                {data.client_name && (
                  <div className="text-[13px] text-slate-500 mt-1">Para <span className="text-slate-700">{data.client_name}</span></div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-0.5">Total</div>
                <div className="text-[22px] font-semibold tabnum text-slate-900">{fmtCurrency(data.total_value, currency)}</div>
              </div>
            </div>

            {/* Status banners */}
            {paymentStatus === "success" && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-[13px] text-emerald-900">
                <span className="mt-0.5 text-emerald-600">{Icon.check}</span>
                <div><span className="font-medium">Pagamento recebido.</span> A confirmação pode levar alguns segundos.</div>
              </div>
            )}
            {paymentStatus === "cancelled" && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[13px] text-amber-900">
                <span className="mt-0.5 text-amber-600">{Icon.alert}</span>
                <div><span className="font-medium">Pagamento cancelado.</span> Pode tentar novamente abaixo.</div>
              </div>
            )}
          </div>

          {/* Pay CTA */}
          {hasOpen && computed.nextOpen && (
            <div className="no-print px-6 md:px-8 pb-6">
              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Próximo pagamento</div>
                    <div className="text-[26px] font-semibold tabnum text-slate-900 leading-none mt-1">
                      {fmtCurrency(computed.nextOpen.lateFee.total, currency)}
                    </div>
                    <div className="text-[12px] text-slate-500 mt-1.5">
                      Vence {fmtDate(computed.nextOpen.rec.due_date)} · Parcela {computed.nextOpen.rec.installment_number || 1} de {computed.nextOpen.rec.total_installments || 1}
                    </div>
                    {computed.nextOpen.lateFee.charges > 0 && (
                      <div className="text-[12px] text-rose-600 mt-1">
                        Inclui {fmtCurrency(computed.nextOpen.lateFee.charges, currency)} de juros e multa
                      </div>
                    )}
                  </div>
                </div>
                <button
                  disabled={paying === computed.nextOpen.rec.id}
                  onClick={() => setMethodChooser({ recordId: computed.nextOpen!.rec.id })}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#635bff] hover:bg-[#5148e6] active:bg-[#4740d1] text-white font-medium text-[14px] py-3 rounded-lg transition disabled:opacity-60 shadow-[0_1px_2px_rgba(99,91,255,0.35)]"
                >
                  {paying === computed.nextOpen.rec.id ? "A processar…" : (<>Pagar agora {Icon.arrow}</>)}
                </button>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mt-3">
                  {Icon.lock} Pagamento seguro · Multibanco · MB Way · Pix · Cartão
                </div>
              </div>
            </div>
          )}

          {/* Progress + Totals */}
          <div className="px-6 md:px-8 pb-6 border-t border-slate-100 pt-6">
            <div className="grid grid-cols-3 gap-6 mb-5">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Total</div>
                <div className="text-[15px] font-semibold tabnum text-slate-900 mt-0.5">{fmtCurrency(data.total_value, currency)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Pago</div>
                <div className="text-[15px] font-semibold tabnum text-emerald-600 mt-0.5">{fmtCurrency(computed.paidTotal, currency)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                  Em aberto{computed.totalCharges > 0 ? "*" : ""}
                </div>
                <div className="text-[15px] font-semibold tabnum text-slate-900 mt-0.5">{fmtCurrency(computed.openTotal, currency)}</div>
              </div>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500 mb-1.5">
              <span>{computed.paidCount} de {data.installments.length} parcelas pagas</span>
              <span className="tabnum">{progressPct}%</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#635bff] transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Installments list */}
          <div className="border-t border-slate-100">
            <div className="px-6 md:px-8 py-3 flex items-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">
              <div className="flex-1">Parcela</div>
              <div className="w-24 text-right hidden sm:block">Vencimento</div>
              <div className="w-24 text-right tabnum">Valor</div>
              <div className="w-24 text-right hidden sm:block">Status</div>
            </div>
            <div className="divide-y divide-slate-100">
              {computed.rows.map(({ rec, value, isPaid, isOverdue, lateFee }) => {
                const statusLabel = isPaid ? "Pago" : isOverdue ? "Atrasado" : "Pendente";
                const statusClass = isPaid
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : isOverdue
                    ? "text-rose-700 bg-rose-50 border-rose-200"
                    : "text-amber-700 bg-amber-50 border-amber-200";
                return (
                  <div key={rec.id} className="px-6 md:px-8 py-4 hover:bg-slate-50/60 transition">
                    <div className="flex items-center">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-slate-900">
                          Parcela {rec.installment_number || 1} <span className="text-slate-400">de {rec.total_installments || 1}</span>
                        </div>
                        <div className="text-[12px] text-slate-500 sm:hidden mt-0.5">
                          {fmtDate(rec.due_date)}
                        </div>
                        {lateFee.charges > 0 && !isPaid && (
                          <div className="text-[11px] text-rose-600 mt-0.5">
                            + {fmtCurrency(lateFee.charges, currency)} juros/multa
                          </div>
                        )}
                        {isPaid && rec.paid_at && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Pago em {fmtDate(rec.paid_at)}
                          </div>
                        )}
                      </div>
                      <div className="w-24 text-right text-[13px] text-slate-600 tabnum hidden sm:block">
                        {fmtDate(rec.due_date)}
                      </div>
                      <div className="w-24 text-right text-[13px] font-medium tabnum text-slate-900">
                        {fmtCurrency(isPaid || !isOverdue ? value : lateFee.total, currency)}
                      </div>
                      <div className="w-24 text-right hidden sm:block">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 sm:mt-3">
                      <span className={`sm:hidden inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusClass}`}>
                        {statusLabel}
                      </span>
                      <div className="sm:hidden flex-1" />
                      {!isPaid && (
                        <button
                          disabled={paying === rec.id}
                          onClick={() => setMethodChooser({ recordId: rec.id })}
                          className="no-print ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-[#635bff] hover:text-[#4740d1] disabled:opacity-60"
                        >
                          {paying === rec.id ? "A processar…" : (<>Pagar {Icon.arrow}</>)}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {computed.totalCharges > 0 && (
            <div className="px-6 md:px-8 py-3 border-t border-slate-100 text-[11px] text-slate-500">
              * Inclui juros e multa por atraso, calculados automaticamente.
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="text-center text-slate-400 text-[11px] mt-6 leading-relaxed">
          Emmely Fernandes Advocacia Internacional · Documento gerado em {today}
          <br />Atualizado em tempo real.
        </div>
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
                className="flex items-center justify-between px-4 py-3 border border-slate-200 rounded-lg hover:border-slate-900 hover:bg-slate-50 transition disabled:opacity-50 text-left"
              >
                <span className="text-sm font-medium text-slate-900">{METHOD_LABELS[m]}</span>
                <span className="text-slate-400">{Icon.arrow}</span>
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
