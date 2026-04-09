import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Loader2, FileWarning, FileText,
  PenLine, ArrowRight, Clock, Shield, User, Phone, Mail, MapPin,
} from "lucide-react";

const paymentTypeLabels: Record<string, string> = {
  fixo: "Pagamento Único", exito: "Honorários de Êxito",
  hibrido: "Híbrido (Fixo + Êxito)", parcelado: "Parcelado",
};

const currencySymbols: Record<string, string> = {
  EUR: "€", BRL: "R$", USD: "$", GBP: "£", CHF: "CHF", CAD: "C$",
};

interface AcceptResult {
  sign_token?: string;
  sign_url?: string;
  already_accepted?: boolean;
}

export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptResult, setAcceptResult] = useState<AcceptResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    supabase
      .from("proposals")
      .select("*")
      .eq("accept_token", token)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) setError("Proposta não encontrada.");
        else {
          setProposal(data);
          // If already accepted, show the sign link if available
          if (data.status === "aceita") {
            setAccepted(true);
            if (data.sign_token) {
              const frontendUrl = window.location.origin;
              setAcceptResult({ sign_url: `${frontendUrl}/sign/${data.sign_token}` });
            }
          }
        }
        setLoading(false);
      });
  }, [token]);

  const handleAccept = async () => {
    if (!proposal || !confirmed) return;
    setAccepting(true);
    setError("");
    try {
      const res = await supabase.functions.invoke("proposal-accept", {
        body: { accept_token: token },
      });
      if (res.error) throw new Error(res.error.message || "Erro ao aceitar proposta");
      const data = res.data as any;
      if (data?.error) throw new Error(data.error);

      // Build sign URL from the returned sign_token or from the proposal
      const signToken = data.sign_token || proposal.sign_token;
      const frontendUrl = window.location.origin;
      const signUrl = signToken ? `${frontendUrl}/sign/${signToken}` : null;

      setAcceptResult({ sign_url: signUrl || undefined, already_accepted: data.already_accepted });
      setAccepted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccepting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-sm text-slate-500">A carregar proposta…</p>
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (error && !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="p-10 text-center max-w-md shadow-lg">
          <FileWarning className="h-14 w-14 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Proposta não encontrada</h2>
          <p className="text-muted-foreground text-sm">O link pode estar expirado ou inválido. Entre em contacto para obter um novo link.</p>
        </Card>
      </div>
    );
  }

  const p = proposal;
  const isExpired = p.valid_until && new Date(p.valid_until) < new Date() && p.status !== "aceita";
  const curr = currencySymbols[p.currency || "EUR"] || "€";
  const products = Array.isArray(p.products_json) && p.products_json.length > 0 ? p.products_json : null;
  const hasSignUrl = acceptResult?.sign_url;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-2xl p-8 text-center shadow-xl">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Shield className="h-6 w-6 text-slate-300" />
            <h1 className="text-2xl font-bold tracking-wide">EMMELY FERNANDES</h1>
          </div>
          <p className="text-sm tracking-[0.3em] text-slate-300 uppercase">Advocacia Internacional</p>
          <Separator className="my-5 bg-white/20" />
          <p className="text-slate-400 text-xs italic">
            Mais do que processos, cuidamos de pessoas e dos seus direitos.
          </p>
        </div>

        {/* ── Proposal Card ── */}
        <Card className="p-8 space-y-6 shadow-md">
          <div className="text-center space-y-2">
            <Badge variant="outline" className="text-xs uppercase tracking-wide">
              {p.status === "aceita" ? "Aceita" : p.status === "enviada" ? "Aguardando Aceite" : p.status}
            </Badge>
            <h2 className="text-2xl font-bold text-foreground">{p.title}</h2>
            {p.valid_until && !isExpired && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Válida até {new Date(p.valid_until).toLocaleDateString("pt-PT")}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Client data */}
          {p.client_name && (
            <div className="space-y-3">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Dados do Cliente
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{p.client_name}</span>
                </div>
                {p.client_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{p.client_email}</span>
                  </div>
                )}
                {p.client_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{p.client_phone}</span>
                  </div>
                )}
                {p.client_document && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{p.client_document}</span>
                  </div>
                )}
                {p.client_address && (
                  <div className="flex items-center gap-2 col-span-full">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{p.client_address}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {p.description && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">O Processo Inclui</h3>
                <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/80">{p.description}</div>
              </div>
            </>
          )}

          {/* Products table */}
          {products && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Produtos / Serviços</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Qtd</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Preço</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((prod: any, idx: number) => (
                        <tr key={idx} className="border-t">
                          <td className="px-4 py-3">
                            <div className="font-medium">{prod.name}</div>
                            {prod.description && <div className="text-xs text-muted-foreground mt-0.5">{prod.description}</div>}
                          </td>
                          <td className="px-4 py-3 text-center">{prod.quantity || 1}</td>
                          <td className="px-4 py-3 text-right">{curr} {Number(prod.price || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right font-semibold">{curr} {Number(prod.total || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Pricing */}
          <Separator />
          <div className="space-y-3">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Orçamento</h3>
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6 text-center border">
              <p className="text-4xl font-bold text-foreground">
                {curr} {Number(p.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {paymentTypeLabels[p.payment_type] || p.payment_type}
                {p.installments > 1
                  ? ` — ${p.installments}x de ${curr} ${(p.value / p.installments).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`
                  : ""}
              </p>
            </div>
          </div>

          {/* Conditions */}
          {p.conditions && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Condições Gerais</h3>
                <p className="text-sm whitespace-pre-wrap text-foreground/80 leading-relaxed">{p.conditions}</p>
              </div>
            </>
          )}
        </Card>

        {/* ── Accept / Status Section ── */}
        {accepted ? (
          <div className="space-y-4">
            {/* Success card */}
            <Card className="p-8 text-center bg-green-50 border-green-200 shadow-md">
              <CheckCircle2 className="h-14 w-14 mx-auto text-green-600 mb-4" />
              <h3 className="text-xl font-bold text-green-800 mb-2">
                {acceptResult?.already_accepted ? "Proposta Já Aceita" : "Proposta Aceita com Sucesso!"}
              </h3>
              <p className="text-green-700 text-sm leading-relaxed">
                {acceptResult?.already_accepted
                  ? "Esta proposta já foi aceita anteriormente."
                  : "O seu aceite foi registado com prova digital. O próximo passo é assinar o contrato."}
              </p>
            </Card>

            {/* Sign contract CTA — shown immediately after accept */}
            {hasSignUrl && (
              <Card className="p-6 border-blue-200 bg-blue-50 shadow-md">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-shrink-0 bg-blue-100 rounded-full p-3">
                    <PenLine className="h-7 w-7 text-blue-700" />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="font-bold text-blue-900 text-lg">Assine o Contrato Agora</h4>
                    <p className="text-blue-700 text-sm mt-1">
                      O contrato foi gerado automaticamente. Assine digitalmente para confirmar o início dos serviços.
                    </p>
                  </div>
                  <a
                    href={acceptResult!.sign_url}
                    className="shrink-0 inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-3 rounded-xl shadow transition-colors"
                  >
                    Assinar Contrato
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </Card>
            )}

            {/* If no sign URL yet, show instructions */}
            {!hasSignUrl && (
              <Card className="p-6 border-slate-200 bg-slate-50">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-600">
                    O contrato será enviado para o seu WhatsApp / email em breve. Aguarde o contacto da nossa equipa.
                  </p>
                </div>
              </Card>
            )}
          </div>

        ) : isExpired ? (
          <Card className="p-8 text-center bg-amber-50 border-amber-200 shadow-md">
            <FileWarning className="h-14 w-14 mx-auto text-amber-600 mb-4" />
            <h3 className="text-xl font-bold text-amber-800 mb-2">Proposta Expirada</h3>
            <p className="text-amber-700 text-sm">
              Esta proposta expirou em {new Date(p.valid_until).toLocaleDateString("pt-PT")}. Entre em contacto para solicitar uma nova proposta.
            </p>
          </Card>

        ) : p.status === "recusada" ? (
          <Card className="p-8 text-center bg-red-50 border-red-200 shadow-md">
            <FileWarning className="h-14 w-14 mx-auto text-red-500 mb-4" />
            <h3 className="text-xl font-bold text-red-800">Proposta Recusada</h3>
            <p className="text-red-600 text-sm mt-2">Esta proposta foi recusada. Entre em contacto para mais informações.</p>
          </Card>

        ) : (
          <Card className="p-8 space-y-5 shadow-md">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold">Aceitar Proposta</h3>
              <p className="text-sm text-muted-foreground">Ao aceitar, o contrato será gerado automaticamente.</p>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3 text-center">
                {error}
              </div>
            )}

            <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-4 border">
              <Checkbox
                id="confirm-accept"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                className="mt-0.5"
              />
              <label htmlFor="confirm-accept" className="text-sm text-foreground/80 cursor-pointer leading-relaxed">
                Li e compreendo os termos e condições apresentados nesta proposta, incluindo o valor, forma de pagamento e condições gerais, e desejo aceitá-la formalmente.
              </label>
            </div>

            <Button
              size="lg"
              className="w-full bg-green-600 hover:bg-green-700 text-white py-6 text-base rounded-xl shadow-lg disabled:opacity-50 transition-all"
              onClick={handleAccept}
              disabled={accepting || !confirmed}
            >
              {accepting
                ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> A processar…</>
                : <><CheckCircle2 className="h-5 w-5 mr-2" /> Aceitar Proposta</>
              }
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>O seu IP, data e hora serão registados como prova legal de aceite digital.</span>
            </div>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-6 space-y-1">
          <p className="font-medium">Emmely Fernandes — Advocacia Internacional</p>
          <p>Powered by Emmely Cloud</p>
        </div>
      </div>
    </div>
  );
}
