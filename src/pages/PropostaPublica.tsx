import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Loader2, FileWarning } from "lucide-react";

const paymentTypeLabels: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado",
};

const currencySymbols: Record<string, string> = {
  EUR: "€", BRL: "R$", USD: "$", GBP: "£", CHF: "CHF", CAD: "C$",
};

export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
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
          if (data.status === "aceita") setAccepted(true);
        }
        setLoading(false);
      });
  }, [token]);

  const handleAccept = async () => {
    if (!proposal || !confirmed) return;
    setAccepting(true);
    try {
      const res = await supabase.functions.invoke("proposal-accept", {
        body: { accept_token: token },
      });
      if (res.error) throw new Error(res.error.message || "Erro ao aceitar proposta");
      const data = res.data as any;
      if (data?.error) throw new Error(data.error);
      setAccepted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 text-center max-w-md">
          <FileWarning className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Proposta não encontrada</h2>
          <p className="text-muted-foreground">O link pode estar expirado ou inválido.</p>
        </Card>
      </div>
    );
  }

  const p = proposal;
  const isExpired = p.valid_until && new Date(p.valid_until) < new Date() && p.status !== "aceita";
  const curr = currencySymbols[p.currency || "EUR"] || "€";
  const products = Array.isArray(p.products_json) && p.products_json.length > 0 ? p.products_json : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-2xl p-8 text-center">
          <h1 className="text-2xl font-bold tracking-wide mb-1">EMMELY FERNANDES</h1>
          <p className="text-sm tracking-[0.3em] text-slate-300 uppercase">Advocacia Internacional</p>
          <Separator className="my-6 bg-white/20" />
          <p className="text-slate-300 text-sm italic">
            Mais do que processos, cuidamos de pessoas e dos seus direitos.
          </p>
        </div>

        {/* Proposal Content */}
        <Card className="p-8 space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">{p.title}</h2>
            {p.valid_until && (
              <p className="text-sm text-muted-foreground mt-1">
                Válida até {new Date(p.valid_until).toLocaleDateString("pt-PT")}
              </p>
            )}
          </div>

          <Separator />

          {/* Client data */}
          {p.client_name && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Dados do Cliente</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> {p.client_name}</div>
                {p.client_email && <div><span className="text-muted-foreground">Email:</span> {p.client_email}</div>}
                {p.client_phone && <div><span className="text-muted-foreground">Telefone:</span> {p.client_phone}</div>}
                {p.client_document && <div><span className="text-muted-foreground">Documento:</span> {p.client_document}</div>}
                {p.client_address && <div className="col-span-2"><span className="text-muted-foreground">Morada:</span> {p.client_address}</div>}
              </div>
            </div>
          )}

          {/* Description */}
          {p.description && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">O Processo Inclui</h3>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{p.description}</div>
              </div>
            </>
          )}

          {/* Products table */}
          {products && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Produtos / Serviços</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Produto</th>
                        <th className="text-center py-2 font-medium text-muted-foreground">Qtd</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Preço</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((prod: any, idx: number) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="py-2">
                            <div className="font-medium">{prod.name}</div>
                            {prod.description && <div className="text-xs text-muted-foreground mt-0.5">{prod.description}</div>}
                          </td>
                          <td className="py-2 text-center">{prod.quantity || 1}</td>
                          <td className="py-2 text-right">{curr} {Number(prod.price || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 text-right font-medium">{curr} {Number(prod.total || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
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
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Orçamento</h3>
            <div className="bg-slate-50 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-foreground">
                {curr} {Number(p.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {paymentTypeLabels[p.payment_type]}
                {p.installments > 1 ? ` — ${p.installments}x de ${curr} ${(p.value / p.installments).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}` : ""}
              </p>
            </div>
          </div>

          {/* Conditions */}
          {p.conditions && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Condições</h3>
                <p className="text-sm whitespace-pre-wrap">{p.conditions}</p>
              </div>
            </>
          )}
        </Card>

        {/* Accept section */}
        {accepted ? (
          <Card className="p-8 text-center bg-green-50 border-green-200">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-4" />
            <h3 className="text-xl font-bold text-green-800 mb-2">Proposta Aceita!</h3>
            <p className="text-green-700 text-sm">
              O seu contrato foi gerado automaticamente. Entraremos em contacto brevemente com os próximos passos.
            </p>
          </Card>
        ) : isExpired ? (
          <Card className="p-8 text-center bg-amber-50 border-amber-200">
            <FileWarning className="h-12 w-12 mx-auto text-amber-600 mb-4" />
            <h3 className="text-xl font-bold text-amber-800 mb-2">Proposta Expirada</h3>
            <p className="text-amber-700 text-sm">
              Esta proposta expirou. Entre em contacto para solicitar uma nova proposta.
            </p>
          </Card>
        ) : p.status === "recusada" ? (
          <Card className="p-8 text-center bg-red-50 border-red-200">
            <FileWarning className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-xl font-bold text-red-800">Proposta Recusada</h3>
          </Card>
        ) : (
          <div className="text-center space-y-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex items-start gap-3 justify-center text-left max-w-md mx-auto">
              <Checkbox
                id="confirm-accept"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                className="mt-0.5"
              />
              <label htmlFor="confirm-accept" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
                Li e compreendo os termos e condições apresentados nesta proposta e desejo aceitá-la.
              </label>
            </div>
            <Button
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white px-12 py-6 text-lg rounded-xl shadow-lg disabled:opacity-50"
              onClick={handleAccept}
              disabled={accepting || !confirmed}
            >
              {accepting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              Aceitar Proposta
            </Button>
            <p className="text-xs text-muted-foreground">
              Ao aceitar, o seu IP e dados do dispositivo serão registados como prova de aceite digital.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-4">
          <p>Emmely Fernandes — Advocacia Internacional</p>
        </div>
      </div>
    </div>
  );
}
