import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignatureCanvas } from "@/components/contratos/SignatureCanvas";
import { SelfieCapture } from "@/components/contratos/SelfieCapture";
import { FileSignature, Pen, Camera, Shield, CheckCircle2, Loader2, ExternalLink, Download, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { BlockRenderer, ProposalData } from "@/lib/templates/BlockRenderer";
import { LayoutBlock } from "@/components/propostas/TemplateBlockPalette";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ContractData {
  contract: {
    id: string; status: string; starts_at: string | null; expires_at: string | null;
    signer_name: string | null; signer_email: string | null; signer_phone: string | null; file_url: string | null;
    proposal_id: string;
  };
  proposal: { id: string; title: string; value: number; description: string | null; template_id?: string | null; [key: string]: any } | null;
  signature: { id: string; signature_method: string; signed_at: string; evidence_hash: string } | null;
}

const SignContract = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ContractData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("draw");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [signerDocument, setSignerDocument] = useState("");
  const [ipAccepted, setIpAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [result, setResult] = useState<{ evidence_hash: string; signed_at: string; ip_address: string } | null>(null);

  // Contract document preview state
  const [template, setTemplate] = useState<any>(null);
  const [layoutBlocks, setLayoutBlocks] = useState<LayoutBlock[] | null>(null);
  const [showDocument, setShowDocument] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${SUPABASE_URL}/functions/v1/sign-contract?token=${token}`)
      .then(r => r.json())
      .then(async (d) => {
        if (d.error) { setError(d.error); } else {
          setData(d);
          setSignerName(d.contract.signer_name || "");
          setSignerEmail(d.contract.signer_email || "");
          setSignerPhone(d.contract.signer_phone || "");

          // Load template for contract preview
          if (d.proposal?.template_id) {
            const { data: tpl } = await supabase
              .from("proposal_templates")
              .select("*")
              .eq("id", d.proposal.template_id)
              .single();
            if (tpl) {
              setTemplate(tpl);
              if (tpl.layout_blocks && Array.isArray(tpl.layout_blocks) && tpl.layout_blocks.length > 0) {
                setLayoutBlocks(tpl.layout_blocks as unknown as LayoutBlock[]);
              }
            }
          }
        }
      })
      .catch(() => setError("Erro ao carregar contrato"))
      .finally(() => setLoading(false));
  }, [token]);

  const canSign = () => {
    if (!signerName.trim()) return false;
    if (method === "draw" && !signatureData) return false;
    if (method === "selfie" && !signatureData) return false;
    if (method === "ip_accept" && !ipAccepted) return false;
    return true;
  };

  const handleSign = async () => {
    if (!canSign()) return;
    setSigning(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sign-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, method, signature_data: signatureData,
          signer_name: signerName, signer_email: signerEmail,
          signer_phone: signerPhone, signer_document: signerDocument,
        }),
      });
      const json = await res.json();
      if (json.error) { toast({ title: "Erro", description: json.error, variant: "destructive" }); }
      else { setResult(json); }
    } catch { toast({ title: "Erro de rede", variant: "destructive" }); }
    finally { setSigning(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </CardContent></Card>
    </div>
  );

  if (!data) return null;

  // Already signed
  if (data.signature || result) {
    const sig = result || data.signature!;
    const downloadCertificate = () => {
      const params = token ? `token=${token}` : `contract_id=${data.contract.id}`;
      window.open(`${SUPABASE_URL}/functions/v1/signature-certificate?${params}&format=html`, "_blank");
    };
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-2" />
            <CardTitle className="text-xl">Contrato Assinado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">A assinatura digital foi registada com sucesso.</p>
            <div className="bg-muted rounded-lg p-4 text-left space-y-2 text-xs">
              <div><strong>Hash de Evidência:</strong><br/><code className="break-all">{sig.evidence_hash}</code></div>
              <div><strong>Data/Hora:</strong> {new Date(sig.signed_at).toLocaleString("pt")}</div>
              {"ip_address" in sig && <div><strong>IP:</strong> {sig.ip_address}</div>}
              {"signature_method" in sig && <div><strong>Método:</strong> {sig.signature_method === "draw" ? "Desenho" : sig.signature_method === "selfie" ? "Selfie" : "Aceite por IP"}</div>}
            </div>
            <Button onClick={downloadCertificate} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" /> Descarregar Certificado de Prova
            </Button>
            <p className="text-xs text-muted-foreground">Guarde este hash como comprovativo da assinatura.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.contract.status !== "pendente") {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">Este contrato já não está disponível para assinatura.</p>
          <Badge className="mt-2">{data.contract.status}</Badge>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 pt-6">
          <FileSignature className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Assinatura Digital</h1>
          {data.proposal && <p className="text-muted-foreground">{data.proposal.title}</p>}
        </div>

        {/* Contract document preview */}
        {layoutBlocks && template && data.proposal ? (
          <Card className="overflow-hidden">
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowDocument(!showDocument)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documento do Contrato
                </CardTitle>
                {showDocument
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </div>
              <p className="text-xs text-muted-foreground">
                Leia o documento completo antes de assinar
              </p>
            </CardHeader>
            {showDocument && (
              <CardContent className="p-0">
                <div className="border-t">
                  <BlockRenderer
                    blocks={layoutBlocks}
                    proposal={data.proposal as ProposalData}
                    template={template}
                  />
                </div>
              </CardContent>
            )}
          </Card>
        ) : (
          /* Fallback: basic contract info */
          <Card>
            <CardHeader><CardTitle className="text-base">Detalhes do Contrato</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.proposal && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Proposta:</span><span className="font-medium">{data.proposal.title}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span className="font-medium">€{data.proposal.value?.toLocaleString("pt")}</span></div>
                  {data.proposal.description && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Descrição</p>
                      <p className="text-sm whitespace-pre-wrap text-foreground/80">{data.proposal.description}</p>
                    </div>
                  )}
                </>
              )}
              {data.contract.starts_at && <div className="flex justify-between"><span className="text-muted-foreground">Início:</span><span>{new Date(data.contract.starts_at).toLocaleDateString("pt")}</span></div>}
              {data.contract.expires_at && <div className="flex justify-between"><span className="text-muted-foreground">Expiração:</span><span>{new Date(data.contract.expires_at).toLocaleDateString("pt")}</span></div>}
              {data.contract.file_url && (
                <a href={data.contract.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary text-sm hover:underline">
                  <ExternalLink className="h-3 w-3" /> Ver documento do contrato
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Signer info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Signatário</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nome *</Label><Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Nome completo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} /></div>
              <div><Label>Telefone</Label><Input value={signerPhone} onChange={e => setSignerPhone(e.target.value)} /></div>
            </div>
            <div><Label>CPF / NIF</Label><Input value={signerDocument} onChange={e => setSignerDocument(e.target.value)} placeholder="Documento de identificação" /></div>
          </CardContent>
        </Card>

        {/* Signature method */}
        <Card>
          <CardHeader><CardTitle className="text-base">Método de Assinatura</CardTitle></CardHeader>
          <CardContent>
            <Tabs value={method} onValueChange={v => { setMethod(v); setSignatureData(null); setIpAccepted(false); }}>
              <TabsList className="w-full">
                <TabsTrigger value="draw" className="flex-1 gap-1"><Pen className="h-3 w-3" /> Desenho</TabsTrigger>
                <TabsTrigger value="selfie" className="flex-1 gap-1"><Camera className="h-3 w-3" /> Selfie</TabsTrigger>
                <TabsTrigger value="ip_accept" className="flex-1 gap-1"><Shield className="h-3 w-3" /> Aceite IP</TabsTrigger>
              </TabsList>
              <TabsContent value="draw" className="mt-4">
                <SignatureCanvas onSignatureChange={setSignatureData} />
              </TabsContent>
              <TabsContent value="selfie" className="mt-4">
                <SelfieCapture onCaptureChange={setSignatureData} />
              </TabsContent>
              <TabsContent value="ip_accept" className="mt-4">
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Ao aceitar, o seu endereço IP, dispositivo e data/hora serão registados como prova de concordância com os termos do contrato.
                  </p>
                  <div className="flex items-start gap-3">
                    <Checkbox id="ip-accept" checked={ipAccepted} onCheckedChange={v => setIpAccepted(!!v)} />
                    <label htmlFor="ip-accept" className="text-sm leading-relaxed cursor-pointer">
                      Declaro que li e concordo com todos os termos do contrato acima apresentado. Aceito que os meus dados de IP, dispositivo e data/hora sejam registados como evidência desta assinatura digital.
                    </label>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Sign button */}
        <Button className="w-full h-12 text-base" disabled={!canSign() || signing} onClick={handleSign}>
          {signing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A processar...</> : <><FileSignature className="mr-2 h-5 w-5" /> Assinar Contrato</>}
        </Button>

        <p className="text-xs text-center text-muted-foreground pb-8">
          Esta assinatura digital tem validade jurídica nos termos da legislação aplicável (MP 2.200-2/2001, Lei 14.063/2020, eIDAS).
        </p>
      </div>
    </div>
  );
};

export default SignContract;
