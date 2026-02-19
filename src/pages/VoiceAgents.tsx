import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VoiceAgent } from "@/components/agentes/VoiceAgent";
import type { AIAgent } from "@/pages/Agentes";

export default function VoiceAgentsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVoiceAgents = async () => {
      const { data } = await supabase
        .from("ai_agents")
        .select("*")
        .in("agent_type", ["voice", "hybrid"])
        .eq("is_active", true)
        .order("name");

      if (data) setAgents(data as unknown as AIAgent[]);
      setLoading(false);
    };
    loadVoiceAgents();
  }, []);

  return (
    <div>
      <PageHeader
        title="Agentes de Voz"
        description="Teste chamadas de voz com agentes configurados com ElevenLabs"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Volume2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Nenhum agente de voz configurado.<br />
              <span className="text-xs">
                Vá a Agentes IA e crie um agente do tipo "Voz" ou "Híbrido" com provider ElevenLabs.
              </span>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <VoiceAgent key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
