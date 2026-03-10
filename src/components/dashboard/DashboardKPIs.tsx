import {
  Users, Clock, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, Briefcase, FileSignature,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useDashboardKPIs } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  up?: boolean;
  icon: React.ElementType;
  description: string;
  accentClass: string;
  delay: number;
}

function KPICard({ title, value, change, up, icon: Icon, description, accentClass, delay }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className={`relative overflow-hidden p-4 border-l-4 ${accentClass} hover:shadow-md transition-shadow`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
          {change && (
            <div className={`flex items-center gap-0.5 text-xs font-semibold ${up ? "text-success" : "text-destructive"}`}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {change}
            </div>
          )}
        </div>
        <div className="text-2xl font-extrabold text-foreground">{value}</div>
        <div className="text-xs font-medium text-muted-foreground mt-1">{title}</div>
        <div className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</div>
      </Card>
    </motion.div>
  );
}

export function DashboardKPIs() {
  const { formatCurrency } = useLocale();
  const { data, isLoading } = useDashboardKPIs();

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="p-4 space-y-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-24" />
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
      accentClass: "border-l-primary",
    },
    {
      title: "SLA Expirando",
      value: String(data?.slaExpiring ?? 0),
      change: "",
      up: false,
      icon: Clock,
      description: "Nas próximas 4h",
      accentClass: "border-l-warning",
    },
    {
      title: "Receita do Mês",
      value: formatCurrency(data?.revenueThisMonth ?? 0),
      change: `${(data?.revenueChange ?? 0) >= 0 ? "+" : ""}${data?.revenueChange ?? 0}%`,
      up: (data?.revenueChange ?? 0) >= 0,
      icon: DollarSign,
      description: "vs. mês anterior",
      accentClass: "border-l-success",
    },
    {
      title: "Taxa de Conversão",
      value: `${data?.conversionRate ?? 0}%`,
      change: "",
      up: true,
      icon: TrendingUp,
      description: "Lead → Contrato",
      accentClass: "border-l-info",
    },
    {
      title: "Casos Ativos",
      value: String(data?.activeCases ?? 0),
      change: "",
      up: true,
      icon: Briefcase,
      description: "Em andamento",
      accentClass: "border-l-accent-foreground",
    },
    {
      title: "Contratos Pendentes",
      value: String(data?.pendingContracts ?? 0),
      change: "",
      up: false,
      icon: FileSignature,
      description: "Aguardando assinatura",
      accentClass: "border-l-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric, i) => (
        <KPICard
          key={metric.title}
          {...metric}
          change={metric.change || undefined}
          delay={i * 0.08}
        />
      ))}
    </div>
  );
}
