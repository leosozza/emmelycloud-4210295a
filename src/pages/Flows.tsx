import { useState, useCallback, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  ReactFlow, Controls, Background, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Node, type Edge, MarkerType, Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus, Workflow, Play, Save, Trash2, MessageSquare, Zap, ArrowLeft,
  Loader2, Clock, Bot, GitBranch, Globe, Phone, Split,
} from "lucide-react";

interface Flow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_value: string | null;
  keywords: string[];
  nodes: any[];
  edges: any[];
  is_active: boolean;
  priority: number;
  created_at: string;
}

const nodeTypes = {
  message: "Mensagem",
  condition: "Condição",
  ai_response: "Resposta IA",
  delay: "Delay",
  transfer: "Transferir",
  webhook: "Webhook",
  set_variable: "Variável",
};

const nodeIcons: Record<string, any> = {
  message: MessageSquare,
  condition: Split,
  ai_response: Bot,
  delay: Clock,
  transfer: Phone,
  webhook: Globe,
  set_variable: Zap,
};

const nodeColors: Record<string, string> = {
  message: "#3b82f6",
  condition: "#f59e0b",
  ai_response: "#8b5cf6",
  delay: "#6b7280",
  transfer: "#10b981",
  webhook: "#ef4444",
  set_variable: "#06b6d4",
};

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFlow, setNewFlow] = useState({ name: "", description: "", trigger_type: "keyword", trigger_value: "" });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => { loadFlows(); }, []);

  const loadFlows = async () => {
    setLoading(true);
    const { data } = await supabase.from("flows").select("*").order("created_at", { ascending: false });
    if (data) setFlows(data as unknown as Flow[]);
    setLoading(false);
  };

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
  }, [setEdges]);

  const addNode = (type: string) => {
    const id = `node_${Date.now()}`;
    const newNode: Node = {
      id,
      type: "default",
      position: { x: 250, y: (nodes.length + 1) * 100 },
      data: {
        label: (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: nodeColors[type] }} />
            {nodeTypes[type as keyof typeof nodeTypes] || type}
          </div>
        ),
        nodeType: type,
        config: {},
      },
      style: {
        border: `2px solid ${nodeColors[type] || "#666"}`,
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        background: "white",
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const openFlow = (flow: Flow) => {
    setSelectedFlow(flow);
    setNodes(flow.nodes || []);
    setEdges(flow.edges || []);
  };

  const handleCreateFlow = async () => {
    if (!newFlow.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("flows").insert({
        name: newFlow.name,
        description: newFlow.description || null,
        trigger_type: newFlow.trigger_type,
        trigger_value: newFlow.trigger_value || null,
        nodes: [],
        edges: [],
      } as any);
      if (error) throw error;
      toast.success("Fluxo criado");
      setDialogOpen(false);
      setNewFlow({ name: "", description: "", trigger_type: "keyword", trigger_value: "" });
      loadFlows();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFlow = async () => {
    if (!selectedFlow) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("flows").update({
        nodes: nodes as any,
        edges: edges as any,
      } as any).eq("id", selectedFlow.id);
      if (error) throw error;
      toast.success("Fluxo guardado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("flows").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Fluxo eliminado"); loadFlows(); }
    setDeleteId(null);
  };

  const toggleActive = async (flow: Flow) => {
    await supabase.from("flows").update({ is_active: !flow.is_active } as any).eq("id", flow.id);
    loadFlows();
  };

  // Editor View
  if (selectedFlow) {
    return (
      <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedFlow(null); loadFlows(); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="text-sm font-semibold">{selectedFlow.name}</h3>
              <p className="text-[11px] text-muted-foreground">{selectedFlow.description || "Sem descrição"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSaveFlow} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>

        {/* Node Palette */}
        <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30 overflow-x-auto shrink-0">
          {Object.entries(nodeTypes).map(([type, label]) => {
            const Icon = nodeIcons[type] || Zap;
            return (
              <Button key={type} variant="outline" size="sm" className="text-[11px] shrink-0" onClick={() => addNode(type)}>
                <Icon className="h-3 w-3 mr-1" style={{ color: nodeColors[type] }} />
                {label}
              </Button>
            );
          })}
        </div>

        {/* ReactFlow Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            deleteKeyCode="Delete"
          >
            <Controls />
            <MiniMap />
            <Background />
          </ReactFlow>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div>
      <PageHeader
        title="Fluxos de Automação"
        description="Crie fluxos de conversa com editor visual drag-and-drop"
      />

      <div className="flex justify-end mb-4">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Fluxo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum fluxo criado</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Criar Primeiro Fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => (
            <Card key={flow.id} className={`cursor-pointer hover:shadow-md transition-shadow ${!flow.is_active ? 'opacity-60' : ''}`} onClick={() => openFlow(flow)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      {flow.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">{flow.description || "Sem descrição"}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={flow.is_active} onCheckedChange={() => toggleActive(flow)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(flow.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{flow.trigger_type}</Badge>
                  <span className="text-[10px] text-muted-foreground">{(flow.nodes || []).length} nós • {(flow.edges || []).length} conexões</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Fluxo</DialogTitle>
            <DialogDescription>Crie um novo fluxo de automação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={newFlow.name} onChange={(e) => setNewFlow(prev => ({ ...prev, name: e.target.value }))} placeholder="Ex: Boas-vindas WhatsApp" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={newFlow.description} onChange={(e) => setNewFlow(prev => ({ ...prev, description: e.target.value }))} placeholder="Breve descrição" />
            </div>
            <div>
              <Label>Tipo de Trigger</Label>
              <Select value={newFlow.trigger_type} onValueChange={(v) => setNewFlow(prev => ({ ...prev, trigger_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="first_message">Primeira mensagem</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newFlow.trigger_type === "keyword" && (
              <div>
                <Label>Palavra-chave</Label>
                <Input value={newFlow.trigger_value} onChange={(e) => setNewFlow(prev => ({ ...prev, trigger_value: e.target.value }))} placeholder="Ex: ajuda, suporte" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateFlow} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar fluxo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser revertida.</AlertDialogDescription>
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
