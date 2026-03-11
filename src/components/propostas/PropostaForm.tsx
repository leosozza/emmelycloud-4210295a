import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { User, FileText, LayoutTemplate } from "lucide-react";

type Proposal = Tables<"proposals">;

const paymentTypeLabels: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado",
};
const statusLabels: Record<string, string> = {
  rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", recusada: "Recusada", expirada: "Expirada",
};

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
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState("");
  const [value, setValue] = useState("0");
  const [paymentType, setPaymentType] = useState<string>("fixo");
  const [installments, setInstallments] = useState("1");
  const [conditions, setConditions] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<string>("rascunho");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [serviceId, setServiceId] = useState<string>("");
  const [description, setDescription] = useState("");

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
      setTitle(proposta?.title || "");
      setCaseId(proposta?.case_id || preselectedCaseId || "");
      setValue(proposta?.value?.toString() || "0");
      setPaymentType(proposta?.payment_type || "fixo");
      setInstallments(proposta?.installments?.toString() || "1");
      setConditions(proposta?.conditions || "");
      setValidUntil(proposta?.valid_until?.slice(0, 10) || "");
      setStatus(proposta?.status || "rascunho");
      setClientName((proposta as any)?.client_name || "");
      setClientEmail((proposta as any)?.client_email || "");
      setClientPhone((proposta as any)?.client_phone || "");
      setClientDocument((proposta as any)?.client_document || "");
      setClientAddress((proposta as any)?.client_address || "");
      setServiceId((proposta as any)?.service_id || "");
      setDescription((proposta as any)?.description || "");
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
              conditions: conditions || null,
              valid_until: validUntil || null,
              status: status as any,
              client_name: clientName || null,
              client_email: clientEmail || null,
              client_phone: clientPhone || null,
              client_document: clientDocument || null,
              client_address: clientAddress || null,
              service_id: serviceId || null,
              description: description || null,
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

          {/* Basic */}
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

          {/* Client data */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Dados do Cliente</h4>
              {caseLeadData && (
                <Button type="button" variant="outline" size="sm" onClick={handleLoadFromLead}>
                  Preencher do Lead
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nome completo" />
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
                <Label>NIF / CC</Label>
                <Input value={clientDocument} onChange={(e) => setClientDocument(e.target.value)} placeholder="Documento" />
              </div>
              <div className="col-span-2">
                <Label>Morada</Label>
                <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Morada completa" />
              </div>
            </div>
          </div>

          {/* Service description */}
          <Separator />
          <div>
            <Label>Descrição do Serviço</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Detalhes do serviço incluído na proposta..." />
          </div>

          {/* Payment */}
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor (€)</Label>
              <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div>
              <Label>Tipo Pagamento</Label>
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
              <Label>Parcelas</Label>
              <Input type="number" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
            </div>
            <div>
              <Label>Validade</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
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
