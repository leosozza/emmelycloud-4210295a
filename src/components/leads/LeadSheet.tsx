import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";
import { differenceInHours, differenceInMinutes, parseISO, format } from "date-fns";
import { pt } from "date-fns/locale";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";

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

function getSlaInfo(slaExpiresAt: string | null) {
  if (!slaExpiresAt) return { label: "Sem SLA", color: "bg-muted text-muted-foreground" };
  const now = new Date();
  const expires = parseISO(slaExpiresAt);
  const minutesLeft = differenceInMinutes(expires, now);
  const hoursLeft = differenceInHours(expires, now);
  if (minutesLeft <= 0) return { label: "Expirado", color: "bg-destructive text-destructive-foreground" };
  if (hoursLeft < 4) return { label: `${hoursLeft}h ${minutesLeft % 60}m restantes`, color: "bg-warning text-warning-foreground" };
  return { label: `${hoursLeft}h restantes`, color: "bg-success text-success-foreground" };
}

interface LeadSheetProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onMoveStage: (lead: Lead, stage: string) => void;
}

export function LeadSheet({ lead, open, onOpenChange, onEdit, onDelete, onMoveStage }: LeadSheetProps) {
  if (!lead) return null;
  const sla = getSlaInfo(lead.sla_expires_at);
  const stages = Constants.public.Enums.funnel_stage;
  const currentIdx = stages.indexOf(lead.funnel_stage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">{lead.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {/* SLA */}
          <div className="flex items-center gap-2">
            <Badge className={sla.color}>{sla.label}</Badge>
            <Badge variant="outline">{stageLabels[lead.funnel_stage]}</Badge>
          </div>

          {/* Move stage buttons */}
          <div className="flex gap-1 flex-wrap">
            {stages.map((s, i) => (
              <Button
                key={s}
                variant={s === lead.funnel_stage ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => onMoveStage(lead, s)}
                disabled={s === lead.funnel_stage}
              >
                {stageLabels[s]}
              </Button>
            ))}
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-3 text-sm">
            <Detail label="Email" value={lead.email} />
            <Detail label="Telefone" value={lead.phone} />
            <Detail label="País" value={lead.country} />
            <Detail label="Origem" value={originLabels[lead.origin] || lead.origin} />
            <Detail label="Área Jurídica" value={lead.legal_area ? (legalAreaLabels[lead.legal_area] || lead.legal_area) : null} />
            <Detail label="Urgência" value={lead.urgency} />
            <Detail label="Notas" value={lead.notes} />
          </div>

          <Separator />

          {/* AI */}
          <div className="space-y-2 text-sm">
            <Detail label="AI Score" value={lead.ai_score != null ? String(lead.ai_score) : null} />
            <Detail label="AI Viabilidade" value={lead.ai_viability} />
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Criado: {format(parseISO(lead.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}</p>
            <p>Atualizado: {format(parseISO(lead.updated_at), "dd/MM/yyyy HH:mm", { locale: pt })}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>
              <Pencil className="mr-1 h-3 w-3" /> Editar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(lead.id)}>
              <Trash2 className="mr-1 h-3 w-3" /> Eliminar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-medium text-muted-foreground">{label}:</span>{" "}
      <span className="text-foreground">{value}</span>
    </div>
  );
}
