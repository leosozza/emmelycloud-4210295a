import {
  Users, Clock, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, Briefcase, FileSignature,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { useDashboardKPIs } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardKPIs() {
  const { formatCurrency } = useLocale();
  const { data, isLoading } = useDashboardKPIs();

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-0 shadow-lg">
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metrics = [
    {
      title: "Leads Novos",
      value: String(data?.leadsNew ?? 0),
      change: `${(data?.leadsChange ?? 0) >= 0 ? "+" : ""}${data?.leadsChange ?? 0}%`,
      up: (data?.leadsChange ?? 0) >= 0,
      icon: Users,
      description: "Últimos 30 dias",
      gradient: "from-[hsl(218,72%,50%)] to-[hsl(218,72%,62%)]",
    },
    {
      title: "SLA Expirando",
      value: String(data?.slaExpiring ?? 0),
      change: "",
      up: false,
      icon: Clock,
      description: "Nas próximas 4h",
      gradient: "from-[hsl(38,92%,50%)] to-[hsl(38,92%,62%)]",
    },
    {
      title: "Receita do Mês",
      value: formatCurrency(data?.revenueThisMonth ?? 0),
      change: `${(data?.revenueChange ?? 0) >= 0 ? "+" : ""}${data?.revenueChange ?? 0}%`,
      up: (data?.revenueChange ?? 0) >= 0,
      icon: DollarSign,
      description: "vs. mês anterior",
      gradient: "from-[hsl(152,69%,46%)] to-[hsl(152,69%,58%)]",
    },
    {
      title: "Taxa de Conversão",
      value: `${data?.conversionRate ?? 0}%`,
      change: "",
      up: true,
      icon: TrendingUp,
      description: "Lead → Contrato",
      gradient: "from-[hsl(270,30%,52%)] to-[hsl(270,30%,64%)]",
    },
    {
      title: "Casos Ativos",
      value: String(data?.activeCases ?? 0),
      change: "",
      up: true,
      icon: Briefcase,
      description: "Em andamento",
      gradient: "from-[hsl(200,60%,50%)] to-[hsl(200,60%,62%)]",
    },
    {
      title: "Contratos Pendentes",
      value: String(data?.pendingContracts ?? 0),
      change: "",
      up: false,
      icon: FileSignature,
      description: "Aguardando assinatura",
      gradient: "from-[hsl(340,60%,50%)] to-[hsl(340,60%,62%)]",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <Card key={metric.title} className={`bg-gradient-to-br ${metric.gradient} text-white border-0 shadow-lg hover:shadow-xl transition-shadow`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <metric.icon className="h-6 w-6 opacity-80" />
              {metric.change && (
                <div className="flex items-center gap-0.5">
                  {metric.up ? <ArrowUpRight className="h-3 w-3 opacity-80" /> : <ArrowDownRight className="h-3 w-3 opacity-80" />}
                  <span className="text-xs font-bold opacity-90">{metric.change}</span>
                </div>
              )}
            </div>
            <div className="text-2xl font-extrabold">{metric.value}</div>
            <div className="text-xs font-medium opacity-75 mt-1">{metric.title}</div>
            <div className="text-[11px] opacity-60 mt-0.5">{metric.description}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
