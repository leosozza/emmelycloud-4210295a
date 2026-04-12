/**
 * BlockRenderer — renders a list of LayoutBlocks as React elements,
 * resolving proposal/client placeholders from real data.
 */
import React from "react";
import { LayoutBlock } from "@/components/propostas/TemplateBlockPalette";
import { Separator } from "@/components/ui/separator";

// ── Placeholder resolution ──────────────────────────────────────────────────

export interface ProposalData {
  title?: string | null;
  value?: number | null;
  currency?: string | null;
  payment_type?: string | null;
  installments?: number | null;
  upfront_value?: number | null;
  installment_value?: number | null;
  valid_until?: string | null;
  description?: string | null;
  conditions?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_document?: string | null;
  client_address?: string | null;
  client_gender?: string | null;
  client_nationality?: string | null;
  client_document_type?: string | null;
  client_document_number?: string | null;
  client_document_validity?: string | null;
  client_document_issuer?: string | null;
  products_json?: any[] | null;
  [key: string]: any;
}

const paymentTypeLabels: Record<string, string> = {
  fixo: "Pagamento Único",
  exito: "Honorários de Êxito",
  hibrido: "Híbrido (Fixo + Êxito)",
  parcelado: "Parcelado",
};

const currencySymbols: Record<string, string> = {
  EUR: "€", BRL: "R$", USD: "$", GBP: "£", CHF: "CHF", CAD: "C$",
};

function getGenderTreatment(gender?: string | null): string {
  if (gender === "feminino") return "Prezada";
  if (gender === "masculino") return "Prezado";
  return "Prezado(a)";
}

/** Build a map of {placeholder} → resolved value from proposal data */
function buildPlaceholders(proposal: ProposalData): Record<string, string> {
  const curr = currencySymbols[proposal.currency ?? "EUR"] ?? "€";
  const value = proposal.value ? Number(proposal.value) : null;
  const installments = proposal.installments ? Number(proposal.installments) : 1;

  const upfrontValue = proposal.upfront_value ? Number(proposal.upfront_value) : null;
  const instValue = proposal.installment_value ? Number(proposal.installment_value) : null;

  const calcInstallmentValue = instValue
    ?? (value && installments > 1 ? value / installments : null);

  const fmtNum = (n: number | null) =>
    n !== null ? `${curr} ${n.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}` : "";

  const validUntil = proposal.valid_until
    ? new Date(proposal.valid_until).toLocaleDateString("pt-PT")
    : "";

  const docValidity = proposal.client_document_validity
    ? new Date(proposal.client_document_validity).toLocaleDateString("pt-PT")
    : "";

  return {
    "{cliente.nome}": proposal.client_name ?? "",
    "{cliente.email}": proposal.client_email ?? "",
    "{cliente.telefone}": proposal.client_phone ?? "",
    "{cliente.documento}": proposal.client_document ?? "",
    "{cliente.morada}": proposal.client_address ?? "",
    "{cliente.tratamento}": getGenderTreatment(proposal.client_gender),
    "{cliente.nacionalidade}": proposal.client_nationality ?? "",
    "{cliente.tipo_documento}": proposal.client_document_type ?? "",
    "{cliente.numero_documento}": proposal.client_document_number ?? "",
    "{cliente.validade_documento}": docValidity,
    "{cliente.orgao_emissor}": proposal.client_document_issuer ?? "",
    "{proposta.titulo}": proposal.title ?? "",
    "{proposta.valor}": fmtNum(value),
    "{proposta.validade}": validUntil,
    "{valor}": fmtNum(value),
    "{valor_total}": fmtNum(value),
    "{valor_entrada}": fmtNum(upfrontValue),
    "{valor_parcela}": fmtNum(calcInstallmentValue),
    "{tipo_pagamento}": paymentTypeLabels[proposal.payment_type ?? ""] ?? (proposal.payment_type ?? ""),
    "{parcelas}": String(installments),
    "{parcelas_valor}": fmtNum(calcInstallmentValue),
    "{data}": new Date().toLocaleDateString("pt-PT"),
    "{nome_contratante}": proposal.client_name ?? "",
    "{nome_contratado}": "Emmely Fernandes Advocacia",
  };
}

/** Replace all known placeholders in a string */
function resolvePlaceholders(text: string, placeholders: Record<string, string>): string {
  return Object.entries(placeholders).reduce((acc, [key, val]) => {
    return acc.split(key).join(val);
  }, text);
}

// ── Block renderers ─────────────────────────────────────────────────────────

interface BlockRendererProps {
  blocks: LayoutBlock[];
  proposal: ProposalData;
  template: {
    header_color?: string | null;
    accent_color?: string | null;
    logo_url?: string | null;
    company_name?: string | null;
    company_tagline?: string | null;
  };
}

