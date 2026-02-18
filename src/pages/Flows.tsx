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
  Plus, Workflow, Save, Trash2, ArrowLeft,
  Loader2, GitBranch, Upload, Undo2, Redo2, Download, Copy,
} from "lucide-react";
import { previewPowerBotFlow, convertPowerBotFlow, type PowerBotImportPreview } from "@/lib/powerbotImporter";
import CustomFlowNode from "@/components/flows/CustomFlowNode";
import FlowNodePalette from "@/components/flows/FlowNodePalette";
import NodeConfigPanel from "@/components/flows/NodeConfigPanel";
import { type FlowNodeType, type FlowNodeData, getDefaultData, NODE_TYPE_META } from "@/components/flows/FlowNodeTypes";
import { useFlowHistory } from "@/hooks/useFlowHistory";

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

const customNodeTypes = { custom: CustomFlowNode };

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFlow, setNewFlow] = useState({ name: "", description: "", trigger_type: "keyword", trigger_value: "" });
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

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    setTimeout(pushState, 0);
  }, [setEdges, pushState]);

  const addNode = useCallback((type: FlowNodeType, position?: { x: number; y: number }) => {
    const id = `node_${Date.now()}`;
    const pos = position || { x: 250, y: (nodes.length + 1) * 120 };
    const data = getDefaultData(type);
    const newNode: Node = {
      id,
      type: "custom",
      position: pos,
      data: data as any,
    };
    setNodes((nds) => [...nds, newNode]);
    setTimeout(pushState, 0);
  }, [nodes.length, setNodes, pushState]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow-type") as FlowNodeType;
    if (!type) return;
    const reactFlowBounds = (event.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    if (!reactFlowBounds) return;
    const position = {
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    };
    addNode(type, position);
  }, [addNode]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

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

  const duplicateNode = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    const newId = `node_${Date.now()}`;
    const newNode: Node = {
      ...node,
      id: newId,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: false,
    };
    setNodes((nds) => [...nds, newNode]);
    setTimeout(pushState, 0);
  }, [selectedNodeId, nodes, setNodes, pushState]);

  const openFlow = (flow: Flow) => {
    setSelectedFlow(flow);
    // Convert old-format nodes to custom type
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

  const duplicateFlow = async (flow: Flow) => {
    const { error } = await supabase.from("flows").insert({
      name: `${flow.name} (cópia)`,
      description: flow.description,
      trigger_type: flow.trigger_type,
      trigger_value: flow.trigger_value,
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

  // ── Editor View ──
  if (selectedFlow) {
    return (
      <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedFlow(null); setSelectedNodeId(null); loadFlows(); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="text-sm font-semibold">{selectedFlow.name}</h3>
              <p className="text-[11px] text-muted-foreground">{selectedFlow.description || "Sem descrição"}</p>
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
            <Button variant="outline" size="sm" onClick={handleSaveFlow} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex flex-1 min-h-0">
          {/* Palette */}
          <FlowNodePalette onAddNode={addNode} collapsed={paletteCollapsed} onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)} />

          {/* Canvas */}
          <div className="flex-1" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={customNodeTypes}
              fitView
              deleteKeyCode="Delete"
              onNodesDelete={() => setTimeout(pushState, 0)}
              onEdgesDelete={() => setTimeout(pushState, 0)}
            >
              <Controls />
              <MiniMap />
              <Background />

              {/* Selected node actions */}
              {selectedNodeId && (
                <Panel position="top-right">
                  <div className="flex gap-1 bg-card border rounded-md p-1 shadow-sm">
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={duplicateNode}>
                      <Copy className="h-3 w-3 mr-1" /> Duplicar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive" onClick={handleDeleteNode}>
                      <Trash2 className="h-3 w-3 mr-1" /> Excluir
                    </Button>
                  </div>
                </Panel>
              )}

              {/* Instructions */}
              <Panel position="bottom-center">
                <div className="bg-card/80 backdrop-blur border rounded-md px-3 py-1.5 text-[10px] text-muted-foreground">
                  Arraste blocos da paleta • Clique num nó para configurar • Delete para remover • Ctrl+Z desfazer
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* Config Panel */}
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
          {flows.map((flow) => (
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
              <Input value={newFlow.name} onChange={(e) => setNewFlow((prev) => ({ ...prev, name: e.target.value }))} placeholder="Ex: Boas-vindas WhatsApp" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={newFlow.description} onChange={(e) => setNewFlow((prev) => ({ ...prev, description: e.target.value }))} placeholder="Breve descrição" />
            </div>
            <div>
              <Label>Tipo de Trigger</Label>
              <Select value={newFlow.trigger_type} onValueChange={(v) => setNewFlow((prev) => ({ ...prev, trigger_type: v }))}>
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
                <Input value={newFlow.trigger_value} onChange={(e) => setNewFlow((prev) => ({ ...prev, trigger_value: e.target.value }))} placeholder="Ex: ajuda, suporte" />
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
