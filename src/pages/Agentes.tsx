import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Bot, Edit, Trash2, Star, Loader2, Sparkles, Brain, GitBranch } from "lucide-react";

interface AIProvider {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  is_native: boolean;
  available_models: any[];
  credential_key: string | null;
}

interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  ai_provider: string;
  ai_model: string;
  ai_base_url: string | null;
  ai_api_key_credential: string | null;
  temperature: number;
  avatar_url: string | null;
  welcome_message: string | null;
  fallback_message: string | null;
  agent_type: string;
  is_active: boolean;
  is_default: boolean;
  default_flow_id: string | null;
  created_at: string;
}

const defaultAgent: Partial<AIAgent> = {
  name: "",
  description: "",
  system_prompt: "Você é um assistente jurídico profissional. Responda de forma clara, precisa e empática.",
  ai_provider: "lovable",
  ai_model: "google/gemini-3-flash-preview",
  temperature: 0.7,
  welcome_message: "Olá! Como posso ajudá-lo hoje?",
  fallback_message: "Desculpe, não consegui processar a sua mensagem. Tente novamente.",
  agent_type: "text",
  is_active: true,
  is_default: false,
};

export default function AgentesPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<Partial<AIAgent>>(defaultAgent);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [agentsRes, providersRes] = await Promise.all([
      supabase.from("ai_agents").select("*").order("created_at", { ascending: false }),
      supabase.from("ai_providers").select("*").order("name"),
    ]);
    if (agentsRes.data) setAgents(agentsRes.data as unknown as AIAgent[]);
    if (providersRes.data) setProviders(providersRes.data as unknown as AIProvider[]);
    setLoading(false);
  };

  const selectedProvider = providers.find(p => p.slug === editingAgent.ai_provider);
  const availableModels = (selectedProvider?.available_models as any[]) || [];

  const handleSave = async () => {
    if (!editingAgent.name?.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      if (editingAgent.id) {
        const { error } = await supabase
          .from("ai_agents")
          .update(editingAgent as any)
          .eq("id", editingAgent.id);
        if (error) throw error;
        toast.success("Agente atualizado");
      } else {
        const { error } = await supabase
          .from("ai_agents")
          .insert(editingAgent as any);
        if (error) throw error;
        toast.success("Agente criado");
      }
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("ai_agents").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Agente eliminado"); loadData(); }
    setDeleteId(null);
  };

  const toggleDefault = async (agent: AIAgent) => {
    if (!agent.is_default) {
      await supabase.from("ai_agents").update({ is_default: false } as any).neq("id", agent.id);
    }
    await supabase.from("ai_agents").update({ is_default: !agent.is_default } as any).eq("id", agent.id);
    loadData();
  };

  const openEdit = (agent: AIAgent) => {
    setEditingAgent({ ...agent });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingAgent({ ...defaultAgent });
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Agentes IA"
        description="Configure agentes inteligentes com diferentes personalidades e modelos de IA"
      />

      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Agente
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum agente configurado</p>
            <Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Criar Primeiro Agente</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className={`relative ${!agent.is_active ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Bot className="h-5 w-5" />
                      </AvatarFallback>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(agent)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(agent.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge variant="outline" className="text-[10px]">{agent.ai_provider}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{agent.ai_model.split('/').pop()}</Badge>
                  <Badge variant="outline" className="text-[10px]">T: {agent.temperature}</Badge>
                  {agent.default_flow_id && <Badge variant="outline" className="text-[10px]"><GitBranch className="h-2 w-2 mr-1" />Flow</Badge>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{agent.is_active ? "Ativo" : "Inativo"}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => toggleDefault(agent)}>
                      {agent.is_default ? "Padrão ★" : "Definir padrão"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent.id ? "Editar Agente" : "Novo Agente"}</DialogTitle>
            <DialogDescription>Configure a personalidade, modelo de IA e comportamento do agente.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome *</Label>
                <Input value={editingAgent.name || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, name: e.target.value }))} placeholder="Ex: Assistente Jurídico" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={editingAgent.agent_type || "text"} onValueChange={(v) => setEditingAgent(prev => ({ ...prev, agent_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="voice">Voz</SelectItem>
                    <SelectItem value="hybrid">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Input value={editingAgent.description || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, description: e.target.value }))} placeholder="Breve descrição do agente" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Provider de IA</Label>
                <Select value={editingAgent.ai_provider || "lovable"} onValueChange={(v) => {
                  const prov = providers.find(p => p.slug === v);
                  const firstModel = (prov?.available_models as any[])?.[0]?.name || "";
                  setEditingAgent(prev => ({ ...prev, ai_provider: v, ai_model: firstModel, ai_base_url: prov?.base_url || "" }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {providers.map(p => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name} {p.is_native && <Badge className="ml-1 text-[8px]">nativo</Badge>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modelo</Label>
                <Select value={editingAgent.ai_model || ""} onValueChange={(v) => setEditingAgent(prev => ({ ...prev, ai_model: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableModels.map((m: any) => (
                      <SelectItem key={m.name} value={m.name}>{m.display || m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!selectedProvider?.is_native && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>URL Base da API</Label>
                  <Input value={editingAgent.ai_base_url || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, ai_base_url: e.target.value }))} placeholder="https://api.example.com/v1/chat/completions" />
                </div>
                <div>
                  <Label>Chave API (credential_key)</Label>
                  <Input value={editingAgent.ai_api_key_credential || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, ai_api_key_credential: e.target.value }))} placeholder="Nome da credencial na tabela integration_credentials" />
                </div>
              </div>
            )}

            <div>
              <Label>System Prompt</Label>
              <Textarea
                value={editingAgent.system_prompt || ""}
                onChange={(e) => setEditingAgent(prev => ({ ...prev, system_prompt: e.target.value }))}
                rows={6}
                placeholder="Instruções de comportamento do agente..."
              />
            </div>

            <div>
              <Label>Temperatura: {editingAgent.temperature}</Label>
              <Slider
                value={[editingAgent.temperature || 0.7]}
                onValueChange={([v]) => setEditingAgent(prev => ({ ...prev, temperature: v }))}
                min={0} max={2} step={0.1}
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mensagem de Boas-vindas</Label>
                <Textarea value={editingAgent.welcome_message || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, welcome_message: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>Mensagem de Fallback</Label>
                <Textarea value={editingAgent.fallback_message || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, fallback_message: e.target.value }))} rows={2} />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={editingAgent.is_active ?? true} onCheckedChange={(v) => setEditingAgent(prev => ({ ...prev, is_active: v }))} />
                <Label>Ativo</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingAgent.id ? "Guardar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar agente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser revertida. O agente e todo o seu histórico serão eliminados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
