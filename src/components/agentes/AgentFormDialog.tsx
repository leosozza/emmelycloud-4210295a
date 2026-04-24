import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, GitBranch, BookOpen, Users, Volume2, Wrench, ChevronRight, ChevronLeft,
  User, Brain, GraduationCap, Settings2, CheckCircle2, Lightbulb, Sparkles,
} from "lucide-react";
import type { AIAgent, AIProvider, FlowOption, DocOption, CollectionOption } from "@/pages/Agentes";
import { cn } from "@/lib/utils";
import { SyncOllamaModelsButton } from "@/components/agentes/SyncOllamaModelsButton";

const SKILL_TYPES = [
  { type: "crm", label: "Consultar CRM", description: "Buscar leads, propostas, contratos e casos no CRM", icon: "📊" },
  { type: "payments", label: "Pagamentos", description: "Verificar e gerir pagamentos e parcelas", icon: "💳" },
  { type: "services", label: "Serviços / Propostas", description: "Listar serviços disponíveis com preços", icon: "📋" },
  { type: "search_knowledge", label: "Pesquisar Knowledge Base", description: "Buscar na base de conhecimento", icon: "🔍" },
  { type: "graph", label: "Navegar Grafo de Entidades", description: "Encontrar relações entre leads, contratos e pagamentos", icon: "🔗" },
  { type: "run_flow", label: "Chamar Flow", description: "Executar um flow como acção", icon: "▶️" },
  { type: "webhook", label: "Webhook Externo", description: "Chamar APIs externas", icon: "🌐" },
];

const STEPS = [
  { num: 1, label: "Identidade", icon: User, tip: "Dê um nome ao seu agente e escolha como ele se comunica. Ex: 'Sofia' — profissional e empática." },
  { num: 2, label: "Inteligência", icon: Brain, tip: "O modelo define a 'inteligência' do agente. Para a maioria dos casos, o modelo recomendado é suficiente." },
  { num: 3, label: "Conhecimento", icon: GraduationCap, tip: "Ensine ao agente sobre o seu negócio. Pode escrever instruções ou vincular documentos." },
  { num: 4, label: "Habilidades", icon: Settings2, tip: "Active as ferramentas que o agente pode usar. Comece com poucas e adicione conforme necessário." },
  { num: 5, label: "Revisão", icon: CheckCircle2, tip: "Revise as configurações. Pode alterar tudo depois." },
];

const PERSONALITY_PREVIEW: Record<string, string> = {
  professional: "Olá, como posso ajudá-lo hoje?",
  friendly: "Oi! 😊 Em que posso te ajudar?",
  formal: "Prezado(a), em que posso ser útil?",
  casual: "E aí! O que precisa?",
  technical: "Disponível para análise. Qual é a questão?",
  persuasive: "Tenho a solução perfeita para si! Vamos conversar?",
};

interface AgentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAgent: Partial<AIAgent>;
  setEditingAgent: React.Dispatch<React.SetStateAction<Partial<AIAgent>>>;
  providers: AIProvider[];
  flows: FlowOption[];
  docs: DocOption[];
  collections: CollectionOption[];
  agents: AIAgent[];
  saving: boolean;
  onSave: () => void;
  skills?: { skill_type: string; is_enabled: boolean }[];
  onSkillToggle?: (skillType: string, enabled: boolean) => void;
}

