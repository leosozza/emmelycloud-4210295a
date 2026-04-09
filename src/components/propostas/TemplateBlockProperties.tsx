import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Upload, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LayoutBlock } from "./TemplateBlockPalette";

interface Props {
  block: LayoutBlock;
  headerColor: string;
  accentColor: string;
  companyName: string;
  companyTagline: string;
  logoUrl: string;
  onUpdateBlock: (block: LayoutBlock) => void;
  onUpdateGlobal: (key: string, value: string) => void;
}

export function TemplateBlockProperties({
  block, headerColor, accentColor, companyName, companyTagline, logoUrl,
  onUpdateBlock, onUpdateGlobal,
}: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  // Ensure block.content is always defined
  if (!block.content) {
    block = { ...block, content: {} as any };
  }

  const updateContent = (key: string, value: any) => {
    onUpdateBlock({ ...block, content: { ...block.content, [key]: value } });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("proposal-files").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("proposal-files").getPublicUrl(fileName);
      onUpdateGlobal("logoUrl", urlData.publicUrl);
      toast({ title: "Logo carregado" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Propriedades</h3>

      <div className="flex items-center justify-between">
        <Label>Visível</Label>
        <Switch checked={block.visible} onCheckedChange={(v) => onUpdateBlock({ ...block, visible: v })} />
      </div>

      {block.type === "header" && (
        <>
          <div>
            <Label>Logo</Label>
            <div className="flex gap-2 mt-1">
              {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 rounded border object-contain" />}
              <Button variant="outline" size="sm" className="relative" disabled={uploading}>
                <Upload className="h-3 w-3 mr-1" /> {uploading ? "A enviar..." : "Upload"}
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleLogoUpload} />
              </Button>
            </div>
          </div>
          <div>
            <Label>Nome da Empresa</Label>
            <Input value={companyName} onChange={(e) => onUpdateGlobal("companyName", e.target.value)} placeholder="Nome da empresa" />
          </div>
          <div>
            <Label>Slogan</Label>
            <Input value={companyTagline} onChange={(e) => onUpdateGlobal("companyTagline", e.target.value)} placeholder="Slogan" />
          </div>
          <div>
            <Label>Cor do Cabeçalho</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={headerColor} onChange={(e) => onUpdateGlobal("headerColor", e.target.value)} className="h-8 w-12 rounded cursor-pointer" />
              <Input value={headerColor} onChange={(e) => onUpdateGlobal("headerColor", e.target.value)} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Cor de Destaque</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={accentColor} onChange={(e) => onUpdateGlobal("accentColor", e.target.value)} className="h-8 w-12 rounded cursor-pointer" />
              <Input value={accentColor} onChange={(e) => onUpdateGlobal("accentColor", e.target.value)} className="flex-1" />
            </div>
          </div>
        </>
      )}

      {(block.type === "description" || block.type === "conditions") && (
        <div>
          <Label>Texto padrão</Label>
          <Textarea value={block.content.text || ""} onChange={(e) => updateContent("text", e.target.value)} rows={5} placeholder="Texto padrão do bloco..." />
        </div>
      )}

      {block.type === "text" && (
        <>
          <div>
            <Label>Título da Secção</Label>
            <Input value={block.content.title || ""} onChange={(e) => updateContent("title", e.target.value)} placeholder="Título (opcional)" />
          </div>
          <div>
            <Label>Conteúdo</Label>
            <Textarea value={block.content.text || ""} onChange={(e) => updateContent("text", e.target.value)} rows={5} placeholder="Texto livre..." />
          </div>
        </>
      )}

      {block.type === "footer" && (
        <div>
          <Label>Texto do Rodapé</Label>
          <Input value={block.content.text || ""} onChange={(e) => updateContent("text", e.target.value)} placeholder="© Empresa" />
        </div>
      )}

      {block.type === "clauses" && (
        <div className="space-y-3">
          <Label>Cláusulas</Label>
          {(block.content.items || []).map((item: any, idx: number) => (
            <div key={idx} className="space-y-1 border rounded-md p-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Cláusula {item.number || idx + 1}ª</span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => {
                  const items = [...(block.content.items || [])];
                  items.splice(idx, 1);
                  updateContent("items", items);
                }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                value={item.title || ""}
                onChange={(e) => {
                  const items = [...(block.content.items || [])];
                  items[idx] = { ...items[idx], title: e.target.value };
                  updateContent("items", items);
                }}
                placeholder="Título da cláusula"
                className="text-sm"
              />
              <Textarea
                value={item.text || ""}
                onChange={(e) => {
                  const items = [...(block.content.items || [])];
                  items[idx] = { ...items[idx], text: e.target.value };
                  updateContent("items", items);
                }}
                placeholder="Texto da cláusula..."
                rows={3}
                className="text-sm"
              />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => {
            const items = [...(block.content.items || [])];
            items.push({ number: items.length + 1, title: "", text: "" });
            updateContent("items", items);
          }}>
            <Plus className="h-3 w-3 mr-1" /> Adicionar Cláusula
          </Button>
        </div>
      )}

      {block.type === "signature" && (
        <>
          <div>
            <Label>Parte A (Contratante)</Label>
            <Input value={block.content.partyA || ""} onChange={(e) => updateContent("partyA", e.target.value)} placeholder="CONTRATANTE" />
          </div>
          <div>
            <Label>Parte B (Contratado)</Label>
            <Input value={block.content.partyB || ""} onChange={(e) => updateContent("partyB", e.target.value)} placeholder="CONTRATADO" />
          </div>
          <div>
            <Label>Local</Label>
            <Input value={block.content.location || ""} onChange={(e) => updateContent("location", e.target.value)} placeholder="Lisboa, Portugal" />
          </div>
          <div className="flex items-center justify-between">
            <Label>Mostrar data</Label>
            <Switch checked={block.content.showDate !== false} onCheckedChange={(v) => updateContent("showDate", v)} />
          </div>
        </>
      )}

      {block.type === "witnesses" && (
        <div>
          <Label>Número de testemunhas</Label>
          <Input
            type="number"
            min={1}
            max={4}
            value={block.content.count || 2}
            onChange={(e) => updateContent("count", parseInt(e.target.value) || 2)}
          />
        </div>
      )}
    </div>
  );
}
