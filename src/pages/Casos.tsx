import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VirtualTable } from "@/components/ui/VirtualTable";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Tables, TablesInsert, Constants } from "@/integrations/supabase/types";
import { CasoForm } from "@/components/casos/CasoForm";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { EntityBreadcrumb } from "@/components/EntityBreadcrumb";

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
  const navigate = useNavigate();
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
      <PageHeader title="Casos Jurídicos" description="Gestão de casos e processos">
        <Button onClick={() => { setEditingCaso(null); setFormOpen(true); }} className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-full">
          <Plus className="mr-2 h-4 w-4" /> Novo Caso
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
            {Constants.public.Enums.case_status.map((s) => (
              <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <VirtualTable<Case>
        data={filtered}
        getRowKey={(c) => c.id}
        isLoading={isLoading}
        emptyMessage="Nenhum caso encontrado"
        loadingMessage="A carregar..."
        columns={[
          { header: "Título", render: (c) => <span className="font-medium">{c.title}</span> },
          { header: "Área", render: (c) => <span className="text-sm">{legalAreaLabels[c.legal_area]}</span> },
          {
            header: "Status",
            render: (c) => <Badge className={`text-xs ${statusColors[c.status]}`}>{statusLabels[c.status]}</Badge>,
          },
          {
            header: "Lead",
            render: (c) => c.lead_id ? (
              <Button variant="link" size="sm" className="p-0 h-auto text-sm" onClick={(e) => { e.stopPropagation(); navigate("/leads"); }}>
                {leadsMap[c.lead_id] || "—"}
              </Button>
            ) : <>—</>,
          },
          { header: "Advogado", render: (c) => <span className="text-sm">{c.assigned_attorney_id ? (profilesMap[c.assigned_attorney_id] || "—") : "—"}</span> },
          { header: "Data", render: (c) => <span className="text-xs text-muted-foreground">{format(parseISO(c.created_at), "dd/MM/yyyy")}</span> },
          {
            header: "Ações",
            className: "w-24",
            render: (c) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingCaso(c); setFormOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(c.id); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

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