export function AgentFormDialog({
  open, onOpenChange, editingAgent, setEditingAgent,
  providers, flows, docs, collections, agents, saving, onSave,
  skills = [], onSkillToggle,
}: AgentFormDialogProps) {
  const [step, setStep] = useState(1);

  const textProviders = providers.filter(p => p.provider_type === 'text' || p.provider_type === 'multimodal');
  const voiceProviders = providers.filter(p => p.provider_type === 'voice' || p.provider_type === 'multimodal');
  const selectedTextProvider = textProviders.find(p => p.slug === editingAgent.ai_provider);
  const selectedVoiceProvider = voiceProviders.find(p => p.slug === editingAgent.voice_provider);
  const textModels = (selectedTextProvider?.available_models as any[]) || [];
  const voiceModels = (selectedVoiceProvider?.available_models as any[]) || [];
  const showVoiceSection = editingAgent.agent_type === 'voice' || editingAgent.agent_type === 'hybrid';
  const isEditing = !!editingAgent.id;

  const toggleTrainingDoc = (docId: string) => {
    const current = editingAgent.training_collection_ids || [];
    const next = current.includes(docId) ? current.filter(id => id !== docId) : [...current, docId];
    setEditingAgent(prev => ({ ...prev, training_collection_ids: next }));
  };

  const toggleSubAgent = (agentId: string) => {
    const current = editingAgent.sub_agent_ids || [];
    const next = current.includes(agentId) ? current.filter(id => id !== agentId) : [...current, agentId];
    setEditingAgent(prev => ({ ...prev, sub_agent_ids: next }));
  };

  const canAdvance = useMemo(() => {
    if (step === 1) return !!(editingAgent.name?.trim());
    return true;
  }, [step, editingAgent.name]);

  const handleOpenChange = (v: boolean) => {
    if (!v) setStep(1);
    onOpenChange(v);
  };

  const currentStep = STEPS[step - 1];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl">{isEditing ? "Editar Agente" : "Criar Novo Agente"}</DialogTitle>
          <DialogDescription>Siga os passos para configurar o seu agente de IA.</DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.num;
              const isDone = step > s.num;
              return (
                <div key={s.num} className="flex items-center flex-1 last:flex-none">
                  <button
                    onClick={() => isDone && setStep(s.num)}
                    className={cn(
                      "flex flex-col items-center gap-1 transition-all",
                      isDone && "cursor-pointer",
                      !isDone && !isActive && "cursor-default"
                    )}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                      isActive && "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
                      isDone && "bg-primary/20 text-primary",
                      !isActive && !isDone && "bg-muted text-muted-foreground"
                    )}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium hidden sm:block",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}>{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-2 rounded-full transition-all",
                      step > s.num ? "bg-primary/40" : "bg-muted"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Contextual tip */}
          <div className="flex items-start gap-2 mb-5 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{currentStep.tip}</p>
          </div>

          {/* ============ STEP 1: Identity ============ */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-medium">Nome do Agente *</Label>
                <p className="text-xs text-muted-foreground mb-2">Escolha um nome que represente o papel do agente.</p>
                <Input
                  value={editingAgent.name || ""}
                  onChange={(e) => setEditingAgent(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Sofia, Assistente Jurídico, Suporte Técnico"
                  className="text-base"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Descrição</Label>
                <p className="text-xs text-muted-foreground mb-2">Uma breve descrição do que este agente faz.</p>
                <Input
                  value={editingAgent.description || ""}
                  onChange={(e) => setEditingAgent(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Ex: Atende clientes e agenda consultas"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Como comunica?</Label>
                <p className="text-xs text-muted-foreground mb-2">Escolha se o agente responde por texto, voz, ou ambos.</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "text", label: "💬 Texto", desc: "Mensagens escritas" },
                    { value: "voice", label: "🎙️ Voz", desc: "Chamadas de voz" },
                    { value: "hybrid", label: "💬🎙️ Ambos", desc: "Texto e voz" },
                  ].map(opt => (
                    <Card
                      key={opt.value}
                      className={cn(
                        "cursor-pointer transition-all hover:border-primary/50",
                        editingAgent.agent_type === opt.value && "border-primary ring-2 ring-primary/20"
                      )}
                      onClick={() => setEditingAgent(prev => ({
                        ...prev,
                        agent_type: opt.value,
                        ...(opt.value === 'text' ? { voice_provider: null, voice_model: null, voice_id: null } : {}),
                      }))}
                    >
                      <CardContent className="p-3 text-center">
                        <p className="text-lg">{opt.label.split(' ')[0]}</p>
                        <p className="text-xs font-medium mt-1">{opt.label.split(' ').slice(1).join(' ')}</p>
                        <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Personalidade</Label>
                  <p className="text-xs text-muted-foreground mb-2">Como o agente se expressa.</p>
                  <Select
                    value={editingAgent.personality_style || "professional"}
                    onValueChange={(v) => setEditingAgent(prev => ({ ...prev, personality_style: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Profissional</SelectItem>
                      <SelectItem value="friendly">Amigável</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="technical">Técnico</SelectItem>
                      <SelectItem value="persuasive">Persuasivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Tom</Label>
                  <p className="text-xs text-muted-foreground mb-2">O sentimento por trás das respostas.</p>
                  <Select
                    value={editingAgent.communication_tone || "empathetic"}
                    onValueChange={(v) => setEditingAgent(prev => ({ ...prev, communication_tone: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empathetic">Empático</SelectItem>
                      <SelectItem value="direct">Directo</SelectItem>
                      <SelectItem value="encouraging">Encorajador</SelectItem>
                      <SelectItem value="neutral">Neutro</SelectItem>
                      <SelectItem value="assertive">Assertivo</SelectItem>
                      <SelectItem value="warm">Caloroso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Personality preview */}
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Preview — como o agente falaria:</p>
                <p className="text-sm italic">"{PERSONALITY_PREVIEW[editingAgent.personality_style || 'professional']}"</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Objectivo (opcional)</Label>
                <p className="text-xs text-muted-foreground mb-2">O que este agente deve alcançar?</p>
                <Input
                  value={editingAgent.strategic_objective || ""}
                  onChange={(e) => setEditingAgent(prev => ({ ...prev, strategic_objective: e.target.value }))}
                  placeholder="Ex: Converter leads em clientes, Resolver tickets rapidamente"
                />
              </div>
            </div>
          )}

          {/* ============ STEP 2: Intelligence ============ */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-medium">Provider de IA</Label>
                <p className="text-xs text-muted-foreground mb-2">Escolha o serviço que alimenta a inteligência do agente.</p>
                <Select
                  value={editingAgent.ai_provider || "lovable"}
                  onValueChange={(v) => {
                    const prov = textProviders.find(p => p.slug === v);
                    const firstModel = (prov?.available_models as any[])?.[0]?.name || "";
                    setEditingAgent(prev => ({ ...prev, ai_provider: v, ai_model: firstModel, ai_base_url: prov?.base_url || "" }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {textProviders.map(p => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name} {p.is_native && <Badge className="ml-1 text-[8px]" variant="secondary">Recomendado</Badge>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <Label className="text-sm font-medium">Modelo</Label>
                    <p className="text-xs text-muted-foreground">Modelos mais avançados são mais inteligentes mas podem custar mais.</p>
                  </div>
                  {editingAgent.ai_provider === "qwen-local" && (
                    <SyncOllamaModelsButton
                      onSynced={(models) => {
                        // Update local provider models so dropdown refreshes immediately
                        const newModels = models.map((n) => ({ name: n, display: n }));
                        if (selectedTextProvider) {
                          (selectedTextProvider as any).available_models = newModels;
                        }
                        // If current model not in list, switch to first available
                        if (models.length > 0 && !models.includes(editingAgent.ai_model || "")) {
                          setEditingAgent((prev) => ({ ...prev, ai_model: models[0] }));
                        } else {
                          // Force re-render
                          setEditingAgent((prev) => ({ ...prev }));
                        }
                      }}
                    />
                  )}
                </div>
                <Select
                  value={editingAgent.ai_model || ""}
                  onValueChange={(v) => setEditingAgent(prev => ({ ...prev, ai_model: v }))}
                >
                  <SelectTrigger><SelectValue placeholder={textModels.length === 0 ? "Nenhum modelo — clique em Sincronizar" : "Escolha um modelo"} /></SelectTrigger>
                  <SelectContent>
                    {textModels.map((m: any) => (
                      <SelectItem key={m.name} value={m.name}>{m.display || m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedTextProvider?.is_native && selectedTextProvider?.credential_key && selectedTextProvider.credential_key !== "base_url" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>URL Base da API</Label>
                    <Input value={editingAgent.ai_base_url || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, ai_base_url: e.target.value }))} placeholder="https://api.example.com/v1" />
                  </div>
                  <div>
                    <Label>Credencial ({selectedTextProvider.credential_key})</Label>
                    <Input value={editingAgent.ai_api_key_credential || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, ai_api_key_credential: e.target.value }))} placeholder="Nome na Central de Integrações" />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">Criatividade</Label>
                <p className="text-xs text-muted-foreground mb-2">Controla o quão criativo ou preciso o agente é nas respostas.</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">🎯 Preciso</span>
                  <Slider
                    value={[editingAgent.temperature || 0.7]}
                    onValueChange={([v]) => setEditingAgent(prev => ({ ...prev, temperature: v }))}
                    min={0} max={2} step={0.1}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">🎨 Criativo</span>
                </div>
                <p className="text-center text-xs text-muted-foreground mt-1">{editingAgent.temperature ?? 0.7}</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Limite de custo mensal (opcional)</Label>
                <p className="text-xs text-muted-foreground mb-2">Defina um limite em USD para controlar gastos. Deixe vazio para ilimitado.</p>
                <Input
                  type="number" step="0.01" min="0"
                  value={editingAgent.monthly_budget_usd ?? ""}
                  onChange={(e) => setEditingAgent(prev => ({ ...prev, monthly_budget_usd: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="Ex: 50.00"
                />
              </div>

              {/* Voice section */}
              {showVoiceSection && (
                <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Volume2 className="h-4 w-4" /> Configuração de Voz</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Provider de Voz</Label>
                      <Select
                        value={editingAgent.voice_provider || "none"}
                        onValueChange={(v) => {
                          if (v === "none") {
                            setEditingAgent(prev => ({ ...prev, voice_provider: null, voice_model: null, voice_id: null }));
                          } else {
                            const prov = voiceProviders.find(p => p.slug === v);
                            const firstModel = (prov?.available_models as any[])?.[0]?.name || "";
                            setEditingAgent(prev => ({ ...prev, voice_provider: v, voice_model: firstModel }));
                          }
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {voiceProviders.map(p => (
                            <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Modelo de Voz</Label>
                      <Select
                        value={editingAgent.voice_model || ""}
                        onValueChange={(v) => setEditingAgent(prev => ({ ...prev, voice_model: v }))}
                        disabled={!editingAgent.voice_provider}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          {voiceModels.map((m: any) => (
                            <SelectItem key={m.name} value={m.name}>{m.display || m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Voice ID (opcional)</Label>
                    <Input value={editingAgent.voice_id || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, voice_id: e.target.value }))} placeholder="Ex: EXAVITQu4vr4xnSDxMaL" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ STEP 3: Knowledge ============ */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-medium">Prompt Base (Persona)</Label>
                <p className="text-xs text-muted-foreground mb-2">Descreva quem é o agente, como se estivesse a explicar a um colega novo.</p>
                <Textarea
                  value={editingAgent.base_prompt || ""}
                  onChange={(e) => setEditingAgent(prev => ({ ...prev, base_prompt: e.target.value }))}
                  rows={4}
                  placeholder="Ex: Você é a Sofia, assistente jurídica da empresa XYZ. Você é simpática, profissional, e ajuda clientes com questões sobre contratos e processos."
                />
                <p className="text-[10px] text-muted-foreground mt-1">💡 Este prompt também pode ser gerado automaticamente pelo Persona Trainer.</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Instruções Específicas</Label>
                <p className="text-xs text-muted-foreground mb-2">Regras e instruções detalhadas de comportamento.</p>
                <Textarea
                  value={editingAgent.system_prompt || ""}
                  onChange={(e) => setEditingAgent(prev => ({ ...prev, system_prompt: e.target.value }))}
                  rows={5}
                  placeholder="Ex: Sempre cumprimente o cliente pelo nome. Não forneça informações sobre preços sem aprovação. Encaminhe questões jurídicas complexas para um advogado."
                />
              </div>

              <div>
                <Label className="text-sm font-medium flex items-center gap-2"><BookOpen className="h-4 w-4" /> Base de Conhecimento</Label>
                <p className="text-xs text-muted-foreground mb-2">Selecione coleções de documentos que o agente pode consultar para responder melhor.</p>
                {collections.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed text-center">
                    <p className="text-xs text-muted-foreground">Nenhuma coleção disponível.</p>
                    <p className="text-[10px] text-muted-foreground">Vá a Treinamento para adicionar documentos.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {collections.map(c => {
                      const selected = (editingAgent.training_collection_ids || []).includes(c.collection_id);
                      return (
                        <Badge
                          key={c.collection_id}
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer text-xs py-1 px-3"
                          onClick={() => toggleTrainingDoc(c.collection_id)}
                        >
                          {selected ? "✓ " : ""}{c.collection_name} ({c.doc_count} doc{c.doc_count > 1 ? "s" : ""})
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium flex items-center gap-2"><GitBranch className="h-4 w-4" /> Fluxo Padrão</Label>
                <p className="text-xs text-muted-foreground mb-2">Escolha um fluxo que o agente deve seguir automaticamente quando uma conversa começa.</p>
                <Select
                  value={editingAgent.default_flow_id || "none"}
                  onValueChange={(v) => setEditingAgent(prev => ({ ...prev, default_flow_id: v === "none" ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {flows.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ============ STEP 4: Skills ============ */}
          {step === 4 && (
            <div className="space-y-5">
              {/* Governance as simple question */}
              <div>
                <Label className="text-sm font-medium">O agente pode agir sozinho?</Label>
                <p className="text-xs text-muted-foreground mb-3">Defina o nível de autonomia do agente.</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "autonomous", label: "✅ Sim, totalmente", desc: "Executa acções sem pedir aprovação" },
                    { value: "supervised", label: "👀 Com supervisão", desc: "Pede aprovação em acções importantes" },
                    { value: "restricted", label: "🔒 Não", desc: "Apenas responde, sem executar acções" },
                  ].map(opt => (
                    <Card
                      key={opt.value}
                      className={cn(
                        "cursor-pointer transition-all hover:border-primary/50",
                        (editingAgent as any).governance_mode === opt.value && "border-primary ring-2 ring-primary/20"
                      )}
                      onClick={() => setEditingAgent(prev => ({ ...prev, governance_mode: opt.value } as any))}
                    >
                      <CardContent className="p-3">
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{opt.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Skills */}
              <div>
                <Label className="text-sm font-medium flex items-center gap-2"><Wrench className="h-4 w-4" /> Ferramentas</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  {isEditing
                    ? "Active as ferramentas que o agente pode utilizar."
                    : "Após criar o agente, poderá activar ferramentas aqui."
                  }
                </p>
                {!isEditing ? (
                  <div className="p-4 rounded-lg border border-dashed text-center">
                    <Wrench className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Crie o agente primeiro para gerir ferramentas.</p>
                    <p className="text-[10px] text-muted-foreground mt-1">As ferramentas permitem ao agente consultar dados, fazer pagamentos, executar fluxos, etc.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {SKILL_TYPES.map(skill => {
                      const existing = skills.find(s => s.skill_type === skill.type);
                      const isEnabled = existing?.is_enabled ?? false;
                      const requiresConfirm = (existing as any)?.requires_confirmation ?? false;
                      return (
                        <div key={skill.type} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{skill.icon}</span>
                            <div>
                              <p className="text-xs font-medium">{skill.label}</p>
                              <p className="text-[10px] text-muted-foreground">{skill.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {isEnabled && (editingAgent as any).governance_mode === "supervised" && (
                              <div className="flex items-center gap-1.5">
                                <Switch
                                  checked={requiresConfirm}
                                  onCheckedChange={(v) => onSkillToggle?.(`${skill.type}:confirm`, v)}
                                  className="scale-75"
                                />
                                <span className="text-[9px] text-muted-foreground whitespace-nowrap">Pedir aprovação</span>
                              </div>
                            )}
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={(v) => onSkillToggle?.(skill.type, v)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sub-agents */}
              <div>
                <Label className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Sub-agentes</Label>
                <p className="text-xs text-muted-foreground mb-2">O agente pode delegar tarefas a outros agentes da sua equipa.</p>
                {agents.filter(a => a.id !== editingAgent.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed text-center">Crie mais agentes para usar delegação.</p>
                ) : (
                  <>
                    <div className="mb-2">
                      <Label className="text-xs">Modo de delegação</Label>
                      <Select
                        value={(editingAgent as any).routing_mode || "direct"}
                        onValueChange={(v) => setEditingAgent(prev => ({ ...prev, routing_mode: v } as any))}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">Directo — responde ele próprio</SelectItem>
                          <SelectItem value="hierarchical">Manager — delega a sub-agentes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {agents.filter(a => a.id !== editingAgent.id).map(a => {
                        const selected = (editingAgent.sub_agent_ids || []).includes(a.id);
                        return (
                          <Badge
                            key={a.id}
                            variant={selected ? "default" : "outline"}
                            className="cursor-pointer text-xs py-1 px-3"
                            onClick={() => toggleSubAgent(a.id)}
                          >
                            {selected ? "✓ " : ""}{a.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ============ STEP 5: Review ============ */}
          {step === 5 && (
            <div className="space-y-5">
              {/* Summary card */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-base">{editingAgent.name || "Sem nome"}</h3>
                      <p className="text-xs text-muted-foreground">{editingAgent.description || "Sem descrição"}</p>
                    </div>
                    <Badge variant="outline">{editingAgent.agent_type === 'voice' ? '🎙️ Voz' : editingAgent.agent_type === 'hybrid' ? '💬🎙️ Híbrido' : '💬 Texto'}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div><span className="text-muted-foreground">Personalidade:</span> {editingAgent.personality_style || "professional"}</div>
                    <div><span className="text-muted-foreground">Tom:</span> {editingAgent.communication_tone || "empathetic"}</div>
                    <div><span className="text-muted-foreground">Provider:</span> {editingAgent.ai_provider || "lovable"}</div>
                    <div><span className="text-muted-foreground">Modelo:</span> {editingAgent.ai_model || "-"}</div>
                    <div><span className="text-muted-foreground">Criatividade:</span> {editingAgent.temperature ?? 0.7}</div>
                    <div><span className="text-muted-foreground">Autonomia:</span> {
                      (editingAgent as any).governance_mode === "supervised" ? "Supervisionado" :
                      (editingAgent as any).governance_mode === "restricted" ? "Restrito" : "Autónomo"
                    }</div>
                    <div><span className="text-muted-foreground">Budget:</span> {editingAgent.monthly_budget_usd ? `$${editingAgent.monthly_budget_usd}/mês` : "Ilimitado"}</div>
                    <div><span className="text-muted-foreground">Knowledge:</span> {(editingAgent.training_collection_ids || []).length} coleção(ões)</div>
                  </div>
                  {isEditing && skills.filter(s => s.is_enabled).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                      {skills.filter(s => s.is_enabled).map(s => {
                        const info = SKILL_TYPES.find(sk => sk.type === s.skill_type);
                        return <Badge key={s.skill_type} variant="secondary" className="text-[10px]">{info?.icon} {info?.label || s.skill_type}</Badge>;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Mensagem de Boas-vindas</Label>
                  <p className="text-xs text-muted-foreground mb-2">Primeira mensagem enviada ao iniciar uma conversa.</p>
                  <Textarea
                    value={editingAgent.welcome_message || ""}
                    onChange={(e) => setEditingAgent(prev => ({ ...prev, welcome_message: e.target.value }))}
                    rows={3}
                    placeholder="Ex: Olá! Sou a Sofia, como posso ajudá-lo hoje?"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Mensagem de Fallback</Label>
                  <p className="text-xs text-muted-foreground mb-2">Enviada quando o agente não sabe responder.</p>
                  <Textarea
                    value={editingAgent.fallback_message || ""}
                    onChange={(e) => setEditingAgent(prev => ({ ...prev, fallback_message: e.target.value }))}
                    rows={3}
                    placeholder="Ex: Desculpe, não consigo ajudar com isso. Vou transferir para um humano."
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingAgent.is_active ?? true}
                    onCheckedChange={(v) => setEditingAgent(prev => ({ ...prev, is_active: v }))}
                  />
                  <Label className="text-sm">Agente activo</Label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
            {step < 5 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={onSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? "Guardar Alterações" : "🚀 Criar Agente"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
