import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Image, Type, User, FileText, DollarSign, ScrollText, AlignLeft, Footprints, Scale, PenTool, Users } from "lucide-react";

export type BlockType = "header" | "client_info" | "description" | "services_table" | "payment" | "conditions" | "text" | "footer" | "clauses" | "signature" | "witnesses";

export interface LayoutBlock {
  id: string;
  type: BlockType;
  visible: boolean;
  content: Record<string, any>;
  styles?: Record<string, string>;
}

const BLOCK_DEFINITIONS: { type: BlockType; label: string; icon: React.ReactNode; description: string; category: "common" | "proposal" | "contract" }[] = [
  { type: "header", label: "Cabeçalho", icon: <Image className="h-4 w-4" />, description: "Logo, nome e slogan", category: "common" },
  { type: "client_info", label: "Dados do Cliente", icon: <User className="h-4 w-4" />, description: "Nome, email, telefone", category: "common" },
  { type: "description", label: "Descrição do Serviço", icon: <FileText className="h-4 w-4" />, description: "Detalhes do trabalho", category: "common" },
  { type: "services_table", label: "Tabela de Serviços", icon: <ScrollText className="h-4 w-4" />, description: "Lista de serviços com valores", category: "proposal" },
  { type: "payment", label: "Valor / Pagamento", icon: <DollarSign className="h-4 w-4" />, description: "Valor total e condições", category: "common" },
  { type: "conditions", label: "Condições", icon: <AlignLeft className="h-4 w-4" />, description: "Termos e condições", category: "common" },
  { type: "clauses", label: "Cláusulas", icon: <Scale className="h-4 w-4" />, description: "Cláusulas contratuais numeradas", category: "contract" },
  { type: "signature", label: "Assinatura", icon: <PenTool className="h-4 w-4" />, description: "Espaço para assinatura das partes", category: "contract" },
  { type: "witnesses", label: "Testemunhas", icon: <Users className="h-4 w-4" />, description: "Campos para testemunhas", category: "contract" },
  { type: "text", label: "Texto Livre", icon: <Type className="h-4 w-4" />, description: "Bloco de texto personalizado", category: "common" },
  { type: "footer", label: "Rodapé", icon: <Footprints className="h-4 w-4" />, description: "Informações do rodapé", category: "common" },
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

export function TemplateBlockPalette({ templateType = "proposta" }: { templateType?: string }) {
  const filtered = BLOCK_DEFINITIONS.filter((b) => {
    if (b.category === "common") return true;
    if (b.category === "proposal" && templateType === "proposta") return true;
    if (b.category === "contract" && templateType === "contrato") return true;
    return false;
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Blocos</h3>
      <div className="space-y-2">
        {filtered.map((b) => (
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
    clauses: { items: [{ number: 1, title: "Objeto do Contrato", text: "" }, { number: 2, title: "Obrigações das Partes", text: "" }, { number: 3, title: "Prazo e Vigência", text: "" }] },
    signature: { partyA: "CONTRATANTE", partyB: "CONTRATADO", location: "", showDate: true },
    witnesses: { count: 2 },
  };
  return {
    id: `${type}-${Date.now()}`,
    type,
    visible: true,
    content: defaults[type] || {},
  };
}
