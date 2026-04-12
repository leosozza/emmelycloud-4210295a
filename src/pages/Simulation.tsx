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
import { Play, Plus, Clock, CheckCircle, AlertCircle, Users, MessageSquare, Pause, Send, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Simulation {
  id: string;
  name: string;
  status: string;
  scenario_prompt: string;
  persona_ids: string[];
  rounds: number;
  current_round: number;
  intervention_prompt: string | null;
  results: any;
  metadata: any;
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (!messages.length && selected.status === "draft") {
    return <p className="text-center text-muted-foreground py-12">Clique "Executar" para iniciar a simulação.</p>;
  }

  const personaColor = (idx: number) => PERSONA_COLORS[idx % PERSONA_COLORS.length];

  return (
    <div ref={scrollRef} className="h-[500px] overflow-y-auto pr-4 scroll-smooth">
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
                  {msg.metadata?.model?.includes('ollama') && <Zap className="h-3 w-3 text-amber-500" title="Executado localmente via Ollama" />}
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
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
  const [interventionText, setInterventionText] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [scenario, setScenario] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [rounds, setRounds] = useState(5);
  const [useOllama, setUseOllama] = useState(false);

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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "simulations", filter: `id=eq.${selected.id}` },
        (payload) => setSelected(payload.new as Simulation)
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
      metadata: { use_ollama: useOllama }
    }).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success("Simulação criada!");
    setDialogOpen(false);
    setName(""); setScenario(""); setSelectedPersonas([]); setRounds(5); setUseOllama(false);
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
    } catch (err: any) {
      toast.error(err.message || "Erro ao executar simulação");
    } finally {
      setRunning(false);
    }
  }

  async function togglePause() {
    if (!selected) return;
    const newStatus = selected.status === "paused" ? "running" : "paused";
    await supabase.from("simulations").update({ status: newStatus }).eq("id", selected.id);
    if (newStatus === "running") {
      runSimulation(selected.id);
    }
  }

  async function injectIntervention() {
    if (!selected || !interventionText) return;
    await supabase.from("simulations").update({ intervention_prompt: interventionText }).eq("id", selected.id);
    toast.success("Intervenção injetada!");
    setInterventionText("");
  }

  const statusIcon = (s: string) => {
    if (s === "completed") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    if (s === "running") return <Clock className="h-4 w-4 text-amber-500 animate-spin" />;
    if (s === "paused") return <Pause className="h-4 w-4 text-blue-500" />;
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const personaMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <PageHeader title="MiroFish Swarm Analysis" description="Simule interações entre múltiplas personas IA com intervenções preditivas.">
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
              <div className="flex items-center justify-between py-2 border-t border-b">
                 <div className="space-y-0.5">
                    <Label>Modo Ollama (Local)</Label>
                    <p className="text-[10px] text-muted-foreground">Usa processamento local para custo zero.</p>
                 </div>
                 <Switch checked={useOllama} onCheckedChange={setUseOllama} />
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* List */}
        <div className="space-y-3 lg:col-span-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Simulações</h3>
          {simulations.map((sim) => (
            <Card
              key={sim.id}
              className={`cursor-pointer transition-all hover:shadow-md ${selected?.id === sim.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelected(sim)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs truncate max-w-[120px]">{sim.name}</span>
                  <div className="flex items-center gap-1">
                    {statusIcon(sim.status)}
                    <Badge variant="outline" className="text-[9px] px-1">{sim.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                  <Users className="h-3 w-3" />{sim.persona_ids?.length || 0}
                  <MessageSquare className="h-3 w-3 ml-2" />{sim.current_round || 0}/{sim.rounds}r
                  {sim.metadata?.use_ollama && <Zap className="h-3 w-3 ml-2 text-amber-500" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chat view */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                        {selected.name}
                        {selected.metadata?.use_ollama && <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">Local Ollama</Badge>}
                    </CardTitle>
                    <CardDescription className="line-clamp-1">{selected.scenario_prompt}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selected.status === "draft" && (
                      <Button onClick={() => runSimulation(selected.id)} disabled={running}>
                        <Play className="h-4 w-4 mr-2" />{running ? "Executando..." : "Iniciar"}
                      </Button>
                    )}
                    {selected.status === "running" && (
                      <Button variant="outline" onClick={togglePause}>
                        <Pause className="h-4 w-4 mr-2" /> Pausar
                      </Button>
                    )}
                    {selected.status === "paused" && (
                      <Button variant="default" onClick={togglePause}>
                        <Play className="h-4 w-4 mr-2" /> Retomar
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <SimulationMessages messages={messages} selected={selected} personaMap={personaMap} />
                  
                  {/* Intervention Footer */}
                  {selected.status !== "completed" && selected.status !== "draft" && (
                    <div className="mt-4 flex gap-2 p-3 bg-accent/50 rounded-lg border">
                       <Input 
                        placeholder="Injetar fato ou mudar rumo do debate..."
                        value={interventionText}
                        onChange={(e) => setInterventionText(e.target.value)}
                        className="flex-1"
                       />
                       <Button onClick={injectIntervention} disabled={!interventionText}>
                          <Send className="h-4 w-4 mr-2" /> Injetar
                       </Button>
                    </div>
                  )}

                  {selected.results && (
                    <div className="mt-6 border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h4 className="font-semibold text-primary flex items-center gap-2">
                           📊 Resumo da Simulação
                        </h4>
                        <p className="text-sm text-foreground/80 leading-relaxed">{selected.results.summary}</p>
                        {selected.results.dominant_persona && (
                          <div className="p-3 bg-primary/5 rounded border">
                            <p className="text-xs font-semibold uppercase text-primary mb-1">Persona Dominante</p>
                            <span className="text-sm font-bold">{selected.results.dominant_persona}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-4">
                        {selected.results.consensus_points?.length > 0 && (
                          <div className="space-y-2">
                            <strong className="text-xs uppercase text-emerald-600 tracking-wider">Pontos de Consenso</strong>
                            <ul className="space-y-1">
                              {selected.results.consensus_points.map((p: string, i: number) => (
                                <li key={i} className="text-xs py-1 px-2 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 flex gap-2">
                                   <CheckCircle className="h-3 w-3 shrink-0 mt-0.5" /> {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selected.results.conflict_points?.length > 0 && (
                          <div className="space-y-2">
                            <strong className="text-xs uppercase text-rose-600 tracking-wider">Pontos de Conflito</strong>
                            <ul className="space-y-1">
                              {selected.results.conflict_points.map((p: string, i: number) => (
                                <li key={i} className="text-xs py-1 px-2 bg-rose-50 text-rose-700 rounded border border-rose-100 flex gap-2">
                                   <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /> {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center h-[600px] border-dashed">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Selecione uma simulação para visualizar ou crie uma nova análise de enxame.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
