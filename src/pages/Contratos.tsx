import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, FileSignature, Ban, Link2, Copy, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tables, Constants } from "@/integrations/supabase/types";
import { ContratoForm } from "@/components/contratos/ContratoForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { EntityBreadcrumb } from "@/components/EntityBreadcrumb";
import { useNavigate } from "react-router-dom";

type Contract = Tables<"contracts">;

const statusLabels: Record<string, string> = {
  pendente: "Pendente", assinado: "Assinado", cancelado: "Cancelado",
};
const statusColors: Record<string, string> = {
  pendente: "bg-warning text-warning-foreground",
  assinado: "bg-success text-success-foreground",
  cancelado: "bg-destructive text-destructive-foreground",
};

const ContratosPage = () => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingContrato, setEditingContrato] = useState<Contract | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: signatures = [] } = useQuery({
    queryKey: ["digital-signatures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_signatures").select("contract_id, signature_method, signed_at");
      if (error) throw error;
      return data;
    },
  });

  const signaturesMap = Object.fromEntries(signatures.map((s: any) => [s.contract_id, s]));

  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposals").select("id, title").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("id, title").order("title");
      if (error) throw error;
      return data;
    },
  });

  const proposalsMap = Object.fromEntries(proposals.map((p) => [p.id, p.title]));
  const casesMap = Object.fromEntries(cases.map((c) => [c.id, c.title]));

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingContrato) {
        const { error } = await supabase.from("contracts").update(data).eq("id", editingContrato.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contracts").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setFormOpen(false);
      setEditingContrato(null);
      toast({ title: editingContrato ? "Contrato atualizado" : "Contrato criado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const signMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Sign the contract
      const { error } = await supabase.from("contracts").update({
        status: "assinado" as any,
        signed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;

      // 2. Find the contract to get case_id
      const contract = contracts.find((c) => c.id === id);
      if (contract?.case_id) {
        // 3. Update case status to em_andamento
        await supabase.from("cases").update({ status: "em_andamento" as any }).eq("id", contract.case_id);

        // 4. Find lead linked to the case and update to fechado
        const { data: linkedCase } = await supabase.from("cases").select("lead_id").eq("id", contract.case_id).single();
        if (linkedCase?.lead_id) {
          await supabase.from("leads").update({ funnel_stage: "fechado" as any }).eq("id", linkedCase.lead_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Contrato assinado — caso ativado e lead fechado" });
    },
  });

  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("desistencia");
  const [cancelHasRefund, setCancelHasRefund] = useState(false);
  const [cancelRefundAmount, setCancelRefundAmount] = useState(0);
  const [cancelNotes, setCancelNotes] = useState("");

  const openCancelDialog = (id: string) => {
    setCancelTargetId(id);
    setCancelReason("desistencia");
    setCancelHasRefund(false);
    setCancelRefundAmount(0);
    setCancelNotes("");
    setCancelDialogOpen(true);
  };

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason, refundAmount, notes }: { id: string; reason: string; refundAmount: number; notes: string }) => {
      const reasonLabels: Record<string, string> = {
        desistencia: "Desistência do cliente",
        incumprimento: "Incumprimento",
        acordo_mutuo: "Acordo mútuo",
        erro_admin: "Erro administrativo",
        outro: "Outro",
      };
      const fullReason = `${reasonLabels[reason] || reason}${notes ? ` — ${notes}` : ""}`;
      const { error } = await supabase.from("contracts").update({
        status: "cancelado" as any,
        cancelled_at: new Date().toISOString(),
        cancel_reason: fullReason,
        refund_amount: refundAmount,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setCancelDialogOpen(false);
      setCancelTargetId(null);
      toast({ title: "Contrato cancelado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Contrato eliminado" });
    },
  });

  const filtered = contracts.filter((c) => statusFilter === "all" || c.status === statusFilter);

  const fmtDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy") : "—";

  const copySignLink = (signToken: string) => {
    const link = `${window.location.origin}/sign/${signToken}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copiado", description: "Link de assinatura copiado para a área de transferência" });
  };

  const downloadCertificate = (contractId: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    window.open(`${supabaseUrl}/functions/v1/signature-certificate?contract_id=${contractId}&format=html`, "_blank");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Contratos" description="Gestão de contratos e assinaturas">
        <Button onClick={() => { setEditingContrato(null); setFormOpen(true); }} className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-full">
          <Plus className="mr-2 h-4 w-4" /> Novo Contrato
        </Button>
      </PageHeader>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {Constants.public.Enums.contract_status.map((s) => (
            <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proposta</TableHead>
              <TableHead>Caso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Expiração</TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead>Assinatura Digital</TableHead>
              <TableHead className="w-44">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">A carregar...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum contrato encontrado</TableCell></TableRow>
            ) : filtered.map((c: any) => {
              const sig = signaturesMap[c.id];
              return (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-sm">
                  <Button variant="link" size="sm" className="p-0 h-auto text-sm" onClick={() => navigate("/propostas")}>
                    {proposalsMap[c.proposal_id] || "—"}
                  </Button>
                </TableCell>
                <TableCell className="text-sm">
                  {c.case_id ? (
                    <Button variant="link" size="sm" className="p-0 h-auto text-sm" onClick={() => navigate("/casos")}>
                      {casesMap[c.case_id] || "—"}
                    </Button>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Badge className={`text-xs ${statusColors[c.status]}`}>{statusLabels[c.status]}</Badge>
                          {c.status === "cancelado" && (c as any).refund_amount > 0 && (
                            <Badge variant="outline" className="text-[10px] ml-1">Devolvido: €{(c as any).refund_amount}</Badge>
                          )}
                        </div>
                      </TooltipTrigger>
                      {c.status === "cancelado" && (c as any).cancel_reason && (
                        <TooltipContent>
                          <p className="text-xs">{(c as any).cancel_reason}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.starts_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.expires_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.signed_at)}</TableCell>
                <TableCell className="text-xs">
                  {sig ? (
                    <Badge variant="outline" className="text-xs">
                      {sig.signature_method === "draw" ? "✍️ Desenho" : sig.signature_method === "selfie" ? "📸 Selfie" : "🔒 IP"}
                    </Badge>
                  ) : c.status === "pendente" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {c.status === "pendente" && (
                      <>
                        {c.sign_token && (
                          <Button variant="ghost" size="icon" title="Copiar link de assinatura" onClick={() => copySignLink(c.sign_token)}>
                            <Link2 className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Assinar (interno)" onClick={() => signMutation.mutate(c.id)}>
                          <FileSignature className="h-4 w-4 text-success" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Cancelar" onClick={() => openCancelDialog(c.id)}>
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    {signaturesMap[c.id] && (
                      <Button variant="ghost" size="icon" title="Descarregar certificado" onClick={() => downloadCertificate(c.id)}>
                        <Download className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => { setEditingContrato(c); setFormOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={(o) => !o && setCancelDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar Contrato</DialogTitle>
            <DialogDescription>Indique o motivo e se houve devolução de valores.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo do cancelamento</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desistencia">Desistência do cliente</SelectItem>
                  <SelectItem value="incumprimento">Incumprimento</SelectItem>
                  <SelectItem value="acordo_mutuo">Acordo mútuo</SelectItem>
                  <SelectItem value="erro_admin">Erro administrativo</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={cancelHasRefund} onCheckedChange={setCancelHasRefund} />
              <Label className="text-sm">Houve devolução de valor?</Label>
            </div>

            {cancelHasRefund && (
              <div className="space-y-1.5">
                <Label className="text-xs">Valor devolvido (€)</Label>
                <Input type="number" step="0.01" className="h-9 text-sm" value={cancelRefundAmount} onChange={(e) => setCancelRefundAmount(parseFloat(e.target.value) || 0)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notas adicionais (opcional)</Label>
              <Textarea className="text-sm" rows={2} value={cancelNotes} onChange={(e) => setCancelNotes(e.target.value)} placeholder="Detalhes sobre o cancelamento..." />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelDialogOpen(false)} disabled={cancelMutation.isPending}>Voltar</Button>
              <Button variant="destructive" className="flex-1" disabled={cancelMutation.isPending} onClick={() => cancelTargetId && cancelMutation.mutate({ id: cancelTargetId, reason: cancelReason, refundAmount: cancelHasRefund ? cancelRefundAmount : 0, notes: cancelNotes })}>
                {cancelMutation.isPending ? "A cancelar..." : "Confirmar Cancelamento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ContratoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contrato={editingContrato}
        proposals={proposals}
        cases={cases}
        onSave={(data) => saveMutation.mutate(data)}
        saving={saveMutation.isPending}
      />
    </div>
  );
};

export default ContratosPage;
