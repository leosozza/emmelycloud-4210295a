import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";
import { differenceInHours, differenceInMinutes, parseISO, format } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { ChevronRight, Pencil, Trash2, FileText, ExternalLink, ClipboardCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

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
  onCreateProposal?: (lead: Lead) => void;
}

export function LeadSheet({ lead, open, onOpenChange, onEdit, onDelete, onMoveStage, onCreateProposal }: LeadSheetProps) {
  if (!lead || !open) return null;
  return <LeadSheetContent lead={lead} onOpenChange={onOpenChange} onEdit={onEdit} onDelete={onDelete} onMoveStage={onMoveStage} onCreateProposal={onCreateProposal} />;
}

function LeadSheetContent({ lead, onOpenChange, onEdit, onDelete, onMoveStage, onCreateProposal }: Omit<LeadSheetProps, 'open'> & { lead: Lead }) {
  const { dateFnsLocale } = useLocale();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sla = getSlaInfo(lead.sla_expires_at);
  const stages = Constants.public.Enums.funnel_stage;

  // Triage state
  const [triageLegalArea, setTriageLegalArea] = useState<string>(lead.legal_area || "outro");
  const [triageUrgency, setTriageUrgency] = useState<string>(lead.urgency || "normal");
  const [triageNotes, setTriageNotes] = useState<string>(lead.notes || "");

  const isTriageStage = lead.funnel_stage === "triagem";

  // Query associated case for this lead
  const { data: linkedCase } = useQuery({
    queryKey: ["lead-case", lead.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("cases")
        .select("id, title")
        .eq("lead_id", lead.id)
        .limit(1);
      return data?.[0] || null;
    },
  });

  // Triage mutation
  const triageMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("leads")
        .update({
          legal_area: triageLegalArea as any,
          urgency: triageUrgency,
          notes: triageNotes || null,
          funnel_stage: "proposta" as any,
        })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Triagem concluída — lead avançou para Proposta" });
    },
    onError: (e: any) => {
      toast({ title: "Erro na triagem", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
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
            {stages.map((s) => (
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

          {/* Inline Triage Section */}
          {isTriageStage && (
            <>
              <div className="space-y-3 p-3 rounded-md border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <ClipboardCheck className="h-4 w-4" />
                  Triagem
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Área Jurídica</Label>
                    <Select value={triageLegalArea} onValueChange={setTriageLegalArea}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Constants.public.Enums.legal_area.map((a) => (
                          <SelectItem key={a} value={a}>{legalAreaLabels[a] || a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Urgência</Label>
                    <Select value={triageUrgency} onValueChange={setTriageUrgency}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notas de Triagem</Label>
                  <Textarea
                    value={triageNotes}
                    onChange={(e) => setTriageNotes(e.target.value)}
                    rows={3}
                    className="text-xs"
                    placeholder="Resumo do caso, motivo do contacto..."
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => triageMutation.mutate()}
                  disabled={triageMutation.isPending}
                >
                  <ChevronRight className="mr-1 h-3 w-3" />
                  {triageMutation.isPending ? "A processar..." : "Concluir Triagem e Avançar para Proposta"}
                </Button>
              </div>
              <Separator />
            </>
          )}

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
            <p>Criado: {format(parseISO(lead.created_at), "dd/MM/yyyy HH:mm", { locale: dateFnsLocale })}</p>
            <p>Atualizado: {format(parseISO(lead.updated_at), "dd/MM/yyyy HH:mm", { locale: dateFnsLocale })}</p>
          </div>

          {/* Linked Case */}
          {linkedCase && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Caso associado:</span>
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-sm"
                  onClick={() => { onOpenChange(false); navigate("/casos"); }}
                >
                  {linkedCase.title} <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>
              <Pencil className="mr-1 h-3 w-3" /> Editar
            </Button>
            {onCreateProposal && (
              <Button variant="outline" size="sm" onClick={() => onCreateProposal(lead)}>
                <FileText className="mr-1 h-3 w-3" /> Criar Proposta
              </Button>
            )}
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
