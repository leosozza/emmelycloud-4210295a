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

  // Theme follows OS — no toggle, no persistence
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (dark: boolean) => root.classList.toggle("dark", dark);
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", onChange);
    return () => { mq.removeEventListener("change", onChange); root.classList.remove("dark"); };
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
      return { rec, value, isPaid, isOverdue, lateFee };
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
      <div className="min-h-screen grid place-items-center bg-[#f7f8fa] dark:bg-[#0b0f17] text-slate-500 dark:text-slate-400" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <div>A carregar relatório de pagamentos...</div>
      </div>
    );
  }

  if (error || !data || !computed) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f7f8fa] dark:bg-[#0b0f17] p-5" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-xl max-w-[480px] text-center shadow-sm">
          <h1 className="text-lg text-red-600 mb-2 font-semibold">Relatório indisponível</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{error || "Não foi possível encontrar este relatório."}</p>
        </div>
      </div>
    );
  }

  const today = fmtDate(new Date().toISOString());
  const currency = data.currency || "EUR";
  const hasOpen = data.installments.some(r => r.status !== "paga");
  const productName = data.deal_title || "Serviço Jurídico";

  return (
    <div className="min-h-screen bg-[#f7f8fa] dark:bg-[#0b0f17] text-slate-800 dark:text-slate-100" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @media print { .no-print { display: none !important; } }
      `}</style>

      <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 min-h-screen md:shadow-sm md:border-x md:border-slate-200 md:dark:border-slate-800">
        {/* HEADER */}
        <div className="px-5 py-6 md:px-10 md:py-7 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1b6ef3] grid place-items-center text-white font-bold text-sm">E</div>
          <div>
            <h1 className="text-sm md:text-base font-bold tracking-wide text-slate-900 dark:text-slate-50 m-0">Emmely Fernandes</h1>
            <p className="m-0 mt-0.5 text-[10px] md:text-[11px] tracking-[0.25em] text-slate-500 dark:text-slate-400 uppercase">Advocacia Internacional</p>
          </div>
        </div>

        {/* CONTENT */}
        <div className="px-4 py-5 md:px-10 md:py-8">

          {/* PRODUCT/SERVICE HERO CARD */}
          <div className="bg-[#eff5ff] dark:bg-[#1b6ef3]/10 border border-[#dbeafe] dark:border-[#1b6ef3]/30 rounded-xl p-4 md:p-5 mb-5">
            <div className="text-[10px] uppercase tracking-widest text-[#1b6ef3] dark:text-[#60a5fa] font-semibold mb-1">Serviço Contratado</div>
            <div className="text-lg md:text-2xl font-bold text-slate-900 dark:text-slate-50 leading-tight break-words">{productName}</div>
            {data.client_name && (
              <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mt-2">
                Cliente: <strong className="text-slate-800 dark:text-slate-200">{data.client_name}</strong>
              </div>
            )}
          </div>

          {/* PRINT BUTTON */}
          <button onClick={() => window.print()} className="no-print bg-slate-900 dark:bg-slate-700 text-white border-none py-2.5 px-5 rounded-lg text-xs font-semibold cursor-pointer mb-5 hover:opacity-90 transition">
            📥 Baixar / Imprimir PDF
          </button>

          {/* STATUS BANNERS */}
          {paymentStatus === "success" && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-600 text-emerald-900 dark:text-emerald-200 px-4 py-3 rounded-lg mb-4 text-xs md:text-sm">
              <strong>✅ Pagamento recebido com sucesso!</strong> A confirmação pode levar alguns segundos.
            </div>
          )}
          {paymentStatus === "cancelled" && (

            <div className="bg-gradient-to-br from-amber-100 to-amber-200 border-l-4 border-amber-500 text-amber-900 px-4 py-3 rounded-lg mb-4 text-xs md:text-sm">
              <strong>⚠️ Pagamento cancelado.</strong> Pode tentar novamente abaixo.
            </div>
          )}

          {/* BIG PAY CTA — Mobile-first */}
          {hasOpen && computed.nextOpen && (
            <div className="no-print mb-6 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 md:p-6 shadow-lg shadow-emerald-200">
              <div className="text-white/90 text-xs uppercase tracking-wider font-semibold mb-1">Próxima parcela em aberto</div>
              <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
                <div className="text-white text-3xl md:text-4xl font-extrabold">
                  {fmtCurrency(computed.nextOpen.lateFee.total, currency)}
                </div>
                <div className="text-white/90 text-sm">
                  Parcela {computed.nextOpen.rec.installment_number || 1}/{computed.nextOpen.rec.total_installments || 1}
                </div>
              </div>
              {computed.nextOpen.lateFee.charges > 0 && (
                <div className="text-white/90 text-xs mb-3">
                  Inclui {fmtCurrency(computed.nextOpen.lateFee.charges, currency)} de juros/multa
                </div>
              )}
              <div className="text-white/80 text-xs mb-4">
                Vencimento: {fmtDate(computed.nextOpen.rec.due_date)}
              </div>
              <button
                disabled={paying === computed.nextOpen.rec.id}
                onClick={() => setMethodChooser({ recordId: computed.nextOpen!.rec.id })}
                className="w-full bg-white text-emerald-700 font-extrabold text-base md:text-lg py-4 rounded-xl shadow-md hover:shadow-xl active:scale-[0.98] transition disabled:opacity-60"
              >
                {paying === computed.nextOpen.rec.id ? "⏳ A processar..." : "💳 PAGAR AGORA"}
              </button>
              <div className="text-white/80 text-[11px] text-center mt-3">
                🔒 Pagamento seguro · Multibanco · MB Way · Pix · Cartão
              </div>
            </div>
          )}

          {/* SUMMARY GRID */}
          <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
            <div className="p-3 md:p-4 rounded-xl text-center bg-blue-50">
              <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Total</div>
              <div className="text-sm md:text-xl font-extrabold text-slate-900">{fmtCurrency(data.total_value, currency)}</div>
            </div>
            <div className="p-3 md:p-4 rounded-xl text-center bg-emerald-50">
              <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Pago</div>
              <div className="text-sm md:text-xl font-extrabold text-emerald-600">{fmtCurrency(computed.paidTotal, currency)}</div>
            </div>
            <div className="p-3 md:p-4 rounded-xl text-center bg-red-50">
              <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                Em Aberto{computed.totalCharges > 0 ? "*" : ""}
              </div>
              <div className="text-sm md:text-xl font-extrabold text-red-600">{fmtCurrency(computed.openTotal, currency)}</div>
            </div>
          </div>

          {/* PROGRESS BAR */}
          <div className="text-xs text-slate-600 mb-1.5 flex justify-between">
            <span>Progresso de pagamento</span>
            <span className="font-semibold">{computed.paidCount}/{data.installments.length} parcelas</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-6">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all" style={{ width: `${data.total_value > 0 ? Math.round((computed.paidTotal / data.total_value) * 100) : 0}%` }} />
          </div>

          {/* INSTALLMENTS — DESKTOP TABLE */}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {["Parcela", "Vencimento", "Valor", "Juros/Multa", "Pago", "Data Pgto", "Status"].map(h => (
                    <th key={h} className="bg-slate-100 px-3 py-2.5 border border-slate-200 text-[10px] uppercase text-slate-600 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {computed.rows.map(({ rec, value, isPaid, isOverdue, lateFee }) => {
                  const statusLabel = isPaid ? "PAGO" : isOverdue ? "ATRASADO" : "PENDENTE";
                  const statusColor = isPaid ? "text-emerald-600 bg-emerald-50" : isOverdue ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50";
                  return (
                    <tr key={rec.id}>
                      <td className="px-3 py-2.5 border border-slate-200 text-center font-semibold">{rec.installment_number || 1}/{rec.total_installments || 1}</td>
                      <td className="px-3 py-2.5 border border-slate-200 text-center">{fmtDate(rec.due_date)}</td>
                      <td className="px-3 py-2.5 border border-slate-200 text-right">{fmtCurrency(value, currency)}</td>
                      <td className={`px-3 py-2.5 border border-slate-200 text-right ${lateFee.charges > 0 ? "text-red-600" : "text-slate-500"}`}>{lateFee.charges > 0 ? fmtCurrency(lateFee.charges, currency) : "—"}</td>
                      <td className={`px-3 py-2.5 border border-slate-200 text-right font-semibold ${isPaid ? "text-emerald-600" : "text-slate-500"}`}>{isPaid ? fmtCurrency(value, currency) : "—"}</td>
                      <td className="px-3 py-2.5 border border-slate-200 text-center">{fmtDate(rec.paid_at)}</td>
                      <td className="px-3 py-2.5 border border-slate-200 text-center whitespace-nowrap">
                        <span className={`${statusColor} font-bold text-[11px] px-2.5 py-1 rounded-full`}>{statusLabel}</span>
                        {!isPaid && (
                          <div className="mt-1.5 no-print">
                            <button
                              disabled={paying === rec.id}
                              onClick={() => setMethodChooser({ recordId: rec.id })}
                              className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none py-1.5 px-3.5 rounded-md text-[11px] font-bold cursor-pointer disabled:opacity-60 hover:shadow-md transition"
                            >
                              {paying === rec.id ? "⏳" : "💳 Pagar"}
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

          {/* INSTALLMENTS — MOBILE CARDS */}
          <div className="md:hidden space-y-3">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Todas as parcelas</div>
            {computed.rows.map(({ rec, value, isPaid, isOverdue, lateFee }) => {
              const statusLabel = isPaid ? "PAGO" : isOverdue ? "ATRASADO" : "PENDENTE";
              const statusColor = isPaid ? "text-emerald-700 bg-emerald-100" : isOverdue ? "text-red-700 bg-red-100" : "text-amber-700 bg-amber-100";
              const borderColor = isPaid ? "border-emerald-200" : isOverdue ? "border-red-200" : "border-slate-200";
              return (
                <div key={rec.id} className={`border ${borderColor} rounded-xl p-4 bg-white shadow-sm`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Parcela</div>
                      <div className="text-base font-bold text-slate-900">{rec.installment_number || 1}/{rec.total_installments || 1}</div>
                    </div>
                    <span className={`${statusColor} font-bold text-[10px] px-2.5 py-1 rounded-full`}>{statusLabel}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                      <div className="text-slate-500">Vencimento</div>
                      <div className="font-semibold text-slate-800">{fmtDate(rec.due_date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500">Valor</div>
                      <div className="font-bold text-slate-900">{fmtCurrency(value, currency)}</div>
                    </div>
                    {lateFee.charges > 0 && (
                      <>
                        <div>
                          <div className="text-slate-500">Juros/Multa</div>
                          <div className="font-semibold text-red-600">{fmtCurrency(lateFee.charges, currency)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-500">Total c/ juros</div>
                          <div className="font-bold text-red-700">{fmtCurrency(lateFee.total, currency)}</div>
                        </div>
                      </>
                    )}
                    {isPaid && rec.paid_at && (
                      <div className="col-span-2">
                        <div className="text-slate-500">Pago em</div>
                        <div className="font-semibold text-emerald-600">{fmtDate(rec.paid_at)}</div>
                      </div>
                    )}
                  </div>

                  {!isPaid && (
                    <button
                      disabled={paying === rec.id}
                      onClick={() => setMethodChooser({ recordId: rec.id })}
                      className="no-print w-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-sm py-3 rounded-lg shadow-sm active:scale-[0.98] transition disabled:opacity-60"
                    >
                      {paying === rec.id ? "⏳ A processar..." : "💳 Pagar esta parcela"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {computed.totalCharges > 0 && (
            <p className="text-[11px] text-slate-500 mt-4">* Inclui juros e multa por atraso</p>
          )}
        </div>

        {/* FOOTER */}
        <div className="text-center text-slate-400 text-[10px] px-4 md:px-10 py-6 border-t border-slate-200 leading-relaxed">
          Emmely Fernandes Advocacia Internacional<br />
          Documento gerado automaticamente em {today}<br />
          Este comprovante é atualizado em tempo real.
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escolha o método de pagamento</DialogTitle>
            <DialogDescription>
              Selecione como pretende pagar. Será redirecionado para o checkout seguro.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {methodsForCurrency(currency).map((m) => (
              <button
                key={m}
                disabled={!!paying}
                onClick={() => methodChooser && pay(methodChooser.recordId, m)}
                className="flex flex-col items-center gap-2 p-4 border-2 rounded-xl hover:bg-accent hover:border-primary transition disabled:opacity-50 active:scale-95"
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
