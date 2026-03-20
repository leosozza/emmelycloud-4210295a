import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Image, Type, User, FileText, DollarSign, ScrollText, AlignLeft, Footprints } from "lucide-react";

export type BlockType = "header" | "client_info" | "description" | "services_table" | "payment" | "conditions" | "text" | "footer";

export interface LayoutBlock {
  id: string;
  type: BlockType;
  visible: boolean;
  content: Record<string, any>;
  styles?: Record<string, string>;
}

const BLOCK_DEFINITIONS: { type: BlockType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: "header", label: "Cabeçalho", icon: <Image className="h-4 w-4" />, description: "Logo, nome e slogan" },
  { type: "client_info", label: "Dados do Cliente", icon: <User className="h-4 w-4" />, description: "Nome, email, telefone" },
  { type: "description", label: "Descrição do Serviço", icon: <FileText className="h-4 w-4" />, description: "Detalhes do trabalho" },
  { type: "services_table", label: "Tabela de Serviços", icon: <ScrollText className="h-4 w-4" />, description: "Lista de serviços com valores" },
  { type: "payment", label: "Valor / Pagamento", icon: <DollarSign className="h-4 w-4" />, description: "Valor total e condições" },
  { type: "conditions", label: "Condições", icon: <AlignLeft className="h-4 w-4" />, description: "Termos e condições" },
  { type: "text", label: "Texto Livre", icon: <Type className="h-4 w-4" />, description: "Bloco de texto personalizado" },
  { type: "footer", label: "Rodapé", icon: <Footprints className="h-4 w-4" />, description: "Informações do rodapé" },
];

function DraggableBlock({ type, label, icon, description }: { type: BlockType; label: string; icon: React.ReactNode; description: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type, fromPalette: true },
  });

  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card className="cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="p-1.5 rounded bg-muted text-muted-foreground">{icon}</div>
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function TemplateBlockPalette() {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Blocos</h3>
      <div className="space-y-2">
        {BLOCK_DEFINITIONS.map((b) => (
          <DraggableBlock key={b.type} {...b} />
        ))}
      </div>
    </div>
  );
}

export { BLOCK_DEFINITIONS };

export function getDefaultBlock(type: BlockType): LayoutBlock {
  const defaults: Record<BlockType, Record<string, any>> = {
    header: { companyName: "", tagline: "", logoUrl: "" },
    client_info: {},
    description: { text: "" },
    services_table: {},
    payment: {},
    conditions: { text: "" },
    text: { text: "", title: "" },
    footer: { text: "© Empresa" },
  };
  return {
    id: `${type}-${Date.now()}`,
    type,
    visible: true,
    content: defaults[type] || {},
  };
}
