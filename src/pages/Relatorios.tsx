import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportFiltersBar } from "@/components/relatorios/ReportFilters";
import { LeadsReport } from "@/components/relatorios/LeadsReport";
import { FinancialReport } from "@/components/relatorios/FinancialReport";
import { AtendimentoReport } from "@/components/relatorios/AtendimentoReport";
import { PerformanceReport } from "@/components/relatorios/PerformanceReport";
import { useLeadsReport, useFinancialReport, useAtendimentoReport, usePerformanceReport, useReportProfiles, type ReportFilters } from "@/hooks/useReportsData";
import { startOfMonth, endOfMonth } from "date-fns";
import { BarChart3, DollarSign, MessageSquare, Award } from "lucide-react";

const RelatoriosPage = () => {
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date()),
    legalArea: null,
    responsibleId: null,
  });

  const { data: profiles } = useReportProfiles();
  const leadsReport = useLeadsReport(filters);
  const financialReport = useFinancialReport(filters);
  const atendimentoReport = useAtendimentoReport(filters);
  const performanceReport = usePerformanceReport(filters);

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios & Inteligência" description="Métricas, benchmarks e previsões" />

      <ReportFiltersBar filters={filters} onFiltersChange={setFilters} profiles={profiles || []} />

      <Tabs defaultValue="leads" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto scrollbar-none justify-start md:grid md:grid-cols-4 h-auto p-1">
          <TabsTrigger value="leads" className="gap-1.5 shrink-0 whitespace-nowrap">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Leads</span>
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="gap-1.5 shrink-0 whitespace-nowrap">
            <DollarSign className="h-3.5 w-3.5" />
            <span>Financeiro</span>
          </TabsTrigger>
          <TabsTrigger value="atendimento" className="gap-1.5 shrink-0 whitespace-nowrap">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Atendimento</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5 shrink-0 whitespace-nowrap">
            <Award className="h-3.5 w-3.5" />
            <span>Performance</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          <LeadsReport data={leadsReport.data} isLoading={leadsReport.isLoading} />
        </TabsContent>

        <TabsContent value="financeiro">
          <FinancialReport data={financialReport.data} isLoading={financialReport.isLoading} />
        </TabsContent>

        <TabsContent value="atendimento">
          <AtendimentoReport data={atendimentoReport.data} isLoading={atendimentoReport.isLoading} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceReport data={performanceReport.data} isLoading={performanceReport.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RelatoriosPage;
