import { useEffect, useState, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ReactFlow, Controls, Background, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Node, MarkerType, Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CustomFlowNode from "@/components/flows/CustomFlowNode";
import FlowNodePalette from "@/components/flows/FlowNodePalette";
import NodeConfigPanel from "@/components/flows/NodeConfigPanel";
import { type FlowNodeType, type FlowNodeData, getDefaultData } from "@/components/flows/FlowNodeTypes";
import { useFlowHistory } from "@/hooks/useFlowHistory";
import {
  Loader2, Bot, Send, RotateCcw, Sparkles, RefreshCw,
  Zap, FileText, Globe, Upload, Brain, Trash2, Eye, Plus,
  ArrowLeft, Save, Undo2, Redo2, Download, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const customNodeTypes = { custom: CustomFlowNode };

interface IntegrationData {
  integration: {
    id: string;
    member_id: string;
    domain: string;
    connector_registered: boolean;
    connector_active: boolean;
    updated_at: string;
  } | null;
  channels: Array<{
    channel: string;
    line_id: number;
    line_name: string;
    is_active: boolean;
  }>;
  recent_logs: Array<{
    event_type: string;
    direction: string;
    created_at: string;
    error: string | null;
  }>;
}

// ==================== MAIN COMPONENT ====================

const Bitrix24App = () => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [integrationData, setIntegrationData] = useState<IntegrationData | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://api.bitrix24.com/api/v1/";
    script.onload = () => {
      try {
        // @ts-ignore
        if (window.BX24) {
          // @ts-ignore
          window.BX24.init(() => {
            // @ts-ignore
            const auth = window.BX24.getAuth();
            if (auth?.member_id) {
              setMemberId(auth.member_id);
              fetchIntegrationData(auth.member_id);
            }
            setStatus("ready");
          });
        } else {
          setStatus("ready");
        }
      } catch {
        setStatus("ready");
      }
    };
    script.onerror = () => setStatus("ready");
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  const fetchIntegrationData = useCallback(async (mid: string) => {
    setLoadingData(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-connector-settings?member_id=${mid}&format=json`);
      if (res.ok) setIntegrationData(await res.json());
    } catch (e) {
      console.error("[BITRIX24] Fetch error:", e);
    } finally {
      setLoadingData(false);
    }
  }, []);

  const handleResync = async () => {
    if (!memberId) return;
    // @ts-ignore
    const auth = window.BX24?.getAuth?.();
    if (!auth) return;
    setLoadingData(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: {
            access_token: auth.access_token,
            refresh_token: auth.refresh_token,
            member_id: auth.member_id,
            domain: auth.domain,
            expires_in: String(auth.expires || 3600),
          },
          member_id: auth.member_id,
        }),
      });
      await fetchIntegrationData(memberId);
    } catch (e) {
      console.error("[BITRIX24] Resync error:", e);
    } finally {
      setLoadingData(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  const integration = integrationData?.integration;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--accent))] to-[hsl(var(--primary))] p-4 rounded-b-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-white font-extrabold text-lg">
            E
          </div>
          <div className="flex-1">
            <h2 className="text-white font-bold text-base">Emmely Cloud</h2>
            <Badge variant={integration?.connector_active ? "default" : "destructive"} className="text-[10px] mt-1">
              <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", integration?.connector_active ? "bg-green-300" : "bg-red-300")} />
              {integration?.connector_active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="connector" className="p-3">
        <TabsList className="w-full grid grid-cols-6 h-auto">
          <TabsTrigger value="connector" className="text-[11px] py-1.5">⚡ Conector</TabsTrigger>
          <TabsTrigger value="agentes" className="text-[11px] py-1.5">🤖 Agentes</TabsTrigger>
          <TabsTrigger value="training" className="text-[11px] py-1.5">📚 Training</TabsTrigger>
          <TabsTrigger value="flows" className="text-[11px] py-1.5">🔀 Flows</TabsTrigger>
          <TabsTrigger value="playground" className="text-[11px] py-1.5">💬 Playground</TabsTrigger>
          <TabsTrigger value="pagamentos" className="text-[11px] py-1.5">💳 Pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="connector">
          <ConnectorTab integration={integration} channels={integrationData?.channels || []} logs={integrationData?.recent_logs || []} loading={loadingData} onResync={handleResync} />
        </TabsContent>
        <TabsContent value="agentes"><AgentesTab /></TabsContent>
        <TabsContent value="training"><TrainingTab /></TabsContent>
        <TabsContent value="flows"><FlowsTab /></TabsContent>
        <TabsContent value="playground"><PlaygroundTab /></TabsContent>
        <TabsContent value="pagamentos"><PagamentosTab /></TabsContent>
      </Tabs>
    </div>
  );
};

// ==================== CONNECTOR TAB ====================
function ConnectorTab({ integration, channels, logs, loading, onResync }: {
  integration: IntegrationData["integration"];
  channels: IntegrationData["channels"];
  logs: IntegrationData["recent_logs"];
  loading: boolean;
  onResync: () => void;
}) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Status da Integração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {integration ? (
            <>
              <InfoRow label="Portal" value={integration.domain || integration.member_id} />
              <InfoRow label="Conector" value={integration.connector_registered ? "✅ Registado" : "❌ Não registado"} />
              <InfoRow label="Status" value={integration.connector_active ? "🟢 Ativo" : "🔴 Inativo"} />
              <InfoRow label="Última atualização" value={new Date(integration.updated_at).toLocaleString()} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Integração não encontrada. Reinstale o aplicativo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Canais Configurados</CardTitle>
        </CardHeader>
        <CardContent>
          {channels.length > 0 ? (
            <div className="space-y-1.5">
              {channels.map((ch, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <span>{ch.channel === "whatsapp" ? "📱" : "📸"}</span>
                    <span className="font-medium">{ch.channel === "whatsapp" ? "WhatsApp" : "Instagram"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{ch.line_name || `Line ${ch.line_id}`}</span>
                    <span className={cn("w-2 h-2 rounded-full", ch.is_active ? "bg-green-500" : "bg-red-500")} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum canal mapeado.</p>
          )}
        </CardContent>
      </Card>

      <Button onClick={onResync} disabled={loading} className="w-full">
        {loading ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Sincronizando...</> : <><RefreshCw className="h-3.5 w-3.5 mr-2" /> Re-sincronizar Conector</>}
      </Button>

      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Últimos Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-48">
              {logs.map((log, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-muted flex items-center justify-center text-[10px]">
                      {log.direction === "inbound" ? "📥" : "📤"}
                    </span>
                    <span>{log.event_type}</span>
                    {log.error && <span className="text-destructive text-[10px]">⚠️</span>}
                  </div>
                  <span className="text-muted-foreground text-[10px]">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-800 dark:text-blue-200">
        ℹ️ Para gerenciar conversas, acesse o <strong>Contact Center</strong> do Bitrix24 e selecione o conector <strong>Emmely Messages</strong>.
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50 text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ==================== AGENTES TAB ====================
function AgentesTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview", temperature: 0.7, welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem." });
  const [saving, setSaving] = useState(false);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setAgents(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { name: form.name, system_prompt: form.system_prompt, ai_model: form.ai_model, temperature: form.temperature, welcome_message: form.welcome_message, fallback_message: form.fallback_message, ai_provider: "lovable", agent_type: "text" };
      const url = editing?.id ? `${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${editing.id}` : `${SUPABASE_URL}/rest/v1/ai_agents`;
      await fetch(url, {
        method: editing?.id ? "PATCH" : "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body),
      });
      setEditing(null);
      fetchAgents();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSetDefault = async (id: string) => {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?is_default=eq.true`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_default: false }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_default: true }),
    });
    fetchAgents();
  };

  const startEdit = (agent: any) => {
    setEditing(agent);
    setForm({ name: agent.name || "", system_prompt: agent.system_prompt || "", ai_model: agent.ai_model || "google/gemini-3-flash-preview", temperature: agent.temperature || 0.7, welcome_message: agent.welcome_message || "", fallback_message: agent.fallback_message || "" });
  };

  return (
    <div className="space-y-3">
      <Button onClick={() => { setEditing({}); setForm({ name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview", temperature: 0.7, welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem." }); }} className="w-full">
        <Plus className="h-3.5 w-3.5 mr-2" /> Novo Agente
      </Button>

      {editing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{editing.id ? "✏️ Editar Agente" : "✨ Novo Agente"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs">Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do agente" /></div>
            <div>
              <Label className="text-xs">Modelo IA</Label>
              <Select value={form.ai_model} onValueChange={(v) => setForm({ ...form, ai_model: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google/gemini-3-flash-preview">Gemini 3 Flash</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                  <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Temperatura ({form.temperature})</Label>
              <input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })} className="w-full mt-1" />
            </div>
            <div><Label className="text-xs">System Prompt</Label><Textarea value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} rows={5} placeholder="Instruções para o agente..." /></div>
            <div><Label className="text-xs">Mensagem de Boas-Vindas</Label><Input value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} /></div>
            <div><Label className="text-xs">Mensagem de Fallback</Label><Input value={form.fallback_message} onChange={(e) => setForm({ ...form, fallback_message: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !form.name} className="flex-1">{saving ? "Salvando..." : "💾 Salvar"}</Button>
              <Button variant="outline" onClick={() => setEditing(null)} className="flex-1">Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Agentes Configurados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : agents.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum agente criado.</p>
          ) : (
            <div className="space-y-2">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 bg-muted rounded-xl">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {a.name?.charAt(0)?.toUpperCase() || "A"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm truncate">{a.name}</span>
                        {a.is_default && <Badge variant="secondary" className="text-[9px]">⭐ Default</Badge>}
                        {!a.is_active && <Badge variant="destructive" className="text-[9px]">Inativo</Badge>}
                      </div>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline" className="text-[9px]">{a.ai_model?.split("/").pop()}</Badge>
                        <Badge variant="outline" className="text-[9px]">T={a.temperature}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!a.is_default && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSetDefault(a.id)} title="Definir default">⭐</Button>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(a)} title="Editar">✏️</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== TRAINING TAB ====================
function TrainingTab() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", source_type: "text", source_url: "" });
  const [saving, setSaving] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?select=*&order=created_at.desc&limit=50`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setDocs(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleSave = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const body: any = { title: form.title, source_type: form.source_type, status: "ready" };
      if (form.source_type === "text") body.content = form.content;
      if (form.source_type === "url") body.source_url = form.source_url;

      await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body),
      });

      if (form.source_type === "text" && form.content) {
        const docRes = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?select=id&order=created_at.desc&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        const newDocs = await docRes.json();
        if (newDocs[0]) {
          await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks`, {
            method: "POST",
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ document_id: newDocs[0].id, content: form.content, chunk_index: 0, tokens_count: Math.ceil(form.content.length / 4) }),
          });
        }
      }

      setShowForm(false);
      setForm({ title: "", content: "", source_type: "text", source_url: "" });
      fetchDocs();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <Button onClick={() => setShowForm(!showForm)} variant={showForm ? "secondary" : "default"} className="w-full">
        {showForm ? "✕ Cancelar" : <><Plus className="h-3.5 w-3.5 mr-2" /> Novo Documento</>}
      </Button>

      {showForm && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">📝 Adicionar Conhecimento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs">Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título do documento" /></div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.source_type} onValueChange={(v) => setForm({ ...form, source_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.source_type === "text" && (
              <div><Label className="text-xs">Conteúdo</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} placeholder="Cole aqui o conteúdo de treino..." /></div>
            )}
            {form.source_type === "url" && (
              <div><Label className="text-xs">URL</Label><Input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://..." /></div>
            )}
            <Button onClick={handleSave} disabled={saving || !form.title} className="w-full">{saving ? "Salvando..." : "💾 Salvar Documento"}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">📚 Documentos de Conhecimento</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : docs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum documento adicionado.</p>
          ) : (
            <div className="space-y-1.5">
              {docs.map((d) => (
                <div key={d.id} className="p-2.5 bg-muted rounded-lg text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium truncate">{d.title}</span>
                    <div className="flex gap-1 items-center">
                      <Badge variant="outline" className="text-[9px]">{d.source_type === "url" ? "🔗 URL" : "📝 Texto"}</Badge>
                      <Badge variant={d.status === "ready" ? "default" : "secondary"} className="text-[9px]">{d.status}</Badge>
                    </div>
                  </div>
                  {d.chunks_count > 0 && <p className="text-muted-foreground text-[10px] mt-1">{d.chunks_count} chunks</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== FLOWS TAB (with ReactFlow editor) ====================
function FlowsTab() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { pushState, undo, redo, canUndo, canRedo } = useFlowHistory(nodes, edges, setNodes as any, setEdges as any);

  const selectedNodeData = selectedNodeId ? (nodes.find(n => n.id === selectedNodeId)?.data as unknown as FlowNodeData | null) : null;

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/flows?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setFlows(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchFlows(); }, []);

  const toggleActive = async (id: string, current: boolean) => {
    await fetch(`${SUPABASE_URL}/rest/v1/flows?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: !current }),
    });
    fetchFlows();
  };

  const openFlow = (flow: any) => {
    setSelectedFlow(flow);
    const convertedNodes = (flow.nodes || []).map((n: any) => ({
      ...n,
      type: n.type === "default" ? "custom" : (n.type || "custom"),
      data: n.data?.nodeType ? n.data : { nodeType: n.data?.nodeType || "message", ...n.data },
    }));
    setNodes(convertedNodes);
    setEdges(flow.edges || []);
    setSelectedNodeId(null);
    setTimeout(pushState, 50);
  };

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    setTimeout(pushState, 0);
  }, [setEdges, pushState]);

  const addNode = useCallback((type: FlowNodeType, position?: { x: number; y: number }) => {
    const id = `node_${Date.now()}`;
    const pos = position || { x: 250, y: (nodes.length + 1) * 120 };
    const data = getDefaultData(type);
    const newNode: Node = { id, type: "custom", position: pos, data: data as any };
    setNodes((nds) => [...nds, newNode]);
    setTimeout(pushState, 0);
  }, [nodes.length, setNodes, pushState]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow-type") as FlowNodeType;
    if (!type) return;
    const bounds = (event.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    if (!bounds) return;
    addNode(type, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  }, [addNode]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeClick = useCallback((_: any, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const handleNodeDataChange = useCallback((newData: FlowNodeData) => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: newData as any } : n));
    setTimeout(pushState, 100);
  }, [selectedNodeId, setNodes, pushState]);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setTimeout(pushState, 0);
  }, [selectedNodeId, setNodes, setEdges, pushState]);

  const handleSaveFlow = async () => {
    if (!selectedFlow) return;
    setSaving(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/flows?id=eq.${selectedFlow.id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ nodes, edges }),
      });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // Editor view
  if (selectedFlow) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
        <div className="flex items-center justify-between p-2 border-b bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedFlow(null); setSelectedNodeId(null); fetchFlows(); }}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <div>
              <h3 className="text-xs font-semibold">{selectedFlow.name}</h3>
              <p className="text-[10px] text-muted-foreground">{selectedFlow.description || "Sem descrição"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={undo} disabled={!canUndo}><Undo2 className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={redo} disabled={!canRedo}><Redo2 className="h-3 w-3" /></Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSaveFlow} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> {saving ? "..." : "Guardar"}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex relative">
          <FlowNodePalette collapsed={false} onToggleCollapse={() => {}} onAddNode={(type) => addNode(type)} />

          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={customNodeTypes}
              fitView
            >
              <Controls />
              <Background />
              <MiniMap className="!bottom-2 !right-2" style={{ height: 80, width: 120 }} />
            </ReactFlow>
          </div>

          {selectedNodeData && (
            <NodeConfigPanel
              data={selectedNodeData}
              onChange={handleNodeDataChange}
              onDelete={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>
      </div>
    );
  }

  // Flow list view
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">🔀 Fluxos de Automação</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : flows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum fluxo criado.</p>
          ) : (
            <div className="space-y-1.5">
              {flows.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => openFlow(f)}>
                  <div>
                    <span className="font-semibold text-sm">{f.name}</span>
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-[9px]">{f.trigger_type}</Badge>
                      <Badge variant="outline" className="text-[9px]">{f.flow_type}</Badge>
                      {f.keywords?.length > 0 && <Badge variant="outline" className="text-[9px]">🏷️ {f.keywords.join(", ")}</Badge>}
                    </div>
                  </div>
                  <Button variant={f.is_active ? "default" : "secondary"} size="sm" className="text-[10px] h-6" onClick={(e) => { e.stopPropagation(); toggleActive(f.id, f.is_active); }}>
                    {f.is_active ? "✅ Ativo" : "❌ Inativo"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== PLAYGROUND TAB ====================
function PlaygroundTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=id,name,is_default,is_active&is_active=eq.true&order=is_default.desc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(data => {
      setAgents(data || []);
      if (data?.length > 0) setSelectedAgent(data[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedAgent || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ agent_id: selectedAgent, messages: newMessages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.content || data.error || "Erro ao processar." }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Erro de conexão." }]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Agente</Label>
        <Select value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); setMessages([]); }}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
          <SelectContent>
            {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name} {a.is_default ? "⭐" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="flex flex-col" style={{ height: "calc(100vh - 320px)" }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Envie uma mensagem para testar o agente...</p>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md"
              )}>
                <p className="whitespace-pre-wrap text-xs">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-2.5">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Digite uma mensagem..."
              disabled={loading}
              className="flex-1 text-xs"
            />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim() || loading}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {messages.length > 0 && (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setMessages([])}>
          <RotateCcw className="h-3 w-3 mr-1.5" /> Limpar conversa
        </Button>
      )}
    </div>
  );
}

// ==================== PAGAMENTOS TAB ====================
function PagamentosTab() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", currency: "EUR", payment_method: "card", customer_name: "", customer_email: "", description: "" });

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-status?list=true`, { headers: { "Content-Type": "application/json" } });
      if (res.ok) { const data = await res.json(); setTransactions(data.transactions || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setCreating(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount), currency: form.currency, payment_method: form.payment_method,
          description: form.description || "Cobrança Emmely Cloud",
          customer_data: { name: form.customer_name, email: form.customer_email, country: form.currency === "BRL" ? "Brasil" : "Portugal" },
        }),
      });
      const data = await res.json();
      if (data.ok) { setShowForm(false); setForm({ amount: "", currency: "EUR", payment_method: "card", customer_name: "", customer_email: "", description: "" }); fetchTransactions(); }
    } catch (e: any) { console.error(e); }
    setCreating(false);
  };

  const statusStyles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    confirmed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    received: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    canceled: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-3">
      <Button onClick={() => setShowForm(!showForm)} variant={showForm ? "secondary" : "default"} className="w-full">
        {showForm ? "✕ Cancelar" : <><Plus className="h-3.5 w-3.5 mr-2" /> Nova Cobrança</>}
      </Button>

      {showForm && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">💳 Nova Cobrança</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nome</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
              <div><Label className="text-xs">Email</Label><Input value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} /></div>
              <div><Label className="text-xs">Valor</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v, payment_method: v === "BRL" ? "pix" : "card" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">🇪🇺 EUR</SelectItem>
                    <SelectItem value="BRL">🇧🇷 BRL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Método</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {form.currency === "BRL" ? (
                      <><SelectItem value="pix">PIX</SelectItem><SelectItem value="boleto">Boleto</SelectItem><SelectItem value="card">Cartão</SelectItem></>
                    ) : (
                      <SelectItem value="card">Cartão</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full">{creating ? "Criando..." : "💳 Criar Cobrança"}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">💰 Transações Recentes</CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchTransactions} disabled={loading}><RefreshCw className="h-3 w-3" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma transação.</p>
          ) : (
            <ScrollArea className="max-h-72">
              <div className="space-y-1.5">
                {transactions.map((tx: any) => (
                  <div key={tx.id} className="p-2.5 bg-muted rounded-lg text-xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{tx.currency} {Number(tx.amount).toFixed(2)}</span>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", statusStyles[tx.status] || "bg-muted text-muted-foreground")}>{tx.status}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">{tx.gateway === "stripe" ? "🟣 Stripe" : "🟢 Asaas"}</span>
                    </div>
                    <div className="text-muted-foreground text-[10px] mt-1 flex gap-2">
                      <span>{tx.payment_method}</span>
                      <span>{new Date(tx.created_at).toLocaleString()}</span>
                      {tx.payment_url && <a href={tx.payment_url} target="_blank" rel="noopener noreferrer" className="text-primary">🔗 Link</a>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Bitrix24App;
