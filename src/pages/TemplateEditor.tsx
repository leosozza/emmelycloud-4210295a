import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Sparkles, GripVertical, Eye, EyeOff, Trash2, Upload } from "lucide-react";
import { LayoutBlock, BlockType, getDefaultBlock, TemplateBlockPalette } from "@/components/propostas/TemplateBlockPalette";
import { TemplatePreview } from "@/components/propostas/TemplatePreview";
import { TemplateBlockProperties } from "@/components/propostas/TemplateBlockProperties";

const DEFAULT_BLOCKS: LayoutBlock[] = [
  getDefaultBlock("header"),
  getDefaultBlock("client_info"),
  getDefaultBlock("description"),
  getDefaultBlock("services_table"),
  getDefaultBlock("payment"),
  getDefaultBlock("conditions"),
  getDefaultBlock("footer"),
];

function SortableBlockItem({ block, isSelected, onSelect, onToggle, onRemove }: {
  block: LayoutBlock; isSelected: boolean; onSelect: () => void; onToggle: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const labels: Record<string, string> = {
    header: "Cabeçalho", client_info: "Dados do Cliente", description: "Descrição",
    services_table: "Tabela Serviços", payment: "Valor/Pagamento", conditions: "Condições",
    text: "Texto Livre", footer: "Rodapé",
  };

  return (
    <div
      ref={setNodeRef} style={style}
      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
      onClick={onSelect}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground"><GripVertical className="h-4 w-4" /></div>
      <span className="text-sm flex-1 font-medium">{labels[block.type] || block.type}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        {block.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function TemplateEditor({ templateId, onBack }: { templateId?: string; onBack?: () => void } = {}) {
  const { id: paramId } = useParams();
  const id = templateId || paramId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<LayoutBlock[]>(DEFAULT_BLOCKS);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [headerColor, setHeaderColor] = useState("#1e293b");
  const [accentColor, setAccentColor] = useState("#0f172a");
  const [companyName, setCompanyName] = useState("");
  const [companyTagline, setCompanyTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: template } = useQuery({
    queryKey: ["template-editor", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("proposal_templates").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (template) {
      setName(template.name);
      setHeaderColor((template as any).header_color || "#1e293b");
      setAccentColor((template as any).accent_color || "#0f172a");
      setCompanyName((template as any).company_name || "");
      setCompanyTagline((template as any).company_tagline || "");
      setLogoUrl((template as any).logo_url || "");
      if ((template as any).layout_blocks) {
        setBlocks((template as any).layout_blocks as LayoutBlock[]);
      }
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name,
        logo_url: logoUrl || null,
        header_color: headerColor,
        accent_color: accentColor,
        company_name: companyName || null,
        company_tagline: companyTagline || null,
        layout_blocks: blocks,
      };
      if (id) {
        const { error } = await supabase.from("proposal_templates").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proposal_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposal-templates"] });
      toast({ title: "Modelo guardado com sucesso" });
      if (onBack) onBack(); else navigate("/propostas");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // From palette
    if (String(active.id).startsWith("palette-")) {
      const type = active.data.current?.type as BlockType;
      const newBlock = getDefaultBlock(type);
      const overIndex = blocks.findIndex((b) => b.id === over.id);
      const updated = [...blocks];
      updated.splice(overIndex >= 0 ? overIndex + 1 : blocks.length, 0, newBlock);
      setBlocks(updated);
      setSelectedBlockId(newBlock.id);
      return;
    }

    // Reorder
    if (active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        setBlocks(arrayMove(blocks, oldIndex, newIndex));
      }
    }
  };

  const handleUpdateBlock = useCallback((updated: LayoutBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  const handleUpdateGlobal = useCallback((key: string, value: string) => {
    switch (key) {
      case "headerColor": setHeaderColor(value); break;
      case "accentColor": setAccentColor(value); break;
      case "companyName": setCompanyName(value); break;
      case "companyTagline": setCompanyTagline(value); break;
      case "logoUrl": setLogoUrl(value); break;
    }
  }, []);

  const handleAiGenerate = async (file: File) => {
    setAiGenerating(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `ai-template-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("proposal-files").upload(fileName, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("proposal-files").getPublicUrl(fileName);

      const { data, error } = await supabase.functions.invoke("generate-template-from-image", {
        body: { image_url: urlData.publicUrl, file_type: ext },
      });
      if (error) throw error;
      if (data?.layout_blocks) {
        setBlocks(data.layout_blocks);
        if (data.header_color) setHeaderColor(data.header_color);
        if (data.accent_color) setAccentColor(data.accent_color);
        if (data.company_name) setCompanyName(data.company_name);
        if (data.company_tagline) setCompanyTagline(data.company_tagline);
        toast({ title: "Template gerado pela IA!", description: "Ajuste os blocos conforme necessário." });
      }
    } catch (err: any) {
      toast({ title: "Erro ao gerar com IA", description: err.message, variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2 bg-card">
        <Button variant="ghost" size="icon" onClick={() => onBack ? onBack() : navigate("/propostas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do modelo..." className="max-w-xs font-semibold" />
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="relative" disabled={aiGenerating}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiGenerating ? "A gerar..." : "Gerar com IA"}
          <input
            type="file"
            accept="image/*,.pdf"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAiGenerate(f); }}
          />
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name}>
          <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "A guardar..." : "Guardar"}
        </Button>
      </div>

      {/* 3-panel layout */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          {/* Left - Block palette + order */}
          <div className="w-64 border-r bg-card flex flex-col">
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-4">
                <TemplateBlockPalette />
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Estrutura</h3>
                  <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1">
                      {blocks.map((b) => (
                        <SortableBlockItem
                          key={b.id}
                          block={b}
                          isSelected={selectedBlockId === b.id}
                          onSelect={() => setSelectedBlockId(b.id)}
                          onToggle={() => handleUpdateBlock({ ...b, visible: !b.visible })}
                          onRemove={() => {
                            setBlocks((prev) => prev.filter((x) => x.id !== b.id));
                            if (selectedBlockId === b.id) setSelectedBlockId(null);
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Center - Preview */}
          <div className="flex-1 overflow-auto p-6 bg-muted/30">
            <TemplatePreview
              blocks={blocks}
              headerColor={headerColor}
              accentColor={accentColor}
              logoUrl={logoUrl}
              companyName={companyName}
              companyTagline={companyTagline}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
            />
          </div>

          {/* Right - Properties */}
          <div className="w-72 border-l bg-card">
            <ScrollArea className="h-full p-4">
              {selectedBlock ? (
                <TemplateBlockProperties
                  block={selectedBlock}
                  headerColor={headerColor}
                  accentColor={accentColor}
                  companyName={companyName}
                  companyTagline={companyTagline}
                  logoUrl={logoUrl}
                  onUpdateBlock={handleUpdateBlock}
                  onUpdateGlobal={handleUpdateGlobal}
                />
              ) : (
                <div className="text-center text-muted-foreground text-sm py-12">
                  <p>Selecione um bloco para editar as suas propriedades.</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DndContext>
    </div>
  );
}
