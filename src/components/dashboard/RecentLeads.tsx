import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { Star } from "lucide-react";

const stageLabels: Record<string, string> = {
  lead: "Lead", triagem: "Triagem", proposta: "Proposta", analise: "Análise",
  contrato: "Contrato", financeiro: "Financeiro", fechado: "Fechado",
};
const stageColors: Record<string, string> = {
  lead: "bg-info/15 text-info border-info/20",
  triagem: "bg-warning/15 text-warning border-warning/20",
  proposta: "bg-accent text-accent-foreground",
  analise: "bg-primary/10 text-primary",
  contrato: "bg-success/15 text-success border-success/20",
  financeiro: "bg-success/15 text-success border-success/20",
  fechado: "bg-muted text-muted-foreground",
};
const originLabels: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", email: "Email",
  landing_page: "Landing Page", outro: "Outro",
};

function ScoreStars({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const stars = Math.round((score / 100) * 5);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3 w-3 ${i <= stars ? "text-warning fill-warning" : "text-muted-foreground/20"}`} />
      ))}
    </div>
  );
}

export function RecentLeads() {
  const navigate = useNavigate();
  const { dateFnsLocale } = useLocale();

  const { data: leads = [] } = useQuery({
    queryKey: ["recent-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-bold">Últimos Leads</CardTitle>
        <Button variant="outline" size="sm" className="text-xs rounded-lg" onClick={() => navigate("/leads")}>
          Ver todos
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Nenhum lead encontrado</p>
          ) : leads.map((lead) => (
            <div key={lead.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate("/leads")}>
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                  {lead.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{lead.name}</span>
                  <Badge variant="outline" className={`text-[10px] shrink-0 rounded-full px-2 ${stageColors[lead.funnel_stage]}`}>
                    {stageLabels[lead.funnel_stage]}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {originLabels[lead.origin]} · {format(parseISO(lead.created_at), "dd/MM/yyyy", { locale: dateFnsLocale })}
                </div>
              </div>
              <div className="shrink-0">
                <ScoreStars score={lead.ai_score} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
