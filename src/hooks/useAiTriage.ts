import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface TriageClassification {
  legal_area: string;
  urgency: string;
  ai_score: number;
  ai_viability: string;
  notes: string;
}

/**
 * useAiTriage — now delegates to ai-automation-agent (action: classify_lead)
 * instead of the deprecated ai-triage edge function.
 */
export function useAiTriage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string): Promise<TriageClassification> => {
      const { data, error } = await supabase.functions.invoke("ai-automation-agent", {
        body: { action: "classify_lead", lead_id: leadId },
      });

      if (error) throw new Error(error.message || "Erro na triagem IA");
      if (data?.error) throw new Error(data.error);

      return data.classification;
    },
    onSuccess: (classification) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Triagem IA concluída",
        description: `Área: ${classification.legal_area} | Score: ${classification.ai_score}/100 | Viabilidade: ${classification.ai_viability}`,
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro na triagem IA",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
