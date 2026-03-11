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
import { Constants } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";

const paymentTypeLabels: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado",
};

interface TemplateData {
  id?: string;
  name: string;
  title?: string;
  description?: string;
  conditions?: string;
  value: number;
  payment_type: string;
  installments: number;
  service_id?: string | null;
  is_default?: boolean;
}

interface PropostaTemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateData | null;
  onSave: (data: Omit<TemplateData, "id">) => void;
  saving?: boolean;
}

export function PropostaTemplateForm({ open, onOpenChange, template, onSave, saving }: PropostaTemplateFormProps) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState("");
  const [value, setValue] = useState("0");
  const [paymentType, setPaymentType] = useState("fixo");
  const [installments, setInstallments] = useState("1");
  const [serviceId, setServiceId] = useState("");

  const { data: services = [] } = useQuery({
    queryKey: ["services-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, value, budget_details").order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (open) {
      setName(template?.name || "");
      setTitle(template?.title || "");
      setDescription(template?.description || "");
      setConditions(template?.conditions || "");
      setValue(template?.value?.toString() || "0");
      setPaymentType(template?.payment_type || "fixo");
      setInstallments(template?.installments?.toString() || "1");
      setServiceId(template?.service_id || "");
    }
  }, [template, open]);

  const handleServiceChange = (id: string) => {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) {
      setValue(svc.value?.toString() || "0");
      if (svc.budget_details) setDescription(svc.budget_details);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Editar Modelo" : "Novo Modelo"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              name,
              title: title || null,
              description: description || null,
              conditions: conditions || null,
              value: parseFloat(value) || 0,
              payment_type: paymentType,
              installments: parseInt(installments) || 1,
              service_id: serviceId || null,
            });
          }}
          className="space-y-4"
        >
          <div>
            <Label>Nome do Modelo *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Modelo Padrão Trabalhista" />
          </div>
          <div>
            <Label>Título da Proposta</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título padrão ao usar este modelo" />
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
          <div>
            <Label>Descrição do Serviço</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Detalhes padrão do serviço..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div>
            <Label>Condições</Label>
            <Textarea value={conditions} onChange={(e) => setConditions(e.target.value)} rows={3} placeholder="Condições padrão..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name}>{saving ? "A guardar..." : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
