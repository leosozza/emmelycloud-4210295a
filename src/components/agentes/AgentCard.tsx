import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Edit, Trash2, Star, GitBranch, BookOpen, Users, Volume2, Sparkles, Copy, DollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgentTrainingChat } from "@/components/agentes/AgentTrainingChat";
import { supabase } from "@/integrations/supabase/client";
import type { AIAgent, AIProvider } from "@/pages/Agentes";

interface AgentCardProps {
  agent: AIAgent;
  providers: AIProvider[];
  onEdit: (agent: AIAgent) => void;
  onDelete: (id: string) => void;
  onToggleDefault: (agent: AIAgent) => void;
  onDuplicate?: (agent: AIAgent) => void;
}

export function AgentCard({ agent, providers, onEdit, onDelete, onToggleDefault, onDuplicate }: AgentCardProps) {
  const textProvider = providers.find(p => p.slug === agent.ai_provider);
  const voiceProvider = agent.voice_provider ? providers.find(p => p.slug === agent.voice_provider) : null;
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [monthlyCost, setMonthlyCost] = useState<number | null>(null);

  useEffect(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    supabase.rpc("get_monthly_cost_by_agent", {
      p_agent_id: agent.id,
      p_month: monthStart.toISOString().slice(0, 10),
    }).then(({ data }) => {
      const d = data as any;
      if (d?.cost_usd !== undefined) setMonthlyCost(Number(d.cost_usd));
    });
  }, [agent.id]);

  const budgetPct = agent.monthly_budget_usd && monthlyCost !== null
    ? Math.min(100, Math.round((monthlyCost / agent.monthly_budget_usd) * 100))
    : null;

  return (
    <Card className={`relative ${!agent.is_active ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary"><Bot className="h-5 w-5" /></AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {agent.name}
                {agent.is_default && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
              </CardTitle>
              <CardDescription className="text-xs">{agent.description || "Sem descrição"}</CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="Treinar" onClick={() => setTrainingOpen(true)}><Sparkles className="h-3 w-3" /></Button>
            {onDuplicate && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicar" onClick={() => onDuplicate(agent)}><Copy className="h-3 w-3" /></Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(agent)}><Edit className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(agent.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="outline" className="text-[10px]">
            {textProvider?.name || (agent.ai_provider === "lovable" ? "nativo" : agent.ai_provider)}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {agent.ai_model.split('/').pop()}
          </Badge>
          <Badge variant="outline" className="text-[10px]">T: {agent.temperature}</Badge>
          {(agent as any).governance_mode && (agent as any).governance_mode !== "autonomous" && (
            <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600">
              {(agent as any).governance_mode === "supervised" ? "👁 Supervisionado" : "🔒 Restrito"}
            </Badge>
          )}
          {voiceProvider && (
            <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">
              <Volume2 className="h-2 w-2 mr-1" />
              {voiceProvider.name}{agent.voice_model ? ` / ${agent.voice_model}` : ''}
            </Badge>
          )}
          {agent.default_flow_id && <Badge variant="outline" className="text-[10px]"><GitBranch className="h-2 w-2 mr-1" />Fluxo</Badge>}
          {agent.training_collection_ids?.length > 0 && <Badge variant="outline" className="text-[10px]"><BookOpen className="h-2 w-2 mr-1" />{agent.training_collection_ids.length} doc(s)</Badge>}
          {agent.sub_agent_ids?.length > 0 && <Badge variant="outline" className="text-[10px]"><Users className="h-2 w-2 mr-1" />{agent.sub_agent_ids.length} sub</Badge>}
        </div>

        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{agent.is_active ? "Ativo" : "Inativo"}</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onToggleDefault(agent)}>
            {agent.is_default ? "Padrão ★" : "Definir padrão"}
          </Button>
        </div>
      </CardContent>

      <Dialog open={trainingOpen} onOpenChange={setTrainingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Treinar Agente</DialogTitle>
          </DialogHeader>
          <AgentTrainingChat agentId={agent.id} agentName={agent.name} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
