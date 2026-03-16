import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";
import { LeadCard } from "./LeadCard";

type Lead = Tables<"leads"> & { clients?: { name: string } | null };

const stageLabels: Record<string, string> = {
  lead: "Lead", triagem: "Triagem", proposta: "Proposta", analise: "Análise",
  contrato: "Contrato", financeiro: "Financeiro", fechado: "Fechado",
};

interface LeadKanbanBoardProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
  onMoveStage?: (leadId: string, newStage: string) => void;
}

export function LeadKanbanBoard({ leads, onLeadClick, onMoveStage }: LeadKanbanBoardProps) {
  const stages = Constants.public.Enums.funnel_stage;
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData("text/plain");
    if (leadId && onMoveStage) {
      onMoveStage(leadId, stage);
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageLeads = leads.filter((l) => l.funnel_stage === stage);
        const isOver = dragOverStage === stage;
        return (
          <div key={stage} className="flex-shrink-0 w-64">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-semibold text-foreground">{stageLabels[stage]}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {stageLeads.length}
              </span>
            </div>
            <div
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
              className={`space-y-2 min-h-[200px] rounded-lg p-2 transition-colors ${
                isOver ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/50"
              }`}
            >
              {stageLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onClick={onLeadClick} />
              ))}
              {stageLeads.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Vazio</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
