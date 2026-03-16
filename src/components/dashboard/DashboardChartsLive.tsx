import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

function ChartSkeleton() {
  return <Skeleton className="h-[250px] w-full rounded-xl" />;
}

interface LeadsByOriginChartProps {
  data?: { name: string; value: number }[];
  isLoading?: boolean;
}

export function LeadsByOriginChart({ data, isLoading }: LeadsByOriginChartProps) {
  return (
    <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-base font-bold">Leads por Origem</CardTitle>
        <CardDescription>Distribuição dos canais de aquisição</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {(data || []).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(data || []).map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground truncate">{item.name}</span>
                  <span className="ml-auto font-semibold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface RevenueByAreaChartProps {
  data?: { area: string; receita: number }[];
  isLoading?: boolean;
}

export function RevenueByAreaChart({ data, isLoading }: RevenueByAreaChartProps) {
  const { formatCurrency, currencySymbol } = useLocale();

  return (
    <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-base font-bold">Receita por Área</CardTitle>
        <CardDescription>Faturamento por área jurídica</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis type="number" tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="area" fontSize={12} width={80} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="receita" fill="hsl(var(--chart-1))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MonthlyRevenueChartProps {
  data?: { month: string; receita: number }[];
  isLoading?: boolean;
}

export function MonthlyRevenueChart({ data, isLoading }: MonthlyRevenueChartProps) {
  const { formatCurrency, currencySymbol } = useLocale();

  return (
    <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-base font-bold">Tendência de Receita</CardTitle>
        <CardDescription>Evolução mensal do faturamento</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="month" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="receita" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="url(#revenueGradient)" dot={{ fill: "hsl(var(--chart-1))", r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FunnelChartWidgetProps {
  data?: { name: string; value: number }[];
  isLoading?: boolean;
}

export function FunnelChartWidget({ data, isLoading }: FunnelChartWidgetProps) {
  return (
    <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-base font-bold">Funil de Vendas</CardTitle>
        <CardDescription>Distribuição por etapa do funil</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis type="number" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" fontSize={11} width={70} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {(data || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
