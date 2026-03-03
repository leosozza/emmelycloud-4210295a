import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

async function invokeAgent(action: string, params: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke("ai-automation-agent", {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message || "Erro na automação IA");
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useClassifyLead() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => invokeAgent("classify_lead", { lead_id: leadId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      const c = data.classification;
      toast({
        title: "Classificação IA concluída",
        description: `Área: ${c.legal_area} | Score: ${c.ai_score}/100 | Viabilidade: ${c.ai_viability}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Erro na classificação IA", description: e.message, variant: "destructive" });
    },
  });
}

export function useSummarizeConversation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => invokeAgent("summarize_conversation", { conversation_id: conversationId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Resumo gerado",
        description: data.lead_updated ? "Resumo salvo nas notas do lead." : "Resumo gerado (sem lead vinculado).",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao resumir", description: e.message, variant: "destructive" });
    },
  });
}

export function useSuggestNextAction() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (leadId: string) => invokeAgent("suggest_next_action", { lead_id: leadId }),
    onSuccess: (data) => {
      toast({ title: "Sugestão IA", description: data.suggestion });
    },
    onError: (e: Error) => {
      toast({ title: "Erro na sugestão", description: e.message, variant: "destructive" });
    },
  });
}

export function useExtractLeadData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => invokeAgent("extract_lead_data", { conversation_id: conversationId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: data.action === "created" ? "Lead criado com IA" : "Lead atualizado com IA",
        description: `Dados extraídos: ${data.extracted.name || "N/A"}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Erro na extração", description: e.message, variant: "destructive" });
    },
  });
}
