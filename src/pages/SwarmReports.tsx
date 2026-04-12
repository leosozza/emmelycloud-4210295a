import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, ChevronDown, ChevronUp, RefreshCw, Calendar, Sparkles } from "lucide-react";

interface SwarmReport {
  id: string;
  persona_id: string | null;
  report_type: string;
  title: string;
  content: string;
  data_snapshot: any;
  period_start: string;
  period_end: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  daily_summary: "Diário",
  weekly_analysis: "Semanal",
  anomaly_alert: "Anomalia",
};

export default function SwarmReportsPage() {
  const [reports, setReports] = useState<SwarmReport[]>([]);
  const [filter, setFilter] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { loadReports(); }, [filter]);

  async function loadReports() {
    let q = supabase.from("swarm_reports").select("*").order("created_at", { ascending: false }).limit(50);
    if (filter !== "all") q = q.eq("report_type", filter);
    const { data } = await q;
    setReports((data as any[]) || []);
  }

  async function generateNow(type: string) {
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke("report-agent", {
        body: { report_type: type },
      });
      if (error) throw error;
      toast.success("Relatório gerado!");
      loadReports();
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar relatório");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios Swarm" description="Relatórios automáticos gerados por IA sobre performance do escritório.">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="daily_summary">Diário</SelectItem>
              <SelectItem value="weekly_analysis">Semanal</SelectItem>
              <SelectItem value="anomaly_alert">Anomalia</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => generateNow("daily_summary")} disabled={generating}>
            <Sparkles className="h-4 w-4 mr-2" />{generating ? "A gerar..." : "Gerar Diário"}
          </Button>
          <Button variant="outline" onClick={() => generateNow("weekly_analysis")} disabled={generating}>
            <RefreshCw className="h-4 w-4 mr-2" />Gerar Semanal
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-4">
        {reports.map((report) => (
          <Collapsible key={report.id} open={expanded === report.id} onOpenChange={(o) => setExpanded(o ? report.id : null)}>
            <Card>
              <CollapsibleTrigger className="w-full text-left">
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{report.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[report.report_type] || report.report_type}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(report.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                  {expanded === report.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <ScrollArea className="max-h-[600px]">
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                      {report.content}
                    </div>
                  </ScrollArea>
                  {report.data_snapshot && (
                    <details className="mt-4">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Ver dados brutos</summary>
                      <pre className="text-xs mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-60">
                        {JSON.stringify(report.data_snapshot, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
        {!reports.length && (
          <Card className="flex items-center justify-center py-16">
            <p className="text-muted-foreground">Nenhum relatório gerado ainda. Clique em "Gerar" para criar o primeiro.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
