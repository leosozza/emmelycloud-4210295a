import {
  Users, Clock, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, Briefcase, FileSignature,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useDashboardKPIs } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedGradient } from "@/components/ui/animated-gradient-with-svg";
import { motion } from "framer-motion";

interface BentoKPIProps {
  title: string;
  value: string;
  change?: string;
  up?: boolean;
  icon: React.ElementType;
  description: string;
  colors: string[];
  delay: number;
}

function BentoKPI({ title, value, change, up, icon: Icon, description, colors, delay }: BentoKPIProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: delay + 0.3 },
    },
  };

  const item = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.5 } },
  };

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl border-0 shadow-lg hover:shadow-xl transition-shadow"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <AnimatedGradient colors={colors} speed={12} blur="medium" />
      <motion.div
        className="relative z-10 p-5 text-white"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="flex items-center justify-between mb-3">
          <Icon className="h-6 w-6 opacity-80" />
          {change && (
            <div className="flex items-center gap-0.5">
              {up ? <ArrowUpRight className="h-3 w-3 opacity-80" /> : <ArrowDownRight className="h-3 w-3 opacity-80" />}
              <span className="text-xs font-bold opacity-90">{change}</span>
            </div>
          )}
        </motion.div>
        <motion.div variants={item} className="text-2xl font-extrabold">{value}</motion.div>
        <motion.div variants={item} className="text-xs font-medium opacity-75 mt-1">{title}</motion.div>
        <motion.div variants={item} className="text-[11px] opacity-60 mt-0.5">{description}</motion.div>
      </motion.div>
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
          <div key={i} className="rounded-xl bg-muted/50 p-5 space-y-3">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
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
      colors: ["#2283d8", "#4a9fe5", "#7b5ea7", "#2283d8"],
    },
    {
      title: "SLA Expirando",
      value: String(data?.slaExpiring ?? 0),
      change: "",
      up: false,
      icon: Clock,
      description: "Nas próximas 4h",
      colors: ["#e8a838", "#f0c060", "#d4903c", "#e8a838"],
    },
    {
      title: "Receita do Mês",
      value: formatCurrency(data?.revenueThisMonth ?? 0),
      change: `${(data?.revenueChange ?? 0) >= 0 ? "+" : ""}${data?.revenueChange ?? 0}%`,
      up: (data?.revenueChange ?? 0) >= 0,
      icon: DollarSign,
      description: "vs. mês anterior",
      colors: ["#34a853", "#5dc576", "#2d8f47", "#34a853"],
    },
    {
      title: "Taxa de Conversão",
      value: `${data?.conversionRate ?? 0}%`,
      change: "",
      up: true,
      icon: TrendingUp,
      description: "Lead → Contrato",
      colors: ["#7b5ea7", "#9b7ec8", "#5e4287", "#7b5ea7"],
    },
    {
      title: "Casos Ativos",
      value: String(data?.activeCases ?? 0),
      change: "",
      up: true,
      icon: Briefcase,
      description: "Em andamento",
      colors: ["#3b82b8", "#5a9fd0", "#2d6a9f", "#3b82b8"],
    },
    {
      title: "Contratos Pendentes",
      value: String(data?.pendingContracts ?? 0),
      change: "",
      up: false,
      icon: FileSignature,
      description: "Aguardando assinatura",
      colors: ["#d44060", "#e06080", "#b83050", "#d44060"],
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric, i) => (
        <BentoKPI
          key={metric.title}
          {...metric}
          change={metric.change || undefined}
          delay={i * 0.1}
        />
      ))}
    </div>
  );
}
