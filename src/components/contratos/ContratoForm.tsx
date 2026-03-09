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
import { Tables, TablesInsert } from "@/integrations/supabase/types";

type Contract = Tables<"contracts">;

interface ContratoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato?: Contract | null;
  proposals: { id: string; title: string }[];
  cases: { id: string; title: string }[];
  onSave: (data: TablesInsert<"contracts">) => void;
  saving?: boolean;
}

export function ContratoForm({ open, onOpenChange, contrato, proposals, cases, onSave, saving }: ContratoFormProps) {
  const [proposalId, setProposalId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");

  useEffect(() => {
    if (open) {
      setProposalId(contrato?.proposal_id || "");
      setCaseId(contrato?.case_id || "");
      setStartsAt(contrato?.starts_at?.slice(0, 10) || "");
      setExpiresAt(contrato?.expires_at?.slice(0, 10) || "");
      setNotes(contrato?.notes || "");
      setFileUrl(contrato?.file_url || "");
      setSignerName((contrato as any)?.signer_name || "");
      setSignerEmail((contrato as any)?.signer_email || "");
      setSignerPhone((contrato as any)?.signer_phone || "");
    }
  }, [contrato, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contrato ? "Editar Contrato" : "Novo Contrato"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              proposal_id: proposalId,
              case_id: caseId === "none" ? null : caseId || null,
              starts_at: startsAt || null,
              expires_at: expiresAt || null,
              notes: notes || null,
              file_url: fileUrl || null,
              signer_name: signerName || null,
              signer_email: signerEmail || null,
              signer_phone: signerPhone || null,
            } as any);
          }}
          className="space-y-4"
        >
          <div>
            <Label>Proposta *</Label>
            <Select value={proposalId} onValueChange={setProposalId}>
              <SelectTrigger><SelectValue placeholder="Selecionar proposta" /></SelectTrigger>
              <SelectContent>
                {proposals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Caso</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger><SelectValue placeholder="Selecionar caso" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data Início</Label>
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label>Data Expiração</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>URL Ficheiro</Label>
            <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="border-t pt-4 mt-2">
            <p className="text-sm font-medium mb-3">Dados do Signatário (para assinatura digital)</p>
            <div className="space-y-3">
              <div><Label>Nome do Signatário</Label><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Nome completo" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} /></div>
                <div><Label>Telefone</Label><Input value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)} /></div>
              </div>
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !proposalId}>{saving ? "A guardar..." : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
