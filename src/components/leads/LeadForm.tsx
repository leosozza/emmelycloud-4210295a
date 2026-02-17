import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Constants } from "@/integrations/supabase/types";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

const originLabels: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", email: "Email",
  landing_page: "Landing Page", outro: "Outro",
};
const legalAreaLabels: Record<string, string> = {
  previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
  trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
  tributario: "Tributário", outro: "Outro",
};

interface LeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
  onSave: (data: TablesInsert<"leads">) => void;
  saving?: boolean;
}

export function LeadForm({ open, onOpenChange, lead, onSave, saving }: LeadFormProps) {
  const [name, setName] = useState(lead?.name || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const [country, setCountry] = useState(lead?.country || "Portugal");
  const [origin, setOrigin] = useState<string>(lead?.origin || "outro");
  const [legalArea, setLegalArea] = useState<string>(lead?.legal_area || "outro");
  const [urgency, setUrgency] = useState(lead?.urgency || "normal");
  const [notes, setNotes] = useState(lead?.notes || "");

  // Reset form when lead changes
  const resetKey = lead?.id || "new";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} key={resetKey}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar Lead" : "Novo Lead"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              name,
              email: email || null,
              phone: phone || null,
              country: country || null,
              origin: origin as any,
              legal_area: legalArea as any,
              urgency,
              notes: notes || null,
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>País</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.lead_origin.map((o) => (
                    <SelectItem key={o} value={o}>{originLabels[o] || o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área Jurídica</Label>
              <Select value={legalArea} onValueChange={setLegalArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.legal_area.map((a) => (
                    <SelectItem key={a} value={a}>{legalAreaLabels[a] || a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Urgência</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "A guardar..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
