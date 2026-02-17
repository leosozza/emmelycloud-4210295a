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
import { Plus, Search, Pencil, Trash2, Send, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tables, Constants } from "@/integrations/supabase/types";
import { PropostaForm } from "@/components/propostas/PropostaForm";
import { useLocale } from "@/contexts/LocaleContext";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/PageHeader";

type Proposal = Tables<"proposals">;

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", recusada: "Recusada", expirada: "Expirada",
};
const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviada: "bg-info text-info-foreground",
  aceita: "bg-success text-success-foreground",
  recusada: "bg-destructive text-destructive-foreground",
  expirada: "bg-warning text-warning-foreground",
};
const paymentTypeLabels: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado",
};

const PropostasPage = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProposta, setEditingProposta] = useState<Proposal | null>(null);
  const { toast } = useToast();
  const { formatCurrency } = useLocale();
  const queryClient = useQueryClient();

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposals").select("*").order("created_at", { ascending: false });
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

  const casesMap = Object.fromEntries(cases.map((c) => [c.id, c.title]));

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingProposta) {
        const { error } = await supabase.from("proposals").update(data).eq("id", editingProposta.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proposals").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      setFormOpen(false);
      setEditingProposta(null);
      toast({ title: editingProposta ? "Proposta atualizada" : "Proposta criada" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updateData: any = { status };
      // If accepting, also create a contract
      const { error } = await supabase.from("proposals").update(updateData).eq("id", id);
      if (error) throw error;
      if (status === "aceita") {
        const proposal = proposals.find((p) => p.id === id);
        if (proposal) {
          const { error: contractError } = await supabase.from("contracts").insert({
            proposal_id: id,
            case_id: proposal.case_id,
          });
          if (contractError) throw contractError;
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: status === "aceita" ? "Proposta aceita — contrato criado" : "Status atualizado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Proposta eliminada" });
    },
  });

  const filtered = proposals
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  // formatCurrency now comes from useLocale()

  return (
    <div className="space-y-4">
      <PageHeader title="Propostas" description="Criação e gestão de propostas de honorários">
        <Button onClick={() => { setEditingProposta(null); setFormOpen(true); }} className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-full">
          <Plus className="mr-2 h-4 w-4" /> Nova Proposta
        </Button>
      </PageHeader>

      <div className="flex gap-3 items-center">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Constants.public.Enums.proposal_status.map((s) => (
              <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Caso</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead className="w-36">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">A carregar...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma proposta encontrada</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell className="text-sm">{casesMap[p.case_id] || "—"}</TableCell>
                <TableCell className="text-sm font-medium">{formatCurrency(p.value)}</TableCell>
                <TableCell className="text-sm">{paymentTypeLabels[p.payment_type]}{p.installments && p.installments > 1 ? ` (${p.installments}x)` : ""}</TableCell>
                <TableCell>
                  <Badge className={`text-xs ${statusColors[p.status]}`}>{statusLabels[p.status]}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.valid_until ? format(parseISO(p.valid_until), "dd/MM/yyyy") : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {p.status === "rascunho" && (
                      <Button variant="ghost" size="icon" title="Enviar" onClick={() => updateStatusMutation.mutate({ id: p.id, status: "enviada" })}>
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    {p.status === "enviada" && (
                      <>
                        <Button variant="ghost" size="icon" title="Aceitar" onClick={() => updateStatusMutation.mutate({ id: p.id, status: "aceita" })}>
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Recusar" onClick={() => updateStatusMutation.mutate({ id: p.id, status: "recusada" })}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => { setEditingProposta(p); setFormOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PropostaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        proposta={editingProposta}
        cases={cases}
        onSave={(data) => saveMutation.mutate(data)}
        saving={saveMutation.isPending}
      />
    </div>
  );
};

export default PropostasPage;
