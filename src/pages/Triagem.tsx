import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Constants, Tables } from "@/integrations/supabase/types";
import { differenceInHours, differenceInMinutes, parseISO, format } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { useAiTriage } from "@/hooks/useAiTriage";
import { ChevronRight, Clock, AlertTriangle, AlertCircle, CheckCircle, Sparkles, Loader2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

type Lead = Tables<"leads">;

const legalAreaLabels: Record<string, string> = {
  previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
  trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
  tributario: "Tributário", outro: "Outro",
};

const originLabels: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", email: "Email",
  landing_page: "Landing Page", outro: "Outro",
};

function getSlaInfo(slaExpiresAt: string | null) {
  if (!slaExpiresAt) return { label: "Sem SLA", variant: "outline" as const, urgent: false };
  const now = new Date();
  const expires = parseISO(slaExpiresAt);
  const minutesLeft = differenceInMinutes(expires, now);
  const hoursLeft = differenceInHours(expires, now);
  if (minutesLeft <= 0) return { label: "Expirado", variant: "destructive" as const, urgent: true };
  if (hoursLeft < 4) return { label: `${hoursLeft}h ${minutesLeft % 60}m`, variant: "default" as const, urgent: true };
  return { label: `${hoursLeft}h`, variant: "secondary" as const, urgent: false };
}

const TriagemPage = () => {
  const { dateFnsLocale } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const aiTriageMutation = useAiTriage();
  const [triagingLeadId, setTriagingLeadId] = useState<string | null>(null);

  // Triage form state
  const [legalArea, setLegalArea] = useState("outro");
  const [urgency, setUrgency] = useState("normal");
  const [notes, setNotes] = useState("");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", "triagem"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("funnel_stage", "triagem")
        .order("sla_expires_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const triageMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("leads")
        .update({
          legal_area: legalArea as any,
          urgency,
          notes: notes || null,
          funnel_stage: "proposta" as any,
        })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSheetOpen(false);
      setSelectedLead(null);
      toast({ title: "Triagem concluída — lead avançou para Proposta" });
    },
    onError: (e: any) => {
      toast({ title: "Erro na triagem", description: e.message, variant: "destructive" });
    },
  });

  const openTriage = (lead: Lead) => {
    setSelectedLead(lead);
    setLegalArea(lead.legal_area || "outro");
    setUrgency(lead.urgency || "normal");
    setNotes(lead.notes || "");
    setSheetOpen(true);
  };

  // Stats
  const expired = leads.filter(l => {
    if (!l.sla_expires_at) return false;
    return differenceInMinutes(parseISO(l.sla_expires_at), new Date()) <= 0;
  }).length;
  const urgent = leads.filter(l => l.urgency === "critica" || l.urgency === "alta").length;

  return (
    <div className="space-y-4">
      <PageHeader title="Triagem com IA" description="Classificação e análise inteligente de leads">
        <Button
          onClick={async () => {
            for (const lead of leads) {
              setTriagingLeadId(lead.id);
              try {
                await aiTriageMutation.mutateAsync(lead.id);
              } catch { /* toast already shown */ }
            }
            setTriagingLeadId(null);
          }}
          disabled={leads.length === 0 || aiTriageMutation.isPending}
          className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-full"
        >
          {aiTriageMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Classificar Todos com IA
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-2xl font-bold">{leads.length}</p>
            <p className="text-xs text-muted-foreground">Pendentes de triagem</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <div>
            <p className="text-2xl font-bold">{urgent}</p>
            <p className="text-xs text-muted-foreground">Urgência alta/crítica</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-2xl font-bold">{expired}</p>
            <p className="text-xs text-muted-foreground">SLA expirado</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Área Jurídica</TableHead>
              <TableHead>Urgência</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-28">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">A carregar...</TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
                  <p className="text-muted-foreground">Nenhum lead pendente de triagem</p>
                </TableCell>
              </TableRow>
            ) : leads.map((lead) => {
              const sla = getSlaInfo(lead.sla_expires_at);
              return (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openTriage(lead)}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-sm">{originLabels[lead.origin] || lead.origin}</TableCell>
                  <TableCell className="text-sm">{lead.legal_area ? legalAreaLabels[lead.legal_area] || lead.legal_area : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={lead.urgency === "critica" ? "destructive" : lead.urgency === "alta" ? "default" : "secondary"} className="text-xs">
                      {lead.urgency || "normal"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sla.variant} className="text-xs">{sla.label}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(parseISO(lead.created_at), "dd/MM HH:mm", { locale: dateFnsLocale })}
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openTriage(lead); }}>
                      Triar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setTriagingLeadId(lead.id);
                        try {
                          const result = await aiTriageMutation.mutateAsync(lead.id);
                          // If sheet is open for this lead, update form state
                          if (selectedLead?.id === lead.id) {
                            setLegalArea(result.legal_area);
                            setUrgency(result.urgency);
                            setNotes(result.notes);
                          }
                        } catch { /* toast shown */ }
                        setTriagingLeadId(null);
                      }}
                      disabled={triagingLeadId === lead.id}
                    >
                      {triagingLeadId === lead.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Triage Sheet */}
      {selectedLead && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-[400px] sm:w-[480px]">
            <SheetHeader>
              <SheetTitle>Triagem — {selectedLead.name}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="font-medium text-muted-foreground">Email:</span> {selectedLead.email || "—"}</p>
                <p><span className="font-medium text-muted-foreground">Telefone:</span> {selectedLead.phone || "—"}</p>
                <p><span className="font-medium text-muted-foreground">Origem:</span> {originLabels[selectedLead.origin] || selectedLead.origin}</p>
              </div>

              <div className="space-y-3 p-3 rounded-md border border-primary/20 bg-primary/5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Área Jurídica</Label>
                    <Select value={legalArea} onValueChange={setLegalArea}>
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
                    <Select value={urgency} onValueChange={setUrgency}>
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
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="text-xs"
                    placeholder="Resumo do caso, motivo do contacto..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      setTriagingLeadId(selectedLead.id);
                      try {
                        const result = await aiTriageMutation.mutateAsync(selectedLead.id);
                        setLegalArea(result.legal_area);
                        setUrgency(result.urgency);
                        setNotes(result.notes);
                      } catch { /* toast shown */ }
                      setTriagingLeadId(null);
                    }}
                    disabled={triagingLeadId === selectedLead.id}
                  >
                    {triagingLeadId === selectedLead.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                    Classificar com IA
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => triageMutation.mutate(selectedLead.id)}
                    disabled={triageMutation.isPending}
                  >
                    <ChevronRight className="mr-1 h-3 w-3" />
                    {triageMutation.isPending ? "A processar..." : "Concluir Triagem"}
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

export default TriagemPage;
