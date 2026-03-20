import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
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

  const updateContent = (key: string, value: string) => {
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
    </div>
  );
}
