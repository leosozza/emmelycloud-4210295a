import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Constants, Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { User, FileText, LayoutTemplate, CreditCard, BadgeCheck } from "lucide-react";

type Proposal = Tables<"proposals">;

const paymentTypeLabels: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado",
};
const statusLabels: Record<string, string> = {
  rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", recusada: "Recusada", expirada: "Expirada",
};

const DOCUMENT_TYPES = ["NIF", "CPF", "Passaporte", "CC", "BI"] as const;
const GENDER_OPTIONS = [
  { value: "M", label: "Masculino (Sr. / Prezado)" },
  { value: "F", label: "Feminino (Sra. / Prezada)" },
  { value: "N", label: "Neutro / Empresa" },
] as const;

interface PropostaFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposta?: Proposal | null;
  cases: { id: string; title: string }[];
  onSave: (data: any) => void;
  saving?: boolean;
  preselectedCaseId?: string | null;
}

export function PropostaForm({ open, onOpenChange, proposta, cases, onSave, saving, preselectedCaseId }: PropostaFormProps) {
  // ── Campos base ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState("");
  const [value, setValue] = useState("0");
  const [paymentType, setPaymentType] = useState<string>("fixo");
  const [installments, setInstallments] = useState("1");
  const [upfrontValue, setUpfrontValue] = useState("");
  const [installmentValue, setInstallmentValue] = useState("");
  const [conditions, setConditions] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<string>("rascunho");
  const [serviceId, setServiceId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [autoPaymentEnabled, setAutoPaymentEnabled] = useState(false);
  const [autoPaymentGateway, setAutoPaymentGateway] = useState("stripe_pt");

  // ── Campos de identificação do contratante ───────────────────────────────
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientGender, setClientGender] = useState<string>("");
  const [clientNationality, setClientNationality] = useState("");
  const [clientDocumentType, setClientDocumentType] = useState<string>("");
  const [clientDocumentNumber, setClientDocumentNumber] = useState("");
  const [clientDocumentValidity, setClientDocumentValidity] = useState("");
  const [clientDocumentIssuer, setClientDocumentIssuer] = useState("");
  // Campo legado mantido para retrocompatibilidade
  const [clientDocument, setClientDocument] = useState("");

  const { data: services = [] } = useQuery({
    queryKey: ["services-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, value, budget_details").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["proposal-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: caseLeadData } = useQuery({
    queryKey: ["case-lead", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data: caseData } = await supabase.from("cases").select("lead_id").eq("id", caseId).single();
      if (!caseData?.lead_id) return null;
      const { data: lead } = await supabase.from("leads").select("name, email, phone").eq("id", caseData.lead_id).single();
      return lead;
    },
  });

  useEffect(() => {
    if (open) {
      const p = proposta as any;
      setTitle(p?.title || "");
      setCaseId(p?.case_id || preselectedCaseId || "");
      setValue(p?.value?.toString() || "0");
      setPaymentType(p?.payment_type || "fixo");
      setInstallments(p?.installments?.toString() || "1");
      setUpfrontValue(p?.upfront_value?.toString() || "");
      setInstallmentValue(p?.installment_value?.toString() || "");
      setConditions(p?.conditions || "");
      setValidUntil(p?.valid_until?.slice(0, 10) || "");
      setStatus(p?.status || "rascunho");
      setClientName(p?.client_name || "");
      setClientEmail(p?.client_email || "");
      setClientPhone(p?.client_phone || "");
      setClientAddress(p?.client_address || "");
      setClientDocument(p?.client_document || "");
      setClientGender(p?.client_gender || "");
      setClientNationality(p?.client_nationality || "");
      setClientDocumentType(p?.client_document_type || "");
      setClientDocumentNumber(p?.client_document_number || "");
      setClientDocumentValidity(p?.client_document_validity?.slice(0, 10) || "");
      setClientDocumentIssuer(p?.client_document_issuer || "");
      setServiceId(p?.service_id || "");
      setDescription(p?.description || "");
      const apc = p?.auto_payment_config;
      if (apc && apc.enabled) {
        setAutoPaymentEnabled(true);
        setAutoPaymentGateway(apc.gateway || "stripe_pt");
      } else {
        setAutoPaymentEnabled(false);
        setAutoPaymentGateway("stripe_pt");
      }
    }
  }, [proposta, open, preselectedCaseId]);

  const handleLoadFromLead = () => {
    if (caseLeadData) {
      setClientName(caseLeadData.name || "");
      setClientEmail(caseLeadData.email || "");
      setClientPhone(caseLeadData.phone || "");
    }
  };

  const handleServiceChange = (id: string) => {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) {
      setValue(svc.value?.toString() || "0");
      if (svc.budget_details) setDescription(svc.budget_details);
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const t = templates.find((tpl: any) => tpl.id === templateId);
    if (!t) return;
    if ((t as any).title) setTitle((t as any).title);
    if ((t as any).description) setDescription((t as any).description);
    if ((t as any).conditions) setConditions((t as any).conditions);
    setValue(((t as any).value ?? 0).toString());
    setPaymentType((t as any).payment_type || "fixo");
    setInstallments(((t as any).installments ?? 1).toString());
    if ((t as any).service_id) setServiceId((t as any).service_id);
  };

  // Derivar o tratamento formal a partir do género
  const formalTreatment = clientGender === "M" ? "Prezado" : clientGender === "F" ? "Prezada" : "Prezado(a)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proposta ? "Editar Proposta" : "Nova Proposta"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              title,
              case_id: caseId,
              value: parseFloat(value) || 0,
              payment_type: paymentType as any,
              installments: parseInt(installments) || 1,
              upfront_value: upfrontValue ? parseFloat(upfrontValue) : null,
              installment_value: installmentValue ? parseFloat(installmentValue) : null,
              conditions: conditions || null,
              valid_until: validUntil || null,
              status: status as any,
              client_name: clientName || null,
              client_email: clientEmail || null,
              client_phone: clientPhone || null,
              client_address: clientAddress || null,
              client_document: clientDocument || null,
              client_gender: clientGender || null,
              client_nationality: clientNationality || null,
              client_document_type: clientDocumentType || null,
              client_document_number: clientDocumentNumber || null,
              client_document_validity: clientDocumentValidity || null,
              client_document_issuer: clientDocumentIssuer || null,
              service_id: serviceId || null,
              description: description || null,
              auto_payment_config: autoPaymentEnabled ? { enabled: true, gateway: autoPaymentGateway } : null,
            });
          }}
          className="space-y-5"
        >
          {/* Template loader */}
          {!proposta && templates.length > 0 && (
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium text-primary">Carregar Modelo</Label>
              </div>
              <Select onValueChange={handleLoadTemplate}>
                <SelectTrigger><SelectValue placeholder="Selecionar modelo para preencher..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.value > 0 ? `— €${Number(t.value).toFixed(2)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dados básicos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Título *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label>Caso Associado *</Label>
              <Select value={caseId} onValueChange={setCaseId}>
                <SelectTrigger><SelectValue placeholder="Selecionar caso" /></SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Serviço</Label>
              <Select value={serviceId} onValueChange={handleServiceChange}>
                <SelectTrigger><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2"><FileText className="h-3 w-3" />{s.name} — €{s.value}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dados do contratante */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" /> Dados do Contratante
              </h4>
              {caseLeadData && (
                <Button type="button" variant="outline" size="sm" onClick={handleLoadFromLead}>
                  Preencher do Lead
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome Completo</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <Label>Género / Tratamento</Label>
                <Select value={clientGender} onValueChange={setClientGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar género" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clientGender && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Tratamento: <span className="font-medium">{formalTreatment}</span>
                  </p>
                )}
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+351..." />
              </div>
              <div>
                <Label>Nacionalidade</Label>
                <Input value={clientNationality} onChange={(e) => setClientNationality(e.target.value)} placeholder="ex: Brasileira, Portuguesa" />
              </div>
              <div className="col-span-2">
                <Label>Morada / Endereço</Label>
                <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Morada completa" />
              </div>
            </div>
          </div>

          {/* Documento de identificação */}
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" /> Documento de Identificação
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Documento</Label>
                <Select value={clientDocumentType} onValueChange={setClientDocumentType}>
                  <SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Número do Documento</Label>
                <Input value={clientDocumentNumber} onChange={(e) => setClientDocumentNumber(e.target.value)} placeholder="ex: 123456789" />
              </div>
              <div>
                <Label>Validade</Label>
                <Input
                  type="date"
                  value={clientDocumentValidity}
                  onChange={(e) => setClientDocumentValidity(e.target.value)}
                />
                {clientDocumentValidity && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    No contrato: {new Date(clientDocumentValidity + "T12:00:00").toLocaleDateString("pt-PT")}
                  </p>
                )}
              </div>
              <div>
                <Label>Órgão Emissor</Label>
                <Input value={clientDocumentIssuer} onChange={(e) => setClientDocumentIssuer(e.target.value)} placeholder="ex: SEF, AIMA, IRN, Polícia Federal" />
              </div>
            </div>
          </div>

          {/* Descrição do serviço */}
          <Separator />
          <div>
            <Label>Descrição do Serviço</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Detalhes do serviço incluído na proposta..." />
          </div>

          {/* Pagamento */}
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Honorários e Pagamento
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor Total (€)</Label>
                <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
              <div>
                <Label>Tipo de Pagamento</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.payment_type.map((t) => (
                      <SelectItem key={t} value={t}>{paymentTypeLabels[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nº de Parcelas</Label>
                <Input type="number" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
              </div>
              <div>
                <Label>Validade da Proposta</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              {paymentType === "parcelado" && (
                <>
                  <div>
                    <Label>Entrada (na assinatura) €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={upfrontValue}
                      onChange={(e) => setUpfrontValue(e.target.value)}
                      placeholder="ex: 500.00"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Valor pago na data de assinatura do contrato</p>
                  </div>
                  <div>
                    <Label>Valor de Cada Parcela €</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={installmentValue}
                      onChange={(e) => setInstallmentValue(e.target.value)}
                      placeholder="ex: 250.00"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Valor das parcelas mensais subsequentes</p>
                  </div>
                </>
              )}
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.proposal_status.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Pagamento automático */}
          <Separator />
          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Pagamento Automático</Label>
              </div>
              <Switch checked={autoPaymentEnabled} onCheckedChange={setAutoPaymentEnabled} />
            </div>
            {autoPaymentEnabled && (
              <div>
                <Label className="text-xs">Gateway</Label>
                <Select value={autoPaymentGateway} onValueChange={setAutoPaymentGateway}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe_pt">Stripe Portugal</SelectItem>
                    <SelectItem value="stripe_br">Stripe Brasil</SelectItem>
                    <SelectItem value="stripe">Stripe Global</SelectItem>
                    <SelectItem value="asaas">Asaas (Brasil)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">Ao aceitar a proposta, o cliente será redirigido automaticamente para o pagamento.</p>
              </div>
            )}
          </div>

          <div>
            <Label>Condições</Label>
            <Textarea value={conditions} onChange={(e) => setConditions(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !caseId}>{saving ? "A guardar..." : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
