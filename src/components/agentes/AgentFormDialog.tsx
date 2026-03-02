import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, GitBranch, BookOpen, Users, Volume2 } from "lucide-react";
import type { AIAgent, AIProvider, FlowOption, DocOption, CollectionOption } from "@/pages/Agentes";

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
}

export function AgentFormDialog({
  open, onOpenChange, editingAgent, setEditingAgent,
  providers, flows, docs, collections, agents, saving, onSave,
}: AgentFormDialogProps) {
  const textProviders = providers.filter(p => p.provider_type === 'text' || p.provider_type === 'multimodal');
  const voiceProviders = providers.filter(p => p.provider_type === 'voice' || p.provider_type === 'multimodal');

  const selectedTextProvider = textProviders.find(p => p.slug === editingAgent.ai_provider);
  const selectedVoiceProvider = voiceProviders.find(p => p.slug === editingAgent.voice_provider);

  const textModels = (selectedTextProvider?.available_models as any[]) || [];
  const voiceModels = (selectedVoiceProvider?.available_models as any[]) || [];

  const showVoiceSection = editingAgent.agent_type === 'voice' || editingAgent.agent_type === 'hybrid';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingAgent.id ? "Editar Agente" : "Novo Agente"}</DialogTitle>
          <DialogDescription>Configure a personalidade, modelo de IA e comportamento do agente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome *</Label>
              <Input value={editingAgent.name || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, name: e.target.value }))} placeholder="Ex: Assistente Jurídico" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={editingAgent.agent_type || "text"} onValueChange={(v) => {
                setEditingAgent(prev => ({
                  ...prev,
                  agent_type: v,
                  ...(v === 'text' ? { voice_provider: null, voice_model: null, voice_id: null } : {}),
                }));
              }}>
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

          {/* Text Provider + Model */}
          <Separator />
          <h4 className="text-sm font-semibold">Provider de Texto/Chat</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Provider</Label>
              <Select value={editingAgent.ai_provider || "lovable"} onValueChange={(v) => {
                const prov = textProviders.find(p => p.slug === v);
                const firstModel = (prov?.available_models as any[])?.[0]?.name || "";
                setEditingAgent(prev => ({ ...prev, ai_provider: v, ai_model: firstModel, ai_base_url: prov?.base_url || "" }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {textProviders.map(p => (
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
                  {textModels.map((m: any) => (
                    <SelectItem key={m.name} value={m.name}>{m.display || m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedTextProvider?.is_native && selectedTextProvider?.credential_key && selectedTextProvider.credential_key !== "base_url" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>URL Base da API</Label>
                <Input value={editingAgent.ai_base_url || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, ai_base_url: e.target.value }))} placeholder="https://api.example.com/v1/chat/completions" />
              </div>
              <div>
                <Label>Credencial ({selectedTextProvider.credential_key})</Label>
                <Input value={editingAgent.ai_api_key_credential || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, ai_api_key_credential: e.target.value }))} placeholder={`Nome na Central de Integrações`} />
              </div>
            </div>
          )}
          {!selectedTextProvider?.is_native && selectedTextProvider?.credential_key === "base_url" && (
            <p className="text-xs text-muted-foreground">✓ URL e credenciais geridas automaticamente via Central de Integrações.</p>
          )}

          {/* Voice Provider + Model (conditional) */}
          {showVoiceSection && (
            <>
              <Separator />
              <h4 className="text-sm font-semibold flex items-center gap-2"><Volume2 className="h-4 w-4" /> Provider de Voz</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Provider de Voz</Label>
                  <Select value={editingAgent.voice_provider || "none"} onValueChange={(v) => {
                    if (v === "none") {
                      setEditingAgent(prev => ({ ...prev, voice_provider: null, voice_model: null, voice_id: null }));
                    } else {
                      const prov = voiceProviders.find(p => p.slug === v);
                      const firstModel = (prov?.available_models as any[])?.[0]?.name || "";
                      setEditingAgent(prev => ({ ...prev, voice_provider: v, voice_model: firstModel }));
                    }
                  }}>
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
                  <Select value={editingAgent.voice_model || ""} onValueChange={(v) => setEditingAgent(prev => ({ ...prev, voice_model: v }))} disabled={!editingAgent.voice_provider}>
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
                <Input value={editingAgent.voice_id || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, voice_id: e.target.value }))} placeholder="Ex: EXAVITQu4vr4xnSDxMaL (ElevenLabs Voice ID)" />
              </div>
            </>
          )}

          {/* System Prompt */}
          <Separator />
          <div>
            <Label>System Prompt</Label>
            <Textarea value={editingAgent.system_prompt || ""} onChange={(e) => setEditingAgent(prev => ({ ...prev, system_prompt: e.target.value }))} rows={6} placeholder="Instruções de comportamento do agente..." />
          </div>

          <div>
            <Label>Temperatura: {editingAgent.temperature}</Label>
            <Slider value={[editingAgent.temperature || 0.7]} onValueChange={([v]) => setEditingAgent(prev => ({ ...prev, temperature: v }))} min={0} max={2} step={0.1} className="mt-2" />
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

          {/* Vinculações */}
          <Separator />
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><GitBranch className="h-4 w-4" /> Vinculações</h4>

            <div className="space-y-1 mb-4">
              <Label className="text-xs">Fluxo padrão</Label>
              <Select value={editingAgent.default_flow_id || "none"} onValueChange={(v) => setEditingAgent(prev => ({ ...prev, default_flow_id: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {flows.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 mb-4">
              <Label className="text-xs flex items-center gap-1"><BookOpen className="h-3 w-3" /> Base de conhecimento (Coleções)</Label>
              {collections.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">Nenhuma coleção disponível. Adicione em Treinamento.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {collections.map(c => {
                    const selected = (editingAgent.training_collection_ids || []).includes(c.collection_id);
                    return (
                      <Badge key={c.collection_id} variant={selected ? "default" : "outline"} className="text-[10px] cursor-pointer" onClick={() => toggleTrainingDoc(c.collection_id)}>
                        {selected ? "✓ " : ""}{c.collection_name} ({c.doc_count} doc{c.doc_count > 1 ? "s" : ""})
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Sub-agentes</Label>
              {agents.filter(a => a.id !== editingAgent.id).length === 0 ? (
                <p className="text-[10px] text-muted-foreground">Crie mais agentes para delegar tarefas.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {agents.filter(a => a.id !== editingAgent.id).map(a => {
                    const selected = (editingAgent.sub_agent_ids || []).includes(a.id);
                    return (
                      <Badge key={a.id} variant={selected ? "default" : "outline"} className="text-[10px] cursor-pointer" onClick={() => toggleSubAgent(a.id)}>
                        {selected ? "✓ " : ""}{a.name}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingAgent.id ? "Guardar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
