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
import { Separator } from "@/components/ui/separator";
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
import { Plus, Bot, Edit, Trash2, Star, Loader2, GitBranch, BookOpen, Users, Volume2, Sparkles } from "lucide-react";
import { AgentFormDialog } from "@/components/agentes/AgentFormDialog";
import { AgentCard } from "@/components/agentes/AgentCard";
import { AgentBuilderChat } from "@/components/agentes/AgentBuilderChat";

export interface AIProvider {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  is_native: boolean;
  available_models: any[];
  credential_key: string | null;
  provider_type: string;
}

export interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  base_prompt: string | null;
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
  training_collection_ids: string[];
  sub_agent_ids: string[];
  routing_rules: any;
  voice_provider: string | null;
  voice_model: string | null;
  voice_id: string | null;
  personality_style: string | null;
  communication_tone: string | null;
  strategic_objective: string | null;
  monthly_budget_usd: number | null;
  created_at: string;
}

export interface FlowOption { id: string; name: string; }
export interface DocOption { id: string; title: string; }
export interface CollectionOption { collection_id: string; collection_name: string; doc_count: number; }

export const defaultAgent: Partial<AIAgent> = {
  name: "",
  description: "",
  system_prompt: "Você é um assistente jurídico profissional. Responda de forma clara, precisa e empática.",
  base_prompt: null,
  ai_provider: "lovable",
  ai_model: "google/gemini-3-flash-preview",
  temperature: 0.7,
  welcome_message: "Olá! Como posso ajudá-lo hoje?",
  fallback_message: "Desculpe, não consegui processar a sua mensagem. Tente novamente.",
  agent_type: "text",
  is_active: true,
  is_default: false,
  default_flow_id: null,
  training_collection_ids: [],
  sub_agent_ids: [],
  routing_rules: {},
  voice_provider: null,
  voice_model: null,
  voice_id: null,
  personality_style: "professional",
  communication_tone: "empathetic",
  strategic_objective: null,
  monthly_budget_usd: null,
};

