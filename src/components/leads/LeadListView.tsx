import { Badge } from "@/components/ui/badge";
import { Tables } from "@/integrations/supabase/types";
import { format, parseISO } from "date-fns";
import { VirtualTable } from "@/components/ui/VirtualTable";

type Lead = Tables<"leads"> & { clients?: { name: string } | null };

const stageLabels: Record<string, string> = {
  lead: "Lead", triagem: "Triagem", proposta: "Proposta", analise: "Análise",
  contrato: "Contrato", financeiro: "Financeiro", fechado: "Fechado",
};
const originLabels: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", email: "Email",
  landing_page: "Landing Page", outro: "Outro",
};
const legalAreaLabels: Record<string, string> = {
  previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
  trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
  tributario: "Tributário", outro: "Outro",
};

interface LeadListViewProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}

export function LeadListView({ leads, onLeadClick }: LeadListViewProps) {
  return (
    <VirtualTable<Lead>
      data={leads}
      getRowKey={(lead) => lead.id}
      onRowClick={onLeadClick}
      emptyMessage="Nenhum lead encontrado"
      columns={[
        {
          header: "Nome",
          render: (lead) => <span className="font-medium">{lead.clients?.name || lead.name}</span>,
        },
        {
          header: "Origem",
          render: (lead) => <>{originLabels[lead.origin] || lead.origin}</>,
        },
        {
          header: "Área Jurídica",
          render: (lead) => <>{lead.legal_area ? (legalAreaLabels[lead.legal_area] || lead.legal_area) : "—"}</>,
        },
        {
          header: "Estágio",
          render: (lead) => (
            <Badge variant="outline" className="text-xs">{stageLabels[lead.funnel_stage]}</Badge>
          ),
        },
        {
          header: "Urgência",
          render: (lead) =>
            lead.urgency === "critica" ? (
              <Badge variant="destructive" className="text-xs">Crítica</Badge>
            ) : lead.urgency === "alta" ? (
              <Badge className="text-xs bg-warning text-warning-foreground">Alta</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">Normal</span>
            ),
        },
        {
          header: "Data",
          render: (lead) => (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(lead.created_at), "dd/MM/yyyy")}
            </span>
          ),
        },
      ]}
    />
  );
}
