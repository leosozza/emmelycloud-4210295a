import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, LayoutGrid, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { LeadKanbanBoard } from "@/components/leads/LeadKanbanBoard";
import { LeadListView } from "@/components/leads/LeadListView";
import { LeadForm } from "@/components/leads/LeadForm";
import { LeadSheet } from "@/components/leads/LeadSheet";
import { PageHeader } from "@/components/PageHeader";
import { useNavigate } from "react-router-dom";

type Lead = Tables<"leads">;

const LeadsPage = () => {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [sheetLead, setSheetLead] = useState<Lead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setSheetOpen(open);
    if (!open && pendingNavigationRef.current) {
      const target = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      // Wait for Sheet animation to complete before navigating
      setTimeout(() => {
        navigate(target);
      }, 300);
    }
  }, [navigate]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: TablesInsert<"leads">) => {
      if (editingLead) {
        const { error } = await supabase.from("leads").update(data).eq("id", editingLead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setFormOpen(false);
      setEditingLead(null);
      toast({ title: editingLead ? "Lead atualizado" : "Lead criado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSheetOpen(false);
      setSheetLead(null);
      toast({ title: "Lead eliminado" });
    },
  });

  // Helper: ensure a case exists for a lead, return the case id
  const ensureCaseForLead = async (lead: Lead): Promise<string> => {
    const { data: existingCases } = await supabase
      .from("cases")
      .select("id")
      .eq("lead_id", lead.id)
      .limit(1);

    if (existingCases && existingCases.length > 0) {
      return existingCases[0].id;
    }

    const { data: newCase, error } = await supabase
      .from("cases")
      .insert({
        title: `Caso — ${lead.name}`,
        lead_id: lead.id,
        legal_area: lead.legal_area || "outro",
        status: "aberto",
      })
      .select("id")
      .single();

    if (error) throw error;
    toast({ title: "Caso criado automaticamente" });
    queryClient.invalidateQueries({ queryKey: ["cases"] });
    queryClient.invalidateQueries({ queryKey: ["cases-select"] });
    return newCase.id;
  };

  const advancedStages = ["proposta", "analise", "contrato", "financeiro", "fechado"];

  const moveStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      // Auto-create case if moving to an advanced stage
      if (advancedStages.includes(stage)) {
        const lead = leads.find((l) => l.id === id);
        if (lead) {
          await ensureCaseForLead(lead);
        }
      }
      const { error } = await supabase.from("leads").update({ funnel_stage: stage as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Estágio atualizado" });
    },
  });

  const filtered = leads.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const openLeadSheet = (lead: Lead) => {
    setSheetLead(lead);
    setSheetOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setFormOpen(true);
    setSheetOpen(false);
  };

  const openNew = () => {
    setEditingLead(null);
    setFormOpen(true);
  };

  const handleCreateProposal = async (lead: Lead) => {
    try {
      const caseId = await ensureCaseForLead(lead);
      // Close sheet first, then navigate after animation completes
      setSheetOpen(false);
      setSheetLead(null);
      setTimeout(() => navigate(`/propostas?case_id=${caseId}`), 400);
    } catch (e: any) {
      toast({ title: "Erro ao criar caso", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Leads & Funil" description="Gestão de leads e funil de vendas">
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/20 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-none text-white hover:bg-white/15 ${view === "kanban" ? "bg-white/25" : ""}`}
              onClick={() => setView("kanban")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-none text-white hover:bg-white/15 ${view === "list" ? "bg-white/25" : ""}`}
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={openNew} className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-full">
            <Plus className="mr-2 h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </PageHeader>



      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">A carregar...</p>
      ) : view === "kanban" ? (
        <LeadKanbanBoard leads={filtered} onLeadClick={openLeadSheet} onMoveStage={(leadId, stage) => moveStageMutation.mutate({ id: leadId, stage })} />
      ) : (
        <LeadListView leads={filtered} onLeadClick={openLeadSheet} />
      )}

      <LeadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editingLead}
        onSave={(data) => saveMutation.mutate(data)}
        saving={saveMutation.isPending}
      />

      <LeadSheet
        lead={sheetLead}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        onEdit={openEdit}
        onDelete={(id) => deleteMutation.mutate(id)}
        onMoveStage={(lead, stage) => moveStageMutation.mutate({ id: lead.id, stage })}
        onCreateProposal={handleCreateProposal}
      />
    </div>
  );
};

export default LeadsPage;
