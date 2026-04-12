import { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Plus, Clock, CheckCircle, AlertCircle, Users, MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Simulation {
  id: string;
  name: string;
  status: string;
  scenario_prompt: string;
  persona_ids: string[];
  rounds: number;
  results: any;
  created_at: string;
  completed_at: string | null;
}

interface SimMessage {
  id: string;
  persona_id: string;
  round: number;
  content: string;
  role: string;
  metadata: any;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
}

const PERSONA_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500"];
const MSG_HEIGHT = 80;

function SimulationMessages({ messages, selected, personaMap }: { messages: SimMessage[]; selected: Simulation; personaMap: Record<string, string> }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => MSG_HEIGHT,
    overscan: 10,
  });

  if (!messages.length && selected.status === "draft") {
    return <p className="text-center text-muted-foreground py-12">Clique "Executar" para iniciar a simulação.</p>;
  }

  const personaColor = (idx: number) => PERSONA_COLORS[idx % PERSONA_COLORS.length];

  return (
    <div ref={scrollRef} className="h-[500px] overflow-y-auto pr-4">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const msg = messages[vRow.index];
          const pIdx = selected.persona_ids?.indexOf(msg.persona_id) ?? 0;
          return (
            <div
              key={msg.id}
              style={{
                position: "absolute",
                top: 0, left: 0, width: "100%",
                transform: `translateY(${vRow.start}px)`,
              }}
              className="flex gap-3 py-2"
            >
              <Avatar className={`h-8 w-8 ${personaColor(pIdx)}`}>
                <AvatarFallback className="text-white text-xs">{msg.role?.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold">{msg.role}</span>
                  <Badge variant="outline" className="text-[10px]">R{msg.round}</Badge>
                  {msg.metadata?.latency_ms && <span className="text-[10px] text-muted-foreground">{msg.metadata.latency_ms}ms</span>}
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SimulationPage() {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Simulation | null>(null);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [scenario, setScenario] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [rounds, setRounds] = useState(5);

  useEffect(() => {
    loadSimulations();
    loadAgents();
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected.id);

    const channel = supabase
      .channel(`sim-${selected.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "simulation_messages", filter: `simulation_id=eq.${selected.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as SimMessage])
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selected?.id]);

  async function loadSimulations() {
    const { data } = await supabase.from("simulations").select("*").order("created_at", { ascending: false });
    setSimulations((data as any[]) || []);
  }

  async function loadAgents() {
    const { data } = await supabase.from("ai_agents").select("id, name").eq("is_active", true);
    setAgents(data || []);
  }

  async function loadMessages(simId: string) {
    const { data } = await supabase.from("simulation_messages").select("*").eq("simulation_id", simId).order("created_at");
    setMessages((data as any[]) || []);
  }

  async function createSimulation() {
    if (!name || !scenario || selectedPersonas.length < 2) {
      toast.error("Preencha nome, cenário e selecione pelo menos 2 personas.");
      return;
    }
    const { data, error } = await supabase.from("simulations").insert({
      name,
      scenario_prompt: scenario,
      persona_ids: selectedPersonas,
      rounds,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success("Simulação criada!");
    setDialogOpen(false);
    setName(""); setScenario(""); setSelectedPersonas([]); setRounds(5);
    loadSimulations();
    setSelected(data as any);
  }

  async function runSimulation(simId: string) {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("simulation-engine", {
        body: { simulation_id: simId },
      });
      if (error) throw error;
      toast.success("Simulação concluída!");
      loadSimulations();
      if (selected?.id === simId) {
        const { data: updated } = await supabase.from("simulations").select("*").eq("id", simId).single();
        setSelected(updated as any);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao executar simulação");
    } finally {
      setRunning(false);
    }
  }

  const statusIcon = (s: string) => {
    if (s === "completed") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    if (s === "running") return <Clock className="h-4 w-4 text-amber-500 animate-spin" />;
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const personaColor = (idx: number) => PERSONA_COLORS[idx % PERSONA_COLORS.length];

  const personaMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Simulação Swarm" description="Simule interações entre múltiplas personas IA para prever outcomes.">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nova Simulação</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Criar Simulação</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Nome da simulação" value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea placeholder="Descreva o cenário/debate..." value={scenario} onChange={(e) => setScenario(e.target.value)} rows={4} />
              <div>
                <label className="text-sm font-medium mb-2 block">Personas (min 2, max 6)</label>
                <div className="grid grid-cols-2 gap-2">
                  {agents.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-accent">
                      <Checkbox
                        checked={selectedPersonas.includes(a.id)}
                        onCheckedChange={(checked) => {
                          if (checked && selectedPersonas.length < 6) setSelectedPersonas([...selectedPersonas, a.id]);
                          else setSelectedPersonas(selectedPersonas.filter((id) => id !== a.id));
                        }}
                      />
                      <span className="text-sm">{a.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Rodadas: {rounds}</label>
                <Slider min={1} max={20} step={1} value={[rounds]} onValueChange={([v]) => setRounds(v)} />
              </div>
              <Button onClick={createSimulation} className="w-full">Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Simulações</h3>
          {simulations.map((sim) => (
            <Card
              key={sim.id}
              className={`cursor-pointer transition-all hover:shadow-md ${selected?.id === sim.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelected(sim)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{sim.name}</span>
                  <div className="flex items-center gap-1">
                    {statusIcon(sim.status)}
                    <Badge variant={sim.status === "completed" ? "default" : "secondary"} className="text-[10px]">{sim.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{sim.scenario_prompt}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />{sim.persona_ids?.length || 0}
                  <MessageSquare className="h-3 w-3 ml-2" />{sim.rounds}r
                </div>
              </CardContent>
            </Card>
          ))}
          {!simulations.length && <p className="text-sm text-muted-foreground text-center py-8">Nenhuma simulação criada.</p>}
        </div>

        {/* Chat view */}
        <div className="lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{selected.name}</CardTitle>
                  <CardDescription>{selected.scenario_prompt.slice(0, 120)}...</CardDescription>
                </div>
                {selected.status === "draft" && (
                  <Button onClick={() => runSimulation(selected.id)} disabled={running}>
                    <Play className="h-4 w-4 mr-2" />{running ? "A executar..." : "Executar"}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <SimulationMessages messages={messages} selected={selected} personaMap={personaMap} />

                {selected.results && (
                  <div className="mt-6 border-t pt-4">
                    <h4 className="font-semibold mb-3">📊 Análise</h4>
                    {selected.results.summary && <p className="text-sm mb-3">{selected.results.summary}</p>}
                    {selected.results.dominant_persona && (
                      <p className="text-sm"><strong>Persona dominante:</strong> {selected.results.dominant_persona}</p>
                    )}
                    {selected.results.consensus_points?.length > 0 && (
                      <div className="mt-2">
                        <strong className="text-sm">Consensos:</strong>
                        <ul className="list-disc list-inside text-sm mt-1">
                          {selected.results.consensus_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {selected.results.conflict_points?.length > 0 && (
                      <div className="mt-2">
                        <strong className="text-sm">Conflitos:</strong>
                        <ul className="list-disc list-inside text-sm mt-1">
                          {selected.results.conflict_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {selected.results.recommendations?.length > 0 && (
                      <div className="mt-2">
                        <strong className="text-sm">Recomendações:</strong>
                        <ul className="list-disc list-inside text-sm mt-1">
                          {selected.results.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="flex items-center justify-center h-[600px]">
              <p className="text-muted-foreground">Selecione ou crie uma simulação.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
