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
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tables, TablesInsert, Constants } from "@/integrations/supabase/types";
import { CasoForm } from "@/components/casos/CasoForm";
import { format, parseISO } from "date-fns";

type Case = Tables<"cases">;

const statusLabels: Record<string, string> = {
  aberto: "Aberto", em_andamento: "Em Andamento", pendente_docs: "Pendente Docs",
  concluido: "Concluído", arquivado: "Arquivado",
};
const statusColors: Record<string, string> = {
  aberto: "bg-info text-info-foreground",
  em_andamento: "bg-primary text-primary-foreground",
  pendente_docs: "bg-warning text-warning-foreground",
  concluido: "bg-success text-success-foreground",
  arquivado: "bg-muted text-muted-foreground",
};
const legalAreaLabels: Record<string, string> = {
  previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
  trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
  tributario: "Tributário", outro: "Outro",
};

const CasosPage = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCaso, setEditingCaso] = useState<Case | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["leads-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: TablesInsert<"cases">) => {
      if (editingCaso) {
        const { error } = await supabase.from("cases").update(data).eq("id", editingCaso.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cases").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      setFormOpen(false);
      setEditingCaso(null);
      toast({ title: editingCaso ? "Caso atualizado" : "Caso criado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast({ title: "Caso eliminado" });
    },
  });

  const leadsMap = Object.fromEntries(leads.map((l) => [l.id, l.name]));
  const profilesMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));

  const filtered = cases
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Casos Jurídicos</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de casos e processos</p>
        </div>
        <Button onClick={() => { setEditingCaso(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Novo Caso
        </Button>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Constants.public.Enums.case_status.map((s) => (
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
              <TableHead>Área</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Advogado</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">A carregar...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum caso encontrado</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.title}</TableCell>
                <TableCell className="text-sm">{legalAreaLabels[c.legal_area]}</TableCell>
                <TableCell>
                  <Badge className={`text-xs ${statusColors[c.status]}`}>{statusLabels[c.status]}</Badge>
                </TableCell>
                <TableCell className="text-sm">{c.lead_id ? (leadsMap[c.lead_id] || "—") : "—"}</TableCell>
                <TableCell className="text-sm">{c.assigned_attorney_id ? (profilesMap[c.assigned_attorney_id] || "—") : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(parseISO(c.created_at), "dd/MM/yyyy")}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingCaso(c); setFormOpen(true); }}>
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

      <CasoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        caso={editingCaso}
        leads={leads}
        profiles={profiles}
        onSave={(data) => saveMutation.mutate(data)}
        saving={saveMutation.isPending}
      />
    </div>
  );
};

export default CasosPage;