function HeaderBlock({
  block, headerColor, accentColor, logoUrl, companyName, companyTagline,
}: {
  block: LayoutBlock;
  headerColor: string;
  accentColor: string;
  logoUrl: string;
  companyName: string;
  companyTagline: string;
}) {
  return (
    <div
      className="p-8 text-center rounded-t-lg"
      style={{ background: `linear-gradient(135deg, ${headerColor}, ${accentColor})`, color: "white" }}
    >
      {logoUrl && <img src={logoUrl} alt="Logo" className="h-12 mx-auto mb-3 object-contain" />}
      <h1 className="text-xl font-bold tracking-wider uppercase">{companyName || "EMPRESA"}</h1>
      {companyTagline && (
        <p className="text-xs tracking-widest uppercase mt-1 opacity-70">{companyTagline}</p>
      )}
    </div>
  );
}

function ClientInfoBlock({ block, proposal }: { block: LayoutBlock; proposal: ProposalData }) {
  const docTypeLabels: Record<string, string> = {
    nif: "NIF", cpf: "CPF", passaporte: "Passaporte", cc: "Cartão de Cidadão", bi: "BI",
  };
  const docTypeLabel = proposal.client_document_type
    ? docTypeLabels[proposal.client_document_type] ?? proposal.client_document_type
    : null;

  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        Dados do Cliente
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {proposal.client_name && (
          <div>
            <span className="text-muted-foreground">Nome: </span>
            <span className="font-medium">{proposal.client_name}</span>
          </div>
        )}
        {proposal.client_nationality && (
          <div>
            <span className="text-muted-foreground">Nacionalidade: </span>
            <span>{proposal.client_nationality}</span>
          </div>
        )}
        {proposal.client_email && (
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span>{proposal.client_email}</span>
          </div>
        )}
        {proposal.client_phone && (
          <div>
            <span className="text-muted-foreground">Telefone: </span>
            <span>{proposal.client_phone}</span>
          </div>
        )}
        {(proposal.client_document_number || proposal.client_document) && (
          <div>
            <span className="text-muted-foreground">
              {docTypeLabel ?? "Documento"}:{" "}
            </span>
            <span>{proposal.client_document_number || proposal.client_document}</span>
          </div>
        )}
        {proposal.client_document_validity && (
          <div>
            <span className="text-muted-foreground">Validade: </span>
            <span>{new Date(proposal.client_document_validity).toLocaleDateString("pt-PT")}</span>
          </div>
        )}
        {proposal.client_document_issuer && (
          <div>
            <span className="text-muted-foreground">Órgão Emissor: </span>
            <span>{proposal.client_document_issuer}</span>
          </div>
        )}
        {proposal.client_address && (
          <div className="col-span-full">
            <span className="text-muted-foreground">Morada: </span>
            <span>{proposal.client_address}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DescriptionBlock({
  block, placeholders,
}: { block: LayoutBlock; placeholders: Record<string, string> }) {
  const text = resolvePlaceholders(block.content?.text ?? "", placeholders);
  if (!text) return null;
  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        O Processo Inclui
      </h3>
      <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/80">{text}</p>
    </div>
  );
}

function ServicesTableBlock({ proposal }: { proposal: ProposalData }) {
  const curr = currencySymbols[proposal.currency ?? "EUR"] ?? "€";
  const products = Array.isArray(proposal.products_json) && proposal.products_json.length > 0
    ? proposal.products_json
    : null;

  if (!products) return null;

  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        Serviços
      </h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produto</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Qtd</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((prod: any, idx: number) => (
              <tr key={idx} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{prod.name}</div>
                  {prod.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{prod.description}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-center">{prod.quantity ?? 1}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {curr} {Number(prod.total ?? 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentBlock({
  proposal, accentColor,
}: { proposal: ProposalData; accentColor: string }) {
  const curr = currencySymbols[proposal.currency ?? "EUR"] ?? "€";
  const value = proposal.value ? Number(proposal.value) : null;
  const installments = proposal.installments ? Number(proposal.installments) : 1;
  const upfrontValue = proposal.upfront_value ? Number(proposal.upfront_value) : null;
  const instValue = proposal.installment_value ? Number(proposal.installment_value) : null;
  const calcInstValue = instValue ?? (value && installments > 1 ? value / installments : null);

  const fmtNum = (n: number) => `${curr} ${n.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        Orçamento
      </h3>
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: `${accentColor}18` }}>
        {value !== null ? (
          <>
            <p className="text-3xl font-bold" style={{ color: accentColor }}>
              {fmtNum(value)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {paymentTypeLabels[proposal.payment_type ?? ""] ?? proposal.payment_type ?? ""}
            </p>
            {(upfrontValue || calcInstValue) && (
              <div className="mt-3 text-sm text-muted-foreground space-y-1">
                {upfrontValue && (
                  <p>Entrada: <span className="font-semibold text-foreground">{fmtNum(upfrontValue)}</span></p>
                )}
                {calcInstValue && installments > 1 && (
                  <p>{installments}x de <span className="font-semibold text-foreground">{fmtNum(calcInstValue)}</span></p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm italic">Valor a definir</p>
        )}
      </div>
    </div>
  );
}

function ConditionsBlock({
  block, placeholders,
}: { block: LayoutBlock; placeholders: Record<string, string> }) {
  const text = resolvePlaceholders(block.content?.text ?? "", placeholders);
  if (!text) return null;
  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        Condições
      </h3>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );
}

function ClausesBlock({ block, placeholders }: { block: LayoutBlock; placeholders: Record<string, string> }) {
  const items: any[] = block.content?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        Cláusulas
      </h3>
      <div className="space-y-4">
        {items.map((item: any, idx: number) => (
          <div key={idx}>
            <p className="text-sm font-semibold">
              Cláusula {item.number ?? idx + 1}ª — {item.title ?? "Título"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap leading-relaxed">
              {resolvePlaceholders(item.text ?? "", placeholders)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignatureBlock({ block, proposal }: { block: LayoutBlock; proposal: ProposalData }) {
  const today = new Date().toLocaleDateString("pt-PT");
  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        Assinatura
      </h3>
      {block.content?.location && (
        <p className="text-xs text-muted-foreground text-center mb-4">
          {block.content.location}
          {block.content.showDate !== false ? `, ${today}` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-8 mt-4">
        <div className="text-center">
          <div className="border-b border-foreground/30 mb-1 h-12" />
          <p className="text-xs font-semibold uppercase">{block.content?.partyA ?? "CONTRATANTE"}</p>
          {proposal.client_name && (
            <p className="text-xs text-muted-foreground">{proposal.client_name}</p>
          )}
        </div>
        <div className="text-center">
          <div className="border-b border-foreground/30 mb-1 h-12" />
          <p className="text-xs font-semibold uppercase">{block.content?.partyB ?? "CONTRATADO"}</p>
          <p className="text-xs text-muted-foreground">Emmely Fernandes Advocacia</p>
        </div>
      </div>
    </div>
  );
}

function WitnessesBlock({ block }: { block: LayoutBlock }) {
  const count = block.content?.count ?? 2;
  return (
    <div className="p-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
        Testemunhas
      </h3>
      <div className="grid grid-cols-2 gap-8 mt-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="text-center">
            <div className="border-b border-foreground/30 mb-1 h-10" />
            <p className="text-xs text-muted-foreground">Testemunha {i + 1}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextBlock({ block, placeholders }: { block: LayoutBlock; placeholders: Record<string, string> }) {
  const title = block.content?.title ? resolvePlaceholders(block.content.title, placeholders) : "";
  const text = resolvePlaceholders(block.content?.text ?? "", placeholders);
  if (!title && !text) return null;
  return (
    <div className="p-6">
      {title && (
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold border-b pb-1 mb-3">
          {title}
        </h3>
      )}
      {text && <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{text}</p>}
    </div>
  );
}

function FooterBlock({ block, companyName }: { block: LayoutBlock; companyName: string }) {
  const text = block.content?.text || companyName || "© Empresa";
  return (
    <div className="p-6 text-center border-t">
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

// ── Main exported component ─────────────────────────────────────────────────

export function BlockRenderer({ blocks, proposal, template }: BlockRendererProps) {
  const headerColor = template.header_color ?? "#1e293b";
  const accentColor = template.accent_color ?? "#0f172a";
  const logoUrl = template.logo_url ?? "";
  const companyName = template.company_name ?? "EMMELY FERNANDES";
  const companyTagline = template.company_tagline ?? "";

  const placeholders = buildPlaceholders(proposal);

  const renderBlock = (block: LayoutBlock, index: number) => {
    if (!block.visible) return null;

    const addSeparator = index > 0 && block.type !== "header" && block.type !== "footer";

    const element = (() => {
      switch (block.type) {
        case "header":
          return (
            <HeaderBlock
              key={block.id}
              block={block}
              headerColor={headerColor}
              accentColor={accentColor}
              logoUrl={logoUrl}
              companyName={companyName}
              companyTagline={companyTagline}
            />
          );
        case "client_info":
          return <ClientInfoBlock key={block.id} block={block} proposal={proposal} />;
        case "description":
          return <DescriptionBlock key={block.id} block={block} placeholders={placeholders} />;
        case "services_table":
          return <ServicesTableBlock key={block.id} proposal={proposal} />;
        case "payment":
          return <PaymentBlock key={block.id} proposal={proposal} accentColor={accentColor} />;
        case "conditions":
          return <ConditionsBlock key={block.id} block={block} placeholders={placeholders} />;
        case "clauses":
          return <ClausesBlock key={block.id} block={block} placeholders={placeholders} />;
        case "signature":
          return <SignatureBlock key={block.id} block={block} proposal={proposal} />;
        case "witnesses":
          return <WitnessesBlock key={block.id} block={block} />;
        case "text":
          return <TextBlock key={block.id} block={block} placeholders={placeholders} />;
        case "footer":
          return <FooterBlock key={block.id} block={block} companyName={companyName} />;
        default:
          return null;
      }
    })();

    if (!element) return null;

    return (
      <React.Fragment key={block.id}>
        {addSeparator && <Separator />}
        {element}
      </React.Fragment>
    );
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-lg overflow-hidden border"
      style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
    >
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
