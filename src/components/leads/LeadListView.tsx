import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tables } from "@/integrations/supabase/types";
import { format, parseISO } from "date-fns";

type Lead = Tables<"leads">;

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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Área Jurídica</TableHead>
            <TableHead>Estágio</TableHead>
            <TableHead>Urgência</TableHead>
            <TableHead>Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Nenhum lead encontrado
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <TableRow key={lead.id} className="cursor-pointer" onClick={() => onLeadClick(lead)}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>{originLabels[lead.origin] || lead.origin}</TableCell>
                <TableCell>{lead.legal_area ? (legalAreaLabels[lead.legal_area] || lead.legal_area) : "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{stageLabels[lead.funnel_stage]}</Badge>
                </TableCell>
                <TableCell>
                  {lead.urgency === "critica" ? (
                    <Badge variant="destructive" className="text-xs">Crítica</Badge>
                  ) : lead.urgency === "alta" ? (
                    <Badge className="text-xs bg-warning text-warning-foreground">Alta</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Normal</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(parseISO(lead.created_at), "dd/MM/yyyy")}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
