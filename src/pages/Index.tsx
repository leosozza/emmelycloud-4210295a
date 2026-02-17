import { 
  Users, 
  Clock, 
  DollarSign, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { RecentLeads } from "@/components/dashboard/RecentLeads";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PageHeader } from "@/components/PageHeader";

const Index = () => {
  const { formatCurrency } = useLocale();

  const metrics = [
    {
      title: "Leads Novos",
      value: "47",
      change: "+12%",
      up: true,
      icon: Users,
      description: "Últimos 30 dias",
      gradient: "from-[hsl(218,72%,50%)] to-[hsl(218,72%,62%)]",
    },
    {
      title: "SLA Expirando",
      value: "5",
      change: "-2",
      up: false,
      icon: Clock,
      description: "Nas próximas 4h",
      gradient: "from-[hsl(38,92%,50%)] to-[hsl(38,92%,62%)]",
    },
    {
      title: "Receita do Mês",
      value: formatCurrency(32450),
      change: "+8%",
      up: true,
      icon: DollarSign,
      description: "vs. mês anterior",
      gradient: "from-[hsl(152,69%,46%)] to-[hsl(152,69%,58%)]",
    },
    {
      title: "Taxa de Conversão",
      value: "34%",
      change: "+3pp",
      up: true,
      icon: TrendingUp,
      description: "Lead → Contrato",
      gradient: "from-[hsl(270,30%,52%)] to-[hsl(270,30%,64%)]",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral do escritório" />

      {/* Metric Cards with gradients */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title} className={`bg-gradient-to-br ${metric.gradient} text-white border-0 shadow-lg hover:shadow-xl transition-shadow`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <metric.icon className="h-6 w-6 opacity-80" />
                <div className="flex items-center gap-0.5">
                  {metric.up ? (
                    <ArrowUpRight className="h-3 w-3 opacity-80" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 opacity-80" />
                  )}
                  <span className="text-xs font-bold opacity-90">{metric.change}</span>
                </div>
              </div>
              <div className="text-3xl font-extrabold">{metric.value}</div>
              <div className="text-xs font-medium opacity-75 mt-1">{metric.title}</div>
              <div className="text-[11px] opacity-60 mt-0.5">{metric.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content + Sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <DashboardCharts />
          <RecentLeads />
        </div>
        <DashboardSidebar />
      </div>
    </div>
  );
};

export default Index;
