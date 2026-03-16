import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, FileSignature, Ban, Link2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { useNavigate } from "react-router-dom";

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
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch proposals with contract_status (unified table)
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts-from-proposals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("*")
        .not("contract_status", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: signatures = [] } = useQuery({
    queryKey: ["digital-signatures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_signatures").select("proposal_id, contract_id, signature_method, signed_at");
      if (error) throw error;
      return data;
    },
  });

  const signaturesMap = Object.fromEntries(
    signatures.map((s: any) => [s.proposal_id || s.contract_id, s])
  );

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("id, title").order("title");
      if (error) throw error;
      return data;
    },
  });

  const casesMap = Object.fromEntries(cases.map((c) => [c.id, c.title]));

  const signMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposals").update({
        contract_status: "assinado",
        signed_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;

      const proposal = contracts.find((c) => c.id === id);
      if (proposal?.case_id) {
        await supabase.from("cases").update({ status: "em_andamento" as any }).eq("id", proposal.case_id);
        const { data: linkedCase } = await supabase.from("cases").select("lead_id").eq("id", proposal.case_id).single();
        if (linkedCase?.lead_id) {
          await supabase.from("leads").update({ funnel_stage: "fechado" as any }).eq("id", linkedCase.lead_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts-from-proposals"] });
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
      const { error } = await supabase.from("proposals").update({
        contract_status: "cancelado",
        cancelled_at: new Date().toISOString(),
        cancel_reason: fullReason,
        refund_amount: refundAmount,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts-from-proposals"] });
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
      // Remove contract_status to "un-contract" the proposal
      const { error } = await supabase.from("proposals").update({
        contract_status: null,
        signed_at: null,
        cancelled_at: null,
        cancel_reason: null,
        refund_amount: null,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts-from-proposals"] });
      toast({ title: "Contrato removido" });
    },
  });

  const filtered = contracts.filter((c) => statusFilter === "all" || c.contract_status === statusFilter);

  const fmtDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy") : "—";

  const copySignLink = (signToken: string) => {
    const link = `${window.location.origin}/sign/${signToken}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copiado", description: "Link de assinatura copiado para a área de transferência" });
  };

  const downloadCertificate = (proposalId: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    window.open(`${supabaseUrl}/functions/v1/signature-certificate?contract_id=${proposalId}&format=html`, "_blank");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Contratos" description="Gestão de contratos e assinaturas" />

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="pendente">Pendente</SelectItem>
          <SelectItem value="assinado">Assinado</SelectItem>
          <SelectItem value="cancelado">Cancelado</SelectItem>
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
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">A carregar...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum contrato encontrado</TableCell></TableRow>
            ) : filtered.map((c: any) => {
              const sig = signaturesMap[c.id];
              return (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-sm">
                  <Button variant="link" size="sm" className="p-0 h-auto text-sm" onClick={() => navigate("/propostas")}>
                    {c.title || "—"}
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
                          <Badge className={`text-xs ${statusColors[c.contract_status] || ""}`}>{statusLabels[c.contract_status] || c.contract_status}</Badge>
                          {c.contract_status === "cancelado" && c.refund_amount > 0 && (
                            <Badge variant="outline" className="text-[10px] ml-1">Devolvido: €{c.refund_amount}</Badge>
                          )}
                        </div>
                      </TooltipTrigger>
                      {c.contract_status === "cancelado" && c.cancel_reason && (
                        <TooltipContent>
                          <p className="text-xs">{c.cancel_reason}</p>
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
                  ) : c.contract_status === "pendente" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {c.contract_status === "pendente" && (
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
                    <Button variant="ghost" size="icon" onClick={() => navigate("/propostas")}>
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
    </div>
  );
};

export default ContratosPage;
