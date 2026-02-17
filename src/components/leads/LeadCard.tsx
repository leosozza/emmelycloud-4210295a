import { Badge } from "@/components/ui/badge";
import { Tables } from "@/integrations/supabase/types";
import { differenceInHours, differenceInMinutes, parseISO } from "date-fns";

type Lead = Tables<"leads">;

const originLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "Email",
  landing_page: "Landing Page",
  outro: "Outro",
};

const legalAreaLabels: Record<string, string> = {
  previdencia: "Previdência",
  cidadania: "Cidadania",
  vistos: "Vistos",
  trabalhista: "Trabalhista",
  familia: "Família",
  empresarial: "Empresarial",
  tributario: "Tributário",
  outro: "Outro",
};

function getSlaStatus(slaExpiresAt: string | null): { label: string; color: string } {
  if (!slaExpiresAt) return { label: "Sem SLA", color: "bg-muted text-muted-foreground" };
  const now = new Date();
  const expires = parseISO(slaExpiresAt);
  const hoursLeft = differenceInHours(expires, now);
  const minutesLeft = differenceInMinutes(expires, now);

  if (minutesLeft <= 0) return { label: "Expirado", color: "bg-destructive text-destructive-foreground" };
  if (hoursLeft < 4) return { label: `${hoursLeft}h ${minutesLeft % 60}m`, color: "bg-warning text-warning-foreground" };
  return { label: `${hoursLeft}h`, color: "bg-success text-success-foreground" };
}

interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const sla = getSlaStatus(lead.sla_expires_at);

  return (
    <div
      onClick={() => onClick(lead)}
      className="cursor-pointer rounded-lg border bg-card p-3 space-y-2 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-semibold text-card-foreground truncate">{lead.name}</span>
        {lead.ai_score != null && lead.ai_score > 0 && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            AI {lead.ai_score}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px]">
          {originLabels[lead.origin] || lead.origin}
        </Badge>
        {lead.legal_area && (
          <Badge variant="secondary" className="text-[10px]">
            {legalAreaLabels[lead.legal_area] || lead.legal_area}
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Badge className={`text-[10px] ${sla.color}`}>{sla.label}</Badge>
        {lead.urgency && lead.urgency !== "normal" && (
          <Badge variant="destructive" className="text-[10px]">
            {lead.urgency === "critica" ? "Crítica" : "Alta"}
          </Badge>
        )}
      </div>
    </div>
  );
}
