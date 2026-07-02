import { useState, useCallback, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ReactFlow, Controls, Background, MiniMap, BackgroundVariant,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Node, type Edge, MarkerType, Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus, Workflow, Save, Trash2, ArrowLeft,
  Loader2, GitBranch, Upload, Undo2, Redo2, Download, Copy,
  Bot, Zap, Shuffle, Calendar, Clock, Tag, ArrowRightLeft, Bell,
  ShieldCheck, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { previewPowerBotFlow, convertPowerBotFlow, type PowerBotImportPreview } from "@/lib/powerbotImporter";
import CustomFlowNode from "@/components/flows/CustomFlowNode";
import AddNodeOnEdge from "@/components/flows/AddNodeOnEdge";
import FlowNodePalette from "@/components/flows/FlowNodePalette";
import NodeConfigPanel from "@/components/flows/NodeConfigPanel";
import { type FlowNodeType, type FlowNodeData, getDefaultData, NODE_TYPE_META } from "@/components/flows/FlowNodeTypes";
import { useFlowHistory } from "@/hooks/useFlowHistory";
import { FLOW_TEMPLATES, type FlowTemplate } from "@/lib/flowTemplates";
import { getLayoutedElements } from "@/lib/flowLayout";

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
  flow_type?: string;
  trigger_config?: any;
}

const customNodeTypes = { custom: CustomFlowNode };
const customEdgeTypes = { custom: AddNodeOnEdge };

const FLOW_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  flow: { label: "Fluxo", color: "bg-blue-500/10 text-blue-700" },
  ai: { label: "IA", color: "bg-purple-500/10 text-purple-700" },
  hybrid: { label: "Híbrido", color: "bg-amber-500/10 text-amber-700" },
};