export default function AgentesPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<Partial<AIAgent>>(defaultAgent);
  const [saving, setSaving] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [bitrixIntegration, setBitrixIntegration] = useState<{ id: string; bitrix_agent_id: string | null } | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [agentsRes, providersRes, flowsRes, docsRes, bitrixRes] = await Promise.all([
      supabase.from("ai_agents").select("*").order("created_at", { ascending: false }),
      supabase.from("ai_providers").select("*").order("name"),
      supabase.from("flows").select("id, name").order("name"),
      supabase.from("knowledge_documents").select("id, title, collection_id, collection_name").order("title"),
      supabase.from("bitrix24_integrations").select("id, bitrix_agent_id").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (agentsRes.data) setAgents(agentsRes.data as unknown as AIAgent[]);
    if (providersRes.data) setProviders(providersRes.data as unknown as AIProvider[]);
    if (flowsRes.data) setFlows(flowsRes.data as FlowOption[]);
    if (bitrixRes.data) setBitrixIntegration(bitrixRes.data as any);
    if (docsRes.data) {
      setDocs(docsRes.data as DocOption[]);
      const collMap = new Map<string, CollectionOption>();
      for (const doc of docsRes.data) {
        const cid = (doc as any).collection_id;
        const cname = (doc as any).collection_name;
        if (cid && cname) {
          const existing = collMap.get(cid);
          if (existing) {
            existing.doc_count++;
          } else {
            collMap.set(cid, { collection_id: cid, collection_name: cname, doc_count: 1 });
          }
        }
      }
      setCollections(Array.from(collMap.values()));
    }
    setLoading(false);
  };

  const syncKnowledgeDocuments = async (agentId: string, collectionIds: string[]) => {
    // Delete existing links
    await supabase.from("agent_knowledge_documents").delete().eq("agent_id", agentId);
    if (collectionIds.length === 0) return;
    // Get all document IDs for selected collections
    const { data: collectionDocs } = await supabase
      .from("knowledge_documents")
      .select("id")
      .in("collection_id", collectionIds);
    if (collectionDocs && collectionDocs.length > 0) {
      await supabase.from("agent_knowledge_documents").insert(
        collectionDocs.map((d: any) => ({ agent_id: agentId, document_id: d.id }))
      );
    }
  };

  const handleSave = async () => {
    if (!editingAgent.name?.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      let agentId = editingAgent.id;
      if (agentId) {
        const { error } = await supabase.from("ai_agents").update(editingAgent as any).eq("id", agentId);
        if (error) throw error;
        toast.success("Agente atualizado");
      } else {
        const { data, error } = await supabase.from("ai_agents").insert(editingAgent as any).select("id").single();
        if (error) throw error;
        agentId = data.id;
        toast.success("Agente criado");
      }
      // Sync agent_knowledge_documents N:N table
      await syncKnowledgeDocuments(agentId!, editingAgent.training_collection_ids || []);
      setDialogOpen(false);
      loadData();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
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

  const duplicateAgent = async (agent: AIAgent) => {
    const { id, created_at, ...rest } = agent;
    const clone = { ...rest, name: `${agent.name} (cópia)`, is_default: false };
    const { error } = await supabase.from("ai_agents").insert(clone as any);
    if (error) toast.error(error.message);
    else { toast.success("Agente duplicado"); loadData(); }
  };

  const openEdit = async (agent: AIAgent) => {
    setEditingAgent({ ...agent });
    // Load skills for this agent
    const { data: agentSkills } = await supabase
      .from("agent_skills")
      .select("skill_type, is_enabled, requires_confirmation")
      .eq("agent_id", agent.id);
    setSkills(agentSkills || []);
    setDialogOpen(true);
  };
  const openCreate = () => { setEditingAgent({ ...defaultAgent }); setSkills([]); setDialogOpen(true); };

  const handleBuilderSave = async (config: any) => {
    const { skills: skillKeys, ...agentFields } = config;
    const agentData = {
      ...agentFields,
      is_active: true,
      is_default: false,
      training_collection_ids: [],
      sub_agent_ids: [],
      routing_rules: {},
    };
    const { data, error } = await supabase.from("ai_agents").insert(agentData as any).select("id").single();
    if (error) throw error;
    // Insert skills
    if (skillKeys?.length > 0 && data?.id) {
      await supabase.from("agent_skills").insert(
        skillKeys.map((sk: string) => ({ agent_id: data.id, skill_type: sk, is_enabled: true })) as any
      );
    }
    toast.success(`Agente "${config.name}" criado com sucesso!`);
    loadData();
  };

  const handleSkillToggle = async (skillKey: string, enabled: boolean) => {
    if (!editingAgent.id) return;
    const isConfirmToggle = skillKey.endsWith(":confirm");
    const skillType = isConfirmToggle ? skillKey.replace(":confirm", "") : skillKey;

    if (isConfirmToggle) {
      // Update requires_confirmation
      await supabase.from("agent_skills").update({ requires_confirmation: enabled } as any)
        .eq("agent_id", editingAgent.id).eq("skill_type", skillType);
      setSkills(prev => prev.map(s => s.skill_type === skillType ? { ...s, requires_confirmation: enabled } : s));
    } else {
      const existing = skills.find(s => s.skill_type === skillType);
      if (existing) {
        await supabase.from("agent_skills").update({ is_enabled: enabled } as any)
          .eq("agent_id", editingAgent.id).eq("skill_type", skillType);
        setSkills(prev => prev.map(s => s.skill_type === skillType ? { ...s, is_enabled: enabled } : s));
      } else {
        await supabase.from("agent_skills").insert({ agent_id: editingAgent.id, skill_type: skillType, is_enabled: enabled } as any);
        setSkills(prev => [...prev, { skill_type: skillType, is_enabled: enabled, requires_confirmation: false }]);
      }
    }
  };

  return (
    <div>
      <PageHeader title="Agentes IA" description="Configure agentes inteligentes com diferentes personalidades e modelos de IA" />

      <div className="flex justify-end gap-2 mb-4">
        <Button variant="outline" onClick={() => setBuilderOpen(true)}>
          <Sparkles className="h-4 w-4 mr-2" /> Criar com IA
        </Button>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Novo Agente</Button>
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
            <AgentCard
              key={agent.id}
              agent={agent}
              providers={providers}
              onEdit={openEdit}
              onDelete={(id) => setDeleteId(id)}
              onToggleDefault={toggleDefault}
              onDuplicate={duplicateAgent}
            />
          ))}
        </div>
      )}

      <AgentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingAgent={editingAgent}
        setEditingAgent={setEditingAgent}
        providers={providers}
        flows={flows}
        docs={docs}
        collections={collections}
        agents={agents}
        saving={saving}
        onSave={handleSave}
        skills={skills}
        onSkillToggle={handleSkillToggle}
      />

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

      <AgentBuilderChat
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onSave={handleBuilderSave}
        flows={flows}
        collections={collections}
        agents={agents}
      />
    </div>
  );
}
