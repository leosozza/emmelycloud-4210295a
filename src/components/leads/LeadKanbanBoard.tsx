import { useState, useRef } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";
import { LeadCard } from "./LeadCard";
import { useVirtualizer } from "@tanstack/react-virtual";

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

const CARD_HEIGHT = 120;

function KanbanColumn({
  stage,
  leads,
  onLeadClick,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  stage: string;
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
  isOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_HEIGHT,
    overscan: 5,
  });

  return (
    <div className="flex-shrink-0 w-64">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold text-foreground">{stageLabels[stage]}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {leads.length}
        </span>
      </div>
      <div
        ref={scrollRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`min-h-[200px] max-h-[60vh] overflow-y-auto rounded-lg p-2 transition-colors ${
          isOver ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/50"
        }`}
      >
        {leads.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Vazio</p>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const lead = leads[vRow.index];
              return (
                <div
                  key={lead.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <LeadCard lead={lead} onClick={onLeadClick} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function LeadKanbanBoard({ leads, onLeadClick, onMoveStage }: LeadKanbanBoardProps) {
  const stages = Constants.public.Enums.funnel_stage;
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
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
        return (
          <KanbanColumn
            key={stage}
            stage={stage}
            leads={stageLeads}
            onLeadClick={onLeadClick}
            isOver={dragOverStage === stage}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(e, stage)}
          />
        );
      })}
    </div>
  );
}