const TRIGGER_LABELS: Record<string, string> = {
  keyword: "Palavra-chave",
  first_message: "Primeira mensagem",
  manual: "Manual",
  webhook: "Webhook",
  bitrix_event: "Evento Bitrix24",
  schedule: "Agendamento",
  inactivity: "Inatividade",
  tag: "Tag",
  department_transfer: "Transferência",
};

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFlow, setNewFlow] = useState({ name: "", description: "", trigger_type: "keyword", trigger_value: "", flow_type: "hybrid", trigger_config: {} as any });
  const [createTab, setCreateTab] = useState<"template" | "scratch">("template");
  const [importPreview, setImportPreview] = useState<PowerBotImportPreview | null>(null);
  const [importJson, setImportJson] = useState<any>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Editor state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);

  const { pushState, undo, redo, canUndo, canRedo } = useFlowHistory(nodes, edges, setNodes as any, setEdges as any);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    return node ? (node.data as unknown as FlowNodeData) : null;
  }, [nodes, selectedNodeId]);

  useEffect(() => { loadFlows(); }, []);

  const loadFlows = async () => {
    setLoading(true);
    const { data } = await supabase.from("flows").select("*").order("created_at", { ascending: false });
    if (data) setFlows(data as unknown as Flow[]);
    setLoading(false);
  };

  const handleInsertNode = useCallback((edgeId: string, type: FlowNodeType = "message") => {
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return;
    const position = {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2,
    };
    const newNodeId = `node_${Date.now()}`;
    const newNode: Node = { 
      id: newNodeId, 
      type: "custom", 
      position, 
      data: getDefaultData(type) as any 
    };
    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => {
      const filtered = eds.filter(e => e.id !== edgeId);
      return [
        ...filtered,
        { 
          id: `e_${edge.source}-${newNodeId}`, 
          source: edge.source, 
          target: newNodeId, 
          type: "custom", 
          data: { onInsertNode: handleInsertNode },
          markerEnd: { type: MarkerType.ArrowClosed } 
        },
        { 
          id: `e_${newNodeId}-${edge.target}`, 
          source: newNodeId, 
          target: edge.target, 
          type: "custom", 
          data: { onInsertNode: handleInsertNode },
          markerEnd: { type: MarkerType.ArrowClosed } 
        },
      ];
    });
    setSelectedNodeId(newNodeId);
    setTimeout(pushState, 50);
  }, [nodes, edges, setNodes, setEdges, pushState]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ 
      ...params, 
      type: "custom",
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { onInsertNode: handleInsertNode }
    }, eds));
    setTimeout(pushState, 0);
  }, [setEdges, pushState, handleInsertNode]);

  const onValidate = useCallback(() => {
    let errorCount = 0;
    const newNodes = nodes.map(node => {
      const data = node.data as unknown as FlowNodeData;
      const errors: string[] = [];

      // Basic validation rules
      if (["message", "message_buttons", "message_list"].includes(data.nodeType) && !data.message?.trim()) {
        errors.push("Mensagem vazia");
      }
      if (data.nodeType === "webhook_call" && !data.webhook?.url?.trim()) {
        errors.push("URL do Webhook ausente");
      }
      if (data.nodeType === "condition" && (!data.condition?.field || !data.condition?.value)) {
        errors.push("Condição mal configurada");
      }
      if (data.nodeType === "input_capture" && !data.inputCapture?.variableName) {
        errors.push("Nome da variável ausente");
      }
      if (data.nodeType === "crew_task" && !data.crewTask?.crewId) {
        errors.push("Nenhuma equipe selecionada");
      }

      // Check for disconnected outputs (except for "end" nodes)
      if (data.nodeType !== "end") {
        const hasOutgoing = edges.some(e => e.source === node.id);
        if (!hasOutgoing) {
          errors.push("Beco sem saída (sem conexão de saída)");
        }
      }

      if (errors.length > 0) errorCount++;
      return { ...node, data: { ...data, error: errors.length > 0 ? errors[0] : null } };
    });

    setNodes(newNodes);
    if (errorCount > 0) {
      toast.error(`Encontrados ${errorCount} blocos com problemas`, {
        description: "Os blocos problemáticos foram destacados em vermelho."
      });
    } else {
      toast.success("Fluxo validado com sucesso!", {
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />
      });
    }
  }, [nodes, edges, setNodes]);

  const onLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges);
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
    setTimeout(pushState, 0);
    toast.success("Fluxo organizado");
  }, [nodes, edges, setNodes, setEdges, pushState]);

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
    const reactFlowBounds = (event.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    if (!reactFlowBounds) return;
    const position = { x: event.clientX - reactFlowBounds.left, y: event.clientY - reactFlowBounds.top };
    addNode(type, position);
  }, [addNode]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeClick = useCallback((_: any, node: Node) => { setSelectedNodeId(node.id); }, []);
  const onPaneClick = useCallback(() => { setSelectedNodeId(null); }, []);

  const handleNodeDataChange = useCallback((newData: FlowNodeData) => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: newData as any } : n));
    setTimeout(pushState, 100);
  }, [selectedNodeId, setNodes, pushState]);

  const handleDeleteNode = useCallback((withDescendants = false) => {
    if (!selectedNodeId) return;

    if (!withDescendants) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    } else {
      // Logic to find all descendants
      const descendants = new Set<string>();
      const findDescendants = (id: string) => {
        edges.filter(e => e.source === id).forEach(e => {
          if (!descendants.has(e.target)) {
            descendants.add(e.target);
            findDescendants(e.target);
          }
        });
      };
      findDescendants(selectedNodeId);
      
      const toDelete = new Set([...descendants, selectedNodeId]);
      setNodes((nds) => nds.filter((n) => !toDelete.has(n.id)));
      setEdges((eds) => eds.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)));
    }

    setSelectedNodeId(null);
    setTimeout(pushState, 0);
  }, [selectedNodeId, edges, setNodes, setEdges, pushState]);

  const duplicateNode = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    const newNode: Node = { ...node, id: `node_${Date.now()}`, position: { x: node.position.x + 40, y: node.position.y + 40 }, selected: false };
    setNodes((nds) => [...nds, newNode]);
    setTimeout(pushState, 0);
  }, [selectedNodeId, nodes, setNodes, pushState]);

  const openFlow = (flow: Flow) => {
    setSelectedFlow(flow);

    // Sanitize node types from legacy imports
    const nodeTypeMap: Record<string, string> = { transfer: "transfer_to_human" };
    const convertedNodes = (flow.nodes || []).map((n: any) => {
      const nt = n.data?.nodeType;
      const fixedNodeType = (nt && nodeTypeMap[nt]) || nt || "message";
      return {
        ...n,
        type: n.type === "default" ? "custom" : (n.type || "custom"),
        data: { ...n.data, nodeType: fixedNodeType },
      };
    });

    // Sanitize edges: clean sourceHandle for non-branching nodes
    const branchingIds = new Set(
      convertedNodes
        .filter((n: any) => ["condition", "switch", "ai_router", "message_buttons", "message_list"].includes(n.data?.nodeType))
        .map((n: any) => n.id)
    );
    const sanitizedEdges = (flow.edges || []).map((e: any) => ({
      ...e,
      sourceHandle: branchingIds.has(e.source) ? e.sourceHandle : null,
      targetHandle: e.targetHandle === "null" ? null : e.targetHandle,
    }));

    setNodes(convertedNodes);
    
    // Ensure edges use the custom type and have the callback
    const enhancedEdges = sanitizedEdges.map((e: any) => ({
      ...e,
      type: "custom",
      data: { onInsertNode: handleInsertNode },
      markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed }
    }));
    setEdges(enhancedEdges);
    setSelectedNodeId(null);
    setTimeout(pushState, 50);
  };

  const handleCreateFromTemplate = async (template: FlowTemplate) => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from("flows").insert({
        name: template.name,
        description: template.description,
        trigger_type: template.triggerType,
        flow_type: template.flowType,
        nodes: template.nodes as any,
        edges: template.edges as any,
      } as any).select().single();
      if (error) throw error;
      toast.success(`Fluxo "${template.name}" criado a partir do template`);
      setDialogOpen(false);
      await loadFlows();
      if (data) openFlow(data as unknown as Flow);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleCreateFlow = async () => {
    if (!newFlow.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const insertData: any = {
        name: newFlow.name,
        description: newFlow.description || null,
        trigger_type: newFlow.trigger_type,
        trigger_value: newFlow.trigger_value || null,
        flow_type: newFlow.flow_type,
        nodes: [],
        edges: [],
      };
      // Add trigger_config for advanced triggers
      if (["bitrix_event", "schedule", "inactivity", "tag", "department_transfer"].includes(newFlow.trigger_type)) {
        insertData.trigger_config = newFlow.trigger_config;
      }
      const { error } = await supabase.from("flows").insert(insertData);
      if (error) throw error;
      toast.success("Fluxo criado");
      setDialogOpen(false);
      setNewFlow({ name: "", description: "", trigger_type: "keyword", trigger_value: "", flow_type: "hybrid", trigger_config: {} });
      loadFlows();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleSaveFlow = async () => {
    if (!selectedFlow) return;
    const flowName = selectedFlow.name.trim();
    if (!flowName) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const payload = {
        name: flowName,
        description: selectedFlow.description?.trim() || null,
        nodes: nodes as any,
        edges: edges as any,
      };
      const { data, error } = await supabase
        .from("flows")
        .update(payload as any)
        .eq("id", selectedFlow.id)
        .select()
        .single();
      if (error) throw error;
      if (data) {
        const savedFlow = data as unknown as Flow;
        setSelectedFlow(savedFlow);
        setFlows((prev) => prev.map((flow) => flow.id === savedFlow.id ? savedFlow : flow));
      }
      toast.success("Fluxo guardado");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
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

  const duplicateFlow = async (flow: Flow) => {
    const { error } = await supabase.from("flows").insert({
      name: `${flow.name} (cópia)`,
      description: flow.description,
      trigger_type: flow.trigger_type,
      trigger_value: flow.trigger_value,
      flow_type: (flow as any).flow_type || "hybrid",
      nodes: flow.nodes as any,
      edges: flow.edges as any,
    } as any);
    if (error) toast.error(error.message);
    else { toast.success("Fluxo duplicado"); loadFlows(); }
  };

  const exportFlow = (flow: Flow) => {
    const json = JSON.stringify({ name: flow.name, nodes: flow.nodes, edges: flow.edges }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${flow.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportado");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const preview = previewPowerBotFlow(json);
        if (!preview) { toast.error("JSON inválido: deve conter 'nodes' e 'edges'"); return; }
        setImportJson(json);
        setImportPreview(preview);
        setImportDialogOpen(true);
      } catch { toast.error("Erro ao ler ficheiro JSON"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (!importJson) return;
    setImporting(true);
    try {
      const { name, nodes: convertedNodes, edges: convertedEdges } = convertPowerBotFlow(importJson);
      const { data, error } = await supabase.from("flows").insert({
        name,
        description: `Importado do PowerBot (${convertedNodes.length} nós)`,
        trigger_type: "manual",
        nodes: convertedNodes as any,
        edges: convertedEdges as any,
      } as any).select().single();
      if (error) throw error;
      toast.success(`Importado: ${convertedNodes.length} nós, ${convertedEdges.length} conexões`);
      setImportDialogOpen(false);
      setImportJson(null);
      setImportPreview(null);
      await loadFlows();
      if (data) openFlow(data as unknown as Flow);
    } catch (e: any) { toast.error(e.message); }
    finally { setImporting(false); }
  };

  // Render trigger-specific config
  const renderTriggerConfig = () => {
    switch (newFlow.trigger_type) {
      case "keyword":
        return (
          <div>
            <Label>Palavra-chave</Label>
            <Input value={newFlow.trigger_value} onChange={(e) => setNewFlow((prev) => ({ ...prev, trigger_value: e.target.value }))} placeholder="Ex: ajuda, suporte" />
          </div>
        );
      case "bitrix_event":
        return (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Tipo de evento</Label>
              <Select value={newFlow.trigger_config?.eventType || ""} onValueChange={(v) => setNewFlow(p => ({ ...p, trigger_config: { ...p.trigger_config, eventType: v } }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONCRMLEADADD">Lead criado</SelectItem>
                  <SelectItem value="ONCRMLEADUPDATE">Lead atualizado</SelectItem>
                  <SelectItem value="ONCRMDEALADD">Deal criado</SelectItem>
                  <SelectItem value="ONCRMDEALUPDATE">Deal atualizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "schedule":
        return (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Expressão CRON</Label>
              <Input value={newFlow.trigger_config?.cron || ""} onChange={(e) => setNewFlow(p => ({ ...p, trigger_config: { ...p.trigger_config, cron: e.target.value } }))} placeholder="0 9 * * 1-5" />
              <p className="text-[10px] text-muted-foreground mt-1">Ex: 0 9 * * 1-5 = Seg-Sex às 9h</p>
            </div>
          </div>
        );
      case "inactivity":
        return (
          <div>
            <Label className="text-xs">Minutos sem resposta</Label>
            <Input type="number" min={1} value={newFlow.trigger_config?.minutes || 30} onChange={(e) => setNewFlow(p => ({ ...p, trigger_config: { ...p.trigger_config, minutes: parseInt(e.target.value) || 30 } }))} />
          </div>
        );
      case "tag":
        return (
          <div>
            <Label className="text-xs">Nome da tag</Label>
            <Input value={newFlow.trigger_config?.tagName || ""} onChange={(e) => setNewFlow(p => ({ ...p, trigger_config: { ...p.trigger_config, tagName: e.target.value } }))} placeholder="Ex: vip, urgente" />
          </div>
        );
      case "department_transfer":
        return (
          <div>
            <Label className="text-xs">Departamento</Label>
            <Input value={newFlow.trigger_config?.departmentName || ""} onChange={(e) => setNewFlow(p => ({ ...p, trigger_config: { ...p.trigger_config, departmentName: e.target.value } }))} placeholder="Ex: suporte, vendas" />
          </div>
        );
      default:
        return null;
    }
  };

  // ── Editor View ──
  if (selectedFlow) {
    return (
      <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedFlow(null); setSelectedNodeId(null); loadFlows(); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Input
                  value={selectedFlow.name}
                  onChange={(e) => setSelectedFlow({ ...selectedFlow, name: e.target.value } as any)}
                  className="h-7 text-sm font-semibold border-transparent hover:border-input focus:border-input px-2 w-[280px]"
                  placeholder="Nome do fluxo"
                />
                {(selectedFlow as any).flow_type && (
                  <Badge className={`text-[9px] ${FLOW_TYPE_LABELS[(selectedFlow as any).flow_type]?.color || ""}`}>
                    {FLOW_TYPE_LABELS[(selectedFlow as any).flow_type]?.label || (selectedFlow as any).flow_type}
                  </Badge>
                )}
              </div>
              <Input
                value={selectedFlow.description || ""}
                onChange={(e) => setSelectedFlow({ ...selectedFlow, description: e.target.value } as any)}
                className="h-6 text-[11px] text-muted-foreground border-transparent hover:border-input focus:border-input px-2 mt-0.5 w-[320px]"
                placeholder="Sem descrição"
              />
            </div>

          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Shift+Z)">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => exportFlow({ ...selectedFlow, nodes, edges })} title="Exportar JSON">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={onValidate} title="Validar integridade do fluxo">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Validar
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={onLayout} title="Organizar fluxo">
              <Shuffle className="h-3.5 w-3.5 mr-1" /> Organizar
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveFlow} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <FlowNodePalette onAddNode={addNode} collapsed={paletteCollapsed} onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)} />

          <div className="flex-1" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
              nodeTypes={customNodeTypes} 
              edgeTypes={customEdgeTypes}
              fitView
              deleteKeyCode="Delete"
              onNodesDelete={() => setTimeout(pushState, 0)}
              onEdgesDelete={() => setTimeout(pushState, 0)}
              defaultEdgeOptions={{
                type: 'custom',
                markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
                style: { strokeWidth: 2, stroke: '#94a3b8' }
              }}
            >
              <Controls className="bg-card border-none shadow-soft" />
              <MiniMap 
                className="rounded-lg border shadow-sm !bg-card" 
                nodeColor={(n) => (n.data as any)?.error ? "#ef4444" : "#e2e8f0"}
                maskColor="rgba(0,0,0,0.05)"
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
              {selectedNodeId && (
                <Panel position="top-right">
                  <div className="flex gap-1 bg-card border rounded-md p-1 shadow-sm">
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={duplicateNode}>
                      <Copy className="h-3 w-3 mr-1" /> Duplicar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive" onClick={() => handleDeleteNode(false)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Excluir
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive" onClick={() => handleDeleteNode(true)}>
                      <GitBranch className="h-3 w-3 mr-1" /> + Descendentes
                    </Button>
                  </div>
                </Panel>
              )}
              <Panel position="bottom-center">
                <div className="bg-card/80 backdrop-blur border rounded-md px-3 py-1.5 text-[10px] text-muted-foreground">
                  Arraste blocos da paleta • Clique num nó para configurar • Delete para remover • Ctrl+Z desfazer
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {selectedNodeData && (
            <Sheet open={!!selectedNodeId} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
              <SheetContent className="w-[450px] p-0 overflow-hidden border-l shadow-2xl">
                <SheetHeader className="sr-only">
                  <SheetTitle>Configuração do Nó</SheetTitle>
                  <SheetDescription>Ajuste os parâmetros do bloco selecionado</SheetDescription>
                </SheetHeader>
                <NodeConfigPanel 
                  data={selectedNodeData} 
                  onChange={handleNodeDataChange} 
                  onDelete={() => handleDeleteNode(false)} 
                  onClose={() => setSelectedNodeId(null)} 
                />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    );
  }

  // ── List View ──
  return (
    <div>
      <PageHeader title="Fluxos de Automação" description="Crie fluxos de conversa com editor visual drag-and-drop" />

      <div className="flex justify-end gap-2 mb-4">
        <label>
          <input type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
          <Button variant="outline" asChild>
            <span><Upload className="h-4 w-4 mr-2" /> Importar PowerBot</span>
          </Button>
        </label>
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
          {flows.map((flow) => {
            const flowType = (flow as any).flow_type || "hybrid";
            const ftLabel = FLOW_TYPE_LABELS[flowType];
            return (
              <Card key={flow.id} className={`cursor-pointer hover:shadow-md transition-shadow ${!flow.is_active ? "opacity-60" : ""}`} onClick={() => openFlow(flow)}>
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateFlow(flow)} title="Duplicar">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportFlow(flow)} title="Exportar">
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(flow.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ftLabel && <Badge className={`text-[10px] ${ftLabel.color}`}>{ftLabel.label}</Badge>}
                    <Badge variant="outline" className="text-[10px]">{TRIGGER_LABELS[flow.trigger_type] || flow.trigger_type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{(flow.nodes || []).length} nós • {(flow.edges || []).length} conexões</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog with Templates */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Fluxo</DialogTitle>
            <DialogDescription>Escolha um template pronto ou crie do zero.</DialogDescription>
          </DialogHeader>

          <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="template" className="flex-1">📦 Templates</TabsTrigger>
              <TabsTrigger value="scratch" className="flex-1">✏️ Criar do Zero</TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {FLOW_TEMPLATES.map((tpl) => (
                  <Card key={tpl.id} className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/50" onClick={() => handleCreateFromTemplate(tpl)}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <span className="text-lg">{tpl.icon}</span>
                        {tpl.name}
                      </CardTitle>
                      <CardDescription className="text-[11px]">{tpl.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex gap-1">
                        <Badge className={`text-[9px] ${FLOW_TYPE_LABELS[tpl.flowType]?.color}`}>{FLOW_TYPE_LABELS[tpl.flowType]?.label}</Badge>
                        <Badge variant="outline" className="text-[9px]">{tpl.category}</Badge>
                        <Badge variant="outline" className="text-[9px]">{tpl.nodes.length} nós</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {saving && <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            </TabsContent>

            <TabsContent value="scratch" className="mt-4">
              <div className="space-y-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={newFlow.name} onChange={(e) => setNewFlow((prev) => ({ ...prev, name: e.target.value }))} placeholder="Ex: Boas-vindas WhatsApp" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={newFlow.description} onChange={(e) => setNewFlow((prev) => ({ ...prev, description: e.target.value }))} placeholder="Breve descrição" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo de Fluxo</Label>
                    <Select value={newFlow.flow_type} onValueChange={(v) => setNewFlow((prev) => ({ ...prev, flow_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flow">🔀 Apenas Fluxo</SelectItem>
                        <SelectItem value="ai">🤖 Fluxo de IA</SelectItem>
                        <SelectItem value="hybrid">⚡ Híbrido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Gatilho (Trigger)</Label>
                    <Select value={newFlow.trigger_type} onValueChange={(v) => setNewFlow((prev) => ({ ...prev, trigger_type: v, trigger_value: "", trigger_config: {} }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keyword">🔑 Palavra-chave</SelectItem>
                        <SelectItem value="first_message">💬 Primeira mensagem</SelectItem>
                        <SelectItem value="manual">👆 Manual</SelectItem>
                        <SelectItem value="webhook">🌐 Webhook</SelectItem>
                        <SelectItem value="bitrix_event">📊 Evento Bitrix24</SelectItem>
                        <SelectItem value="schedule">📅 Agendamento</SelectItem>
                        <SelectItem value="inactivity">⏰ Inatividade</SelectItem>
                        <SelectItem value="tag">🏷️ Tag</SelectItem>
                        <SelectItem value="department_transfer">↔️ Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {renderTriggerConfig()}
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreateFlow} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
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

      {/* Import Preview Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Fluxo do PowerBot</DialogTitle>
            <DialogDescription>Pré-visualização do fluxo a importar.</DialogDescription>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-primary" />
                <span className="font-semibold">{importPreview.botName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded bg-muted"><span className="font-medium">{importPreview.nodeCount}</span> nós</div>
                <div className="p-2 rounded bg-muted"><span className="font-medium">{importPreview.edgeCount}</span> conexões</div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Tipos de nó:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(importPreview.nodeTypeSummary).map(([type, count]) => (
                    <Badge key={type} variant="outline" className="text-[10px]">{type}: {count}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleImportConfirm} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Importação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
