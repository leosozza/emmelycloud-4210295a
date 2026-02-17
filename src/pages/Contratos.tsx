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
import { Plus, Search, Pencil, Trash2, FileSignature, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tables, Constants } from "@/integrations/supabase/types";
import { ContratoForm } from "@/components/contratos/ContratoForm";
import { format, parseISO } from "date-fns";

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
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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
      const { error } = await supabase.from("contracts").update({
        status: "assinado" as any,
        signed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Contrato assinado" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").update({ status: "cancelado" as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Contrato cancelado" });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Contratos</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de contratos e assinaturas</p>
        </div>
        <Button onClick={() => { setEditingContrato(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Novo Contrato
        </Button>
      </div>

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
              <TableHead className="w-36">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">A carregar...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum contrato encontrado</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-sm">{proposalsMap[c.proposal_id] || "—"}</TableCell>
                <TableCell className="text-sm">{c.case_id ? (casesMap[c.case_id] || "—") : "—"}</TableCell>
                <TableCell>
                  <Badge className={`text-xs ${statusColors[c.status]}`}>{statusLabels[c.status]}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.starts_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.expires_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.signed_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {c.status === "pendente" && (
                      <>
                        <Button variant="ghost" size="icon" title="Assinar" onClick={() => signMutation.mutate(c.id)}>
                          <FileSignature className="h-4 w-4 text-success" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Cancelar" onClick={() => cancelMutation.mutate(c.id)}>
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
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
            ))}
          </TableBody>
        </Table>
      </div>

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
