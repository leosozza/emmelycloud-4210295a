import { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";
import { LeadCard } from "./LeadCard";
import { ScrollArea } from "@/components/ui/scroll-area";

type Lead = Tables<"leads">;

const stageLabels: Record<string, string> = {
  lead: "Lead", triagem: "Triagem", proposta: "Proposta", analise: "Análise",
  contrato: "Contrato", financeiro: "Financeiro", fechado: "Fechado",
};

interface LeadKanbanBoardProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}

export function LeadKanbanBoard({ leads, onLeadClick }: LeadKanbanBoardProps) {
  const stages = Constants.public.Enums.funnel_stage;

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageLeads = leads.filter((l) => l.funnel_stage === stage);
        return (
          <div key={stage} className="flex-shrink-0 w-64">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-semibold text-foreground">{stageLabels[stage]}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {stageLeads.length}
              </span>
            </div>
            <div className="space-y-2 min-h-[200px] rounded-lg bg-muted/50 p-2">
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
