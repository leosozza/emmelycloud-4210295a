import { 
  Users, 
  Clock, 
  DollarSign, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { RecentLeads } from "@/components/dashboard/RecentLeads";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

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
      bg: "bg-primary",
    },
    {
      title: "SLA Expirando",
      value: "5",
      change: "-2",
      up: false,
      icon: Clock,
      description: "Nas próximas 4h",
      bg: "bg-warning",
    },
    {
      title: "Receita do Mês",
      value: formatCurrency(32450),
      change: "+8%",
      up: true,
      icon: DollarSign,
      description: "vs. mês anterior",
      bg: "bg-success",
    },
    {
      title: "Taxa de Conversão",
      value: "34%",
      change: "+3pp",
      up: true,
      icon: TrendingUp,
      description: "Lead → Contrato",
      bg: "bg-accent",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do escritório</p>
      </div>

      {/* Colorful Metric Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title} className={`${metric.bg} text-white border-0 shadow-lg hover:shadow-xl transition-shadow`}>
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
