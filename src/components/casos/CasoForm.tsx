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

type Case = Tables<"cases">;

const legalAreaLabels: Record<string, string> = {
  previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
  trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
  tributario: "Tributário", outro: "Outro",
};
const statusLabels: Record<string, string> = {
  aberto: "Aberto", em_andamento: "Em Andamento", pendente_docs: "Pendente Docs",
  concluido: "Concluído", arquivado: "Arquivado",
};

interface CasoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caso?: Case | null;
  leads: { id: string; name: string }[];
  profiles: { id: string; full_name: string }[];
  onSave: (data: TablesInsert<"cases">) => void;
  saving?: boolean;
}

export function CasoForm({ open, onOpenChange, caso, leads, profiles, onSave, saving }: CasoFormProps) {
  const [title, setTitle] = useState(caso?.title || "");
  const [description, setDescription] = useState(caso?.description || "");
  const [legalArea, setLegalArea] = useState<string>(caso?.legal_area || "outro");
  const [status, setStatus] = useState<string>(caso?.status || "aberto");
  const [leadId, setLeadId] = useState(caso?.lead_id || "");
  const [attorneyId, setAttorneyId] = useState(caso?.assigned_attorney_id || "");
  const [viability, setViability] = useState(caso?.viability || "pendente");
  const [internalNotes, setInternalNotes] = useState(caso?.internal_notes || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{caso ? "Editar Caso" : "Novo Caso"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              title,
              description: description || null,
              legal_area: legalArea as any,
              status: status as any,
              lead_id: leadId || null,
              assigned_attorney_id: attorneyId || null,
              viability: viability || null,
              internal_notes: internalNotes || null,
            });
          }}
          className="space-y-4"
        >
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Área Jurídica</Label>
              <Select value={legalArea} onValueChange={setLegalArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.legal_area.map((a) => (
                    <SelectItem key={a} value={a}>{legalAreaLabels[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.case_status.map((s) => (
                    <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lead Associado</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Advogado</Label>
              <Select value={attorneyId} onValueChange={setAttorneyId}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Viabilidade</Label>
            <Input value={viability} onChange={(e) => setViability(e.target.value)} />
          </div>
          <div>
            <Label>Notas Internas</Label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
