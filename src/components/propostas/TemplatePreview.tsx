import { LayoutBlock } from "./TemplateBlockPalette";

interface TemplatePreviewProps {
  blocks: LayoutBlock[];
  headerColor: string;
  accentColor: string;
  logoUrl: string;
  companyName: string;
  companyTagline: string;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string) => void;
}

export function TemplatePreview({
  blocks, headerColor, accentColor, logoUrl, companyName, companyTagline,
  selectedBlockId, onSelectBlock,
}: TemplatePreviewProps) {
  const renderBlock = (block: LayoutBlock) => {
    if (!block || !block.visible) return null;
    if (!block.content) block = { ...block, content: {} as any };

    const isSelected = selectedBlockId === block.id;
    const selectClass = isSelected ? "ring-2 ring-primary ring-offset-2" : "hover:ring-1 hover:ring-muted-foreground/30";

    switch (block.type) {
      case "header":
        return (
          <div
            key={block.id}
            className={`p-8 text-center cursor-pointer rounded-t-lg ${selectClass}`}
            style={{ background: `linear-gradient(135deg, ${headerColor}, ${accentColor})`, color: "white" }}
            onClick={() => onSelectBlock?.(block.id)}
          >
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-12 mx-auto mb-3 object-contain" />}
            <h1 className="text-xl font-bold tracking-wider uppercase">{companyName || "NOME DA EMPRESA"}</h1>
            <p className="text-xs tracking-widest uppercase mt-1 opacity-70">{companyTagline || "Slogan da empresa"}</p>
          </div>
        );
      case "client_info":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">Dados do Cliente</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Nome:</span> <span className="italic text-muted-foreground/60">{"{cliente.nome}"}</span></div>
              <div><span className="text-muted-foreground">Email:</span> <span className="italic text-muted-foreground/60">{"{cliente.email}"}</span></div>
              <div><span className="text-muted-foreground">Telefone:</span> <span className="italic text-muted-foreground/60">{"{cliente.telefone}"}</span></div>
              <div><span className="text-muted-foreground">Documento:</span> <span className="italic text-muted-foreground/60">{"{cliente.documento}"}</span></div>
            </div>
          </div>
        );
      case "description":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">O Processo Inclui</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {block.content.text || "{descrição do serviço}"}
            </p>
          </div>
        );
      case "services_table":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">Serviços</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-1 text-muted-foreground">Serviço</th><th className="text-right py-1 text-muted-foreground">Valor</th></tr></thead>
              <tbody>
                <tr className="border-b border-dashed"><td className="py-1.5 italic text-muted-foreground/60">{"{serviço 1}"}</td><td className="text-right">€ 0,00</td></tr>
                <tr className="border-b border-dashed"><td className="py-1.5 italic text-muted-foreground/60">{"{serviço 2}"}</td><td className="text-right">€ 0,00</td></tr>
              </tbody>
            </table>
          </div>
        );
      case "payment":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">Orçamento</h3>
            <div className="rounded-xl p-6 text-center" style={{ backgroundColor: `${accentColor}10` }}>
              <div className="text-3xl font-bold" style={{ color: accentColor }}>€ {"{valor}"}</div>
              <div className="text-sm text-muted-foreground mt-1">{"{tipo_pagamento}"} — {"{parcelas}"}x</div>
            </div>
          </div>
        );
      case "conditions":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">Condições</h3>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {block.content.text || "{condições da proposta}"}
            </p>
          </div>
        );
      case "clauses":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">Cláusulas</h3>
            <div className="space-y-3">
              {(block.content.items || []).map((item: any, idx: number) => (
                <div key={idx}>
                  <p className="text-sm font-semibold">Cláusula {item.number || idx + 1}ª — {item.title || "Título"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.text || "{texto da cláusula}"}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case "signature":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">Assinatura</h3>
            {block.content.location && (
              <p className="text-xs text-muted-foreground text-center mb-4">
                {block.content.location}, {block.content.showDate !== false ? "{data}" : ""}
              </p>
            )}
            <div className="grid grid-cols-2 gap-8 mt-4">
              <div className="text-center">
                <div className="border-b border-foreground/30 mb-1 h-12" />
                <p className="text-xs font-semibold uppercase">{block.content.partyA || "CONTRATANTE"}</p>
                <p className="text-xs text-muted-foreground italic">{"{nome_contratante}"}</p>
              </div>
              <div className="text-center">
                <div className="border-b border-foreground/30 mb-1 h-12" />
                <p className="text-xs font-semibold uppercase">{block.content.partyB || "CONTRATADO"}</p>
                <p className="text-xs text-muted-foreground italic">{"{nome_contratado}"}</p>
              </div>
            </div>
          </div>
        );
      case "witnesses":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">Testemunhas</h3>
            <div className="grid grid-cols-2 gap-8 mt-4">
              {Array.from({ length: block.content.count || 2 }).map((_, i) => (
                <div key={i} className="text-center">
                  <div className="border-b border-foreground/30 mb-1 h-10" />
                  <p className="text-xs text-muted-foreground">Testemunha {i + 1}</p>
                  <p className="text-xs text-muted-foreground/50 italic">Nome / Doc</p>
                </div>
              ))}
            </div>
          </div>
        );
      case "text":
        return (
          <div key={block.id} className={`p-6 cursor-pointer ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            {block.content.title && <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">{block.content.title}</h3>}
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {block.content.text || "Texto livre..."}
            </p>
          </div>
        );
      case "footer":
        return (
          <div key={block.id} className={`p-6 text-center cursor-pointer border-t ${selectClass}`} onClick={() => onSelectBlock?.(block.id)}>
            <p className="text-xs text-muted-foreground">{block.content.text || "© Empresa"}</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden border max-w-[600px] mx-auto" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      {blocks.map(renderBlock)}
    </div>
  );
}
