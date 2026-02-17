import { useState } from "react";
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
import { Constants, Tables, TablesInsert } from "@/integrations/supabase/types";

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
  onSave: (data: TablesInsert<"proposals">) => void;
  saving?: boolean;
}

export function PropostaForm({ open, onOpenChange, proposta, cases, onSave, saving }: PropostaFormProps) {
  const [title, setTitle] = useState(proposta?.title || "");
  const [caseId, setCaseId] = useState(proposta?.case_id || "");
  const [value, setValue] = useState(proposta?.value?.toString() || "0");
  const [paymentType, setPaymentType] = useState<string>(proposta?.payment_type || "fixo");
  const [installments, setInstallments] = useState(proposta?.installments?.toString() || "1");
  const [conditions, setConditions] = useState(proposta?.conditions || "");
  const [validUntil, setValidUntil] = useState(proposta?.valid_until?.slice(0, 10) || "");
  const [status, setStatus] = useState<string>(proposta?.status || "rascunho");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
            });
          }}
          className="space-y-4"
        >
          <div>
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
